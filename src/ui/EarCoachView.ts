import { ItemView, Notice, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import {
  ListeningSessionData,
  TranscriptSegment,
  UnlockStep,
} from "../types/transcript";
import { SegmentTimeIndex } from "../utils/binarySearch";
import { followTargetIndex, shouldAutoFollow, USER_SCROLL_PAUSE_MS } from "../utils/loopControl";
import { isMobileApp } from "../utils/platform";
import { isReviewDue, shouldGraduate, withReview } from "../utils/reviewQueue";
import { pickTodaySentences, wrongBlankSegmentIndices } from "../utils/todaySentences";
import { renderWarmupBanner } from "./warmupBanner";
import { QuizOffer, renderQuizBanner, yesterdayQuizOffer } from "../features/yesterdayQuiz";
import { ResumePosition } from "./resumePosition";
import { setupMobileTouchResizer, setupTutorResizer } from "./paneResizers";
import { PlayerBar } from "./components/PlayerBar";
import { setupMobileTypingMode } from "./mobileTypingMode";
import { VirtualSegmentList } from "./components/VirtualSegmentList";
import { AgyTutorPanel } from "./components/AgyTutorPanel";
import { captureSnapshot } from "./snapshot";
import { DictionaryModal } from "./DictionaryModal";
import { saveSentenceCard } from "./sentenceAnki";
import { notifyRetry } from "./notify";
import { ANKI_MESSAGES } from "../services/anki";
import { diagnostics } from "../services/diagnostics";
import type EarCoachPlugin from "../main";

export const VIEW_TYPE_EAR_COACH = "ear-coach-listening-view";

type FilterMode = "ALL" | "PINNED" | "DUE" | "SPEED_SPIKE";

/**
 * Main interactive workspace view inside Obsidian.
 * Coordinates the persistent YouTube A-B loop player, dynamic-height virtualized segment list,
 * 3-step ear unlocker, and 1:1 `agy` Sound Doctor without blocking the main thread.
 */
export class EarCoachView extends ItemView {
  private session: ListeningSessionData | null = null;
  private activeNoteFile: TFile | null = null;
  private timeIndex = new SegmentTimeIndex();
  private playerBar: PlayerBar | null = null;
  private tutorPanel: AgyTutorPanel | null = null;
  private virtualList: VirtualSegmentList | null = null;

  private lastActiveSegmentIdx = -1;
  private manualLockSegmentIdx = -1;
  private manualLockUntil = 0;
  private filterMode: FilterMode = "ALL";
  /** SPEC_044: 오늘 전에 틀린 빈칸이 있는 문장 번호(영상 열 때 learning.json에서), 줄 닫음 */
  private wrongBlankIdx: number[] = [];
  private quizOffer: QuizOffer | null = null; // SPEC_050
  private warmupClosed = false;
  private resume = new ResumePosition(() => this.session, () => this.playerBar, (i) => this.scrollToSegment(i), () => this.plugin.learning); // SPEC_046

  private isShellMounted = false;
  private toolbarEl: HTMLElement | null = null;
  private listContainerEl: HTMLElement | null = null;
  private tutorContainerEl: HTMLElement | null = null;
  private boundKeyHandler: (ev: KeyboardEvent) => void;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: EarCoachPlugin
  ) {
    super(leaf);
    this.boundKeyHandler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();

        if (this.tutorPanel && this.tutorContainerEl && !this.tutorContainerEl.hasClass("is-hidden")) {
          this.tutorPanel.close();
        } else if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    };
  }

  public getViewType(): string {
    return VIEW_TYPE_EAR_COACH;
  }

  public getDisplayText(): string {
    return this.session ? `🎧 ${this.session.title}` : "🎧 Ear-Coach 리스닝 코치";
  }

  public getIcon(): string {
    return "headphones";
  }

  public getState(): Record<string, unknown> {
    return {
      filePath: this.activeNoteFile?.path ?? null,
      videoId: this.session?.videoId ?? null,
    };
  }

  public async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    const s = state as { filePath?: string | null; videoId?: string | null } | null;
    if (s && (s.filePath || s.videoId)) {
      if (this.session && s.videoId && this.session.videoId === s.videoId) {
        return;
      }
      await this.plugin.restoreSessionForView(this, s.filePath, s.videoId);
    }
  }

  public async onOpen(): Promise<void> {
    this.containerEl.addEventListener("keydown", this.boundKeyHandler, { capture: true });
    this.renderWorkspace();
  }

  public async onClose(): Promise<void> {
    this.resume.flush(); // SPEC_046
    this.containerEl.removeEventListener("keydown", this.boundKeyHandler, { capture: true });
    this.typingCleanup?.();
    this.typingCleanup = null;
    this.virtualList?.destroy();
    this.virtualList = null;
    this.playerBar?.destroy();
    this.playerBar = null;
    this.tutorPanel?.stopActiveStream();
    this.tutorPanel = null;
    this.isShellMounted = false;
  }

  public async loadSession(
    session: ListeningSessionData,
    noteFile: TFile | null,
    focusTimestampSec?: number
  ): Promise<void> {
    this.session = session;
    this.activeNoteFile = noteFile;
    this.filterMode = "ALL";
    this.wrongBlankIdx = [];
    this.warmupClosed = false;
    this.timeIndex.setSegments(session.segments);
    this.lastActiveSegmentIdx = -1;
    this.manualLockSegmentIdx = -1;
    this.manualLockUntil = 0;

    try {
      (this.leaf as any).updateHeader?.();
      this.app.workspace.requestSaveLayout();
    } catch { /* Ignore leaf header update errors */ }

    this.renderWorkspace();
    void this.loadWrongBlanks();
    this.resume.open(session, focusTimestampSec); // SPEC_046

    if (focusTimestampSec !== undefined) {
      const nearestIdx = this.timeIndex.findNearestSegmentIndex(focusTimestampSec);
      if (nearestIdx >= 0 && session.segments[nearestIdx]) {
        const targetSeg = session.segments[nearestIdx];
        this.scrollToSegment(targetSeg.index);
        this.playerBar?.playSegment(targetSeg, true);
      }
    }
  }

  private renderWorkspace(): void {
    const root = this.contentEl;
    root.addClass("ear-coach-workspace-root");

    if (!this.session) {
      this.destroyShell();
      root.empty();
      const emptyBox = root.createDiv({ cls: "ear-coach-empty-state" });
      emptyBox.createEl("h3", { text: "🎧 Obsidian Ear-Coach" });
      emptyBox.createEl("p", {
        text: "유튜브 URL로 리스닝 노트를 생성하거나, 생성된 리스닝 노트를 열어 귀 틔우기 훈련을 시작하세요!",
      });
      const newBtn = emptyBox.createEl("button", {
        cls: "ear-coach-btn ear-coach-btn-primary",
        text: "➕ 유튜브 URL로 새 리스닝 노트 만들기",
      });
      newBtn.addEventListener("click", () => this.plugin.openUrlInputModal());
      return;
    }

    // Fast Path: Reuse already-mounted persistent shell & YouTube IFrame without full DOM rebuild
    if (this.isShellMounted && this.toolbarEl && this.virtualList && this.playerBar) {
      this.toolbarEl.empty();
      this.renderToolbar(this.toolbarEl);
      this.tutorPanel?.close();
      this.updateVirtualListSegments();
      this.playerBar.render(this.session.videoId);
      return;
    }

    root.empty();

    if (isMobileApp()) {
      this.renderMobileWorkspace(root);
    } else {
      this.renderDesktopWorkspace(root);
    }
  }

  /**
   * Desktop-only two-column Side-by-Side workspace layout (Left: Transcript + Resizable Tutor Drawer, Right: Video Player).
   */
  private renderDesktopWorkspace(root: HTMLElement): void {
    if (!this.session) return;
    const sideBySideContainer = root.createDiv({
      cls: "ear-coach-side-by-side-container",
    });

    // --- LEFT COLUMN: Toolbar & Virtualized Segment List + Bottom Drawer Tutor Panel ---
    const leftColumn = sideBySideContainer.createDiv({
      cls: "ear-coach-transcript-column",
    });

    this.toolbarEl = leftColumn.createDiv({ cls: "ear-coach-toolbar" });
    this.renderToolbar(this.toolbarEl);

    const listWrapper = leftColumn.createDiv({
      cls: "ear-coach-transcript-list-wrapper",
    });
    this.listContainerEl = listWrapper.createDiv({
      cls: "ear-coach-segment-list",
    });

    this.virtualList = this.createVirtualSegmentList(
      listWrapper,
      this.listContainerEl,
      true
    );

    const resizerEl = leftColumn.createDiv({
      cls: "ear-coach-tutor-resizer is-hidden",
    });

    const tutorContainerEl = leftColumn.createDiv({
      cls: "ear-coach-tutor-container is-hidden",
    });
    this.tutorContainerEl = tutorContainerEl;

    setupTutorResizer(this.plugin, resizerEl, tutorContainerEl, leftColumn);

    this.tutorPanel?.stopActiveStream();
    this.tutorPanel = new AgyTutorPanel(
      tutorContainerEl,
      this.plugin.agyService,
      () => this.session,
      {
        onVisibilityChange: (isOpen) => {
          resizerEl.toggleClass("is-hidden", !isOpen);
        },
        onTutorNoteSaved: async (seg, note, convId) => {
          if (!seg.tutorNotes) seg.tutorNotes = [];
          seg.tutorNotes.push(note);
          if (note.detectedTrap && seg.analysis) {
            if (!seg.analysis.traps.includes(note.detectedTrap)) {
              seg.analysis.traps.push(note.detectedTrap);
            }
          }
          if (convId && this.session) {
            this.session.agyConversationId = convId;
          }
          this.virtualList?.updateCard(seg);
          await this.persistCurrentSession();

          if (this.activeNoteFile && this.session) {
            await this.plugin.noteGenerator.appendTutorCalloutToNote(
              this.activeNoteFile,
              seg,
              note
            );
            await this.plugin.weaknessTracker.recordWeakSegment({
              videoId: this.session.videoId,
              videoTitle: this.session.title,
              notePath: this.activeNoteFile.path,
              segment: seg,
              userHeard: note.userHeard,
            });
          }
        },
      }
    );
    this.tutorPanel.render();

    // --- RIGHT COLUMN: Persistent Video Player & Controls ---
    const rightColumn = sideBySideContainer.createDiv({
      cls: "ear-coach-video-column",
    });

    const playerSection = rightColumn.createDiv({
      cls: "ear-coach-player-section",
    });
    this.mountPlayerBar(playerSection);

    this.isShellMounted = true;
    this.updateVirtualListSegments();
    this.playerBar?.render(this.session.videoId);
  }

  /**
   * Mobile-only vertical layout:
   * - Top fixed pane: YouTube player (100% width) + controls + compact toolbar
   * - Middle touch-draggable resizer handle (persisted locally)
   * - Bottom independently scrollable virtualized segment list (default 50% height, no Sound Doctor drawer)
   */
  private renderMobileWorkspace(root: HTMLElement): void {
    if (!this.session) return;
    const mobileContainer = root.createDiv({
      cls: "ear-coach-mobile-container",
    });

    // 1. Top Fixed Pane (YouTube Player + Player Controls + Compact Toolbar)
    const topPaneEl = mobileContainer.createDiv({
      cls: "ear-coach-mobile-top-pane",
    });

    const topPlayerWrapper = topPaneEl.createDiv({
      cls: "ear-coach-mobile-top-player",
    });
    const playerSection = topPlayerWrapper.createDiv({
      cls: "ear-coach-player-section",
    });
    this.mountPlayerBar(playerSection);

    this.toolbarEl = topPaneEl.createDiv({
      cls: "ear-coach-toolbar ear-coach-mobile-toolbar",
    });
    this.renderToolbar(this.toolbarEl);

    // 2. Touch Drag Resizer Bar (user-adjustable split ratio, persisted locally)
    const resizerEl = mobileContainer.createDiv({
      cls: "ear-coach-mobile-resizer",
      attr: { "aria-label": "영역 크기 조절 핸들 (세로: 위아래, 가로: 좌우로 드래그)" },
    });
    resizerEl.createDiv({ cls: "ear-coach-mobile-resizer-pill" });

    // 3. Bottom Independently Scrollable Segment List (default 50% height)
    const listWrapper = mobileContainer.createDiv({
      cls: "ear-coach-transcript-list-wrapper ear-coach-mobile-list-wrapper",
    });
    this.listContainerEl = listWrapper.createDiv({
      cls: "ear-coach-segment-list",
    });

    setupMobileTouchResizer(this.plugin, resizerEl, listWrapper, mobileContainer);
    this.typingCleanup?.();
    this.typingCleanup = setupMobileTypingMode(mobileContainer, listWrapper);

    this.virtualList = this.createVirtualSegmentList(
      listWrapper,
      this.listContainerEl,
      false
    );

    this.tutorPanel?.stopActiveStream();
    this.tutorPanel = null;
    this.tutorContainerEl = null;

    this.isShellMounted = true;
    this.updateVirtualListSegments();
    this.playerBar?.render(this.session.videoId);
  }

  private typingCleanup: (() => void) | null = null;

  private mountPlayerBar(playerSection: HTMLElement): void {
    this.playerBar?.destroy();
    this.playerBar = new PlayerBar(
      playerSection,
      {
        onTimeUpdate: (timeSec) => (this.handlePlaybackTimeUpdate(timeSec), this.resume.tick(timeSec)),
        onLoopToggle: (isLooping, segment, prevSegment) => {
          if (prevSegment) {
            this.virtualList?.setLoopStateForSegment(prevSegment.index, false);
          }
          if (segment) {
            this.virtualList?.setLoopStateForSegment(segment.index, isLooping);
          }
        },
        // SPEC_023: 반복 버튼 대상·다음 문장·설정·자동 따라가기
        getSegmentAt: (t) => {
          const i = this.timeIndex.findNearestSegmentIndex(t);
          return (i >= 0 && this.session?.segments[i]) || null;
        },
        getNextSegment: (seg) => {
          const list = this.virtualList?.getSegments() ?? [];
          const pos = list.findIndex((x) => x.index === seg.index);
          return (pos >= 0 ? list[pos + 1] : list.find((x) => x.start > seg.start)) ?? null;
        },
        getLoopOptions: () => ({ count: this.plugin.settings.loopRepeatCount, gapSec: this.plugin.settings.loopGapSeconds }),
        isFollowOn: () => this.plugin.settings.autoFollowPlayback,
        onFollowToggle: async (on) => {
          this.plugin.settings.autoFollowPlayback = on;
          await this.plugin.saveSettings();
        },
      },
      this.plugin.settings.defaultPlaybackRate,
      this.plugin.settings.loopPaddingSeconds
    );
  }

  private createVirtualSegmentList(
    listWrapper: HTMLElement,
    listContainerEl: HTMLElement,
    enableTutor: boolean
  ): VirtualSegmentList {
    return new VirtualSegmentList(listWrapper, listContainerEl, {
      onPlaySegment: (s, loop) => {
        this.manualLockSegmentIdx = s.index;
        this.manualLockUntil = performance.now() + 1000;
        this.timeIndex.setLastHitIndex(s.index);
        this.setActiveHighlightSegment(s.index, true);
        this.playerBar?.playSegment(s, loop);
      },
      isLooping: (s) => {
        return this.playerBar?.isSegmentLooping(s) ?? false;
      },
      onTogglePin: async (s) => {
        // SPEC_027: 핀 켠 날부터 간격 재청취, 풀면 기록도 지움
        if (s.isPinned) {
          s.pinnedAt = new Date().toISOString();
          s.reviews = [];
        } else {
          delete s.pinnedAt;
          delete s.reviews;
        }
        await this.persistCurrentSession(false);
        if (this.session) void this.plugin.learning.setPin(this.session.videoId, s.start, s.text, s.isPinned); // SPEC_040
        if (s.isPinned && this.activeNoteFile && this.session) {
          await this.plugin.weaknessTracker.recordWeakSegment({
            videoId: this.session.videoId,
            videoTitle: this.session.title,
            notePath: this.activeNoteFile.path,
            segment: s,
          });
        }
      },
      onReviewResult: (s, ok) => {
        // SPEC_027: 「오늘」 목록에서 차례인 핀 문장만 기록(하루 한 번 — 기록하면 다음 차례로 넘어감)
        if (this.filterMode !== "DUE" || !isReviewDue(s, Date.now(), new Date().getTimezoneOffset())) return;
        s.reviews = withReview(s.reviews, ok, new Date().toISOString());
        if (shouldGraduate(s)) new Notice("📌 이 문장을 두 번 연달아 맞혔어요 — 이제 핀을 풀어도 돼요");
        void this.persistCurrentSession(false);
      },
      onBlankResult: (s, word, ok) => {
        // SPEC_044: 빈칸 결과 → 학습 기록(다음 날 「오늘의 문장」 재료)
        if (this.session) void this.plugin.learning.recordBlank(this.session.videoId, s.start, word, ok);
      },
      onPlayOriginal: (s) => this.playerBar?.playSegment(s, false), // SPEC_045: 쉐도잉 비교 원음
      onStopOriginal: () => this.playerBar?.pause(),
      onUnlockStepChange: async () => {
        await this.persistCurrentSession(true);
      },
      onLookupWord: (word, segment, following, preceding) => {
        const provider = this.plugin.dictionary;
        if (!provider) return;
        this.playerBar?.pause();
        // SPEC_015: 사전 창 「➕ Anki」에 자막 문장·영상 정보 전달
        const anki = this.plugin.anki
          ? {
              client: this.plugin.anki,
              fetchBytes: this.plugin.fetchBytes,
              settings: () => this.plugin.settings,
              sentence: segment?.text ?? "",
              videoId: this.session?.videoId ?? null,
              videoTitle: this.session?.title ?? null,
              startSec: segment?.start ?? 0,
              // SPEC_017: 장면 그림(스토리보드 칸)
              endSec: segment?.end ?? null,
              snapshot: this.plugin.storyboard
                ? (videoId: string, sec: number) => captureSnapshot(this.plugin.storyboard, this.plugin.fetchBytes, videoId, sec)
                : null,
            }
          : null;
        new DictionaryModal(this.app, word, provider, following ?? [], anki, preceding ?? []).open();
      },
      onAddSentenceToAnki: (segment) => this.addSentenceToAnki(segment),
      onOpenTutor: (s, heardText) => {
        if (!enableTutor || !this.tutorPanel) return;
        if (heardText) {
          this.tutorPanel.openForSegment(s, heardText);
        } else {
          this.tutorPanel.toggleForSegment(s);
        }
      },
    });
  }

  private destroyShell(): void {
    this.virtualList?.destroy();
    this.virtualList = null;
    this.playerBar?.destroy();
    this.playerBar = null;
    this.tutorPanel?.stopActiveStream();
    this.tutorPanel = null;
    this.toolbarEl = null;
    this.listContainerEl = null;
    this.tutorContainerEl = null;
    this.isShellMounted = false;
  }

  private renderToolbar(toolbar: HTMLElement): void {
    if (!this.session) return;
    if (isMobileApp()) {
      this.renderMobileToolbar(toolbar);
    } else {
      this.renderDesktopToolbar(toolbar);
    }
  }

  private renderDesktopToolbar(toolbar: HTMLElement): void {
    const actionGroup = this.renderCommonToolbar(toolbar);
    if (!actionGroup) return;

    const batchAiBtn = actionGroup.createEl("button", {
      cls: "ear-coach-btn ear-coach-btn-accent",
      text: "🤖 agy AI 연음·함정 정밀 분석",
    });
    batchAiBtn.addEventListener("click", async () => {
      if (!this.session) return;
      batchAiBtn.disabled = true;
      batchAiBtn.setText("⏳ agy 분석 중...");
      try {
        await this.plugin.runAgyBatchEnrichment(this.session, this.activeNoteFile);
        this.updateVirtualListSegments();
        new Notice("agy CLI 정밀 연음·약화 분석을 마쳤어요");
      } catch (err) {
        diagnostics.record("agy 분석", err);
        new Notice(
          `agy 배치 분석 실패: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        batchAiBtn.disabled = false;
        batchAiBtn.setText("🤖 agy AI 연음·함정 정밀 분석");
      }
    });
  }

  private renderMobileToolbar(toolbar: HTMLElement): void {
    this.renderCommonToolbar(toolbar, true);
  }

  private renderCommonToolbar(
    toolbar: HTMLElement,
    compact = false
  ): HTMLElement | null {
    if (!this.session) return null;

    const filterGroup = toolbar.createDiv({ cls: "ear-coach-toolbar-group" });
    const today = this.todayIndices();
    const dueCount = today.length;
    // SPEC_027: 모바일은 아이콘+숫자만(가로 목록 362px에 「⏰ 오늘」까지 들어가게), 뜻은 aria-label
    const pinCount = this.session.segments.filter((s) => s.isPinned).length;
    const spikeCount = this.session.segments.filter((s) => s.isSpeedSpike).length;
    const total = this.session.segments.length;
    const filters: Array<{ mode: FilterMode; label: string; aria: string }> = [
      { mode: "ALL", label: compact ? `전체 ${total}` : `전체 (${total})`, aria: "전체 문장" },
      { mode: "PINNED", label: compact ? `📌 ${pinCount}` : `📌 안 들림 핀 (${pinCount})`, aria: "안 들림 핀 문장" },
      // 오늘 다시 들을 핀 문장(차례인 것이 있거나 보고 있을 때만)
      ...(dueCount > 0 || this.filterMode === "DUE"
        ? [{ mode: "DUE" as FilterMode, label: compact ? `⏰ ${dueCount}` : `⏰ 오늘의 문장 (${dueCount})`, aria: "오늘의 문장" }]
        : []),
      { mode: "SPEED_SPIKE", label: compact ? `🚀 ${spikeCount}` : `🚀 과속 구간 (${spikeCount})`, aria: "과속 구간" },
    ];

    for (const f of filters) {
      const btn = filterGroup.createEl("button", {
        cls: `ear-coach-btn ${this.filterMode === f.mode ? "is-active" : ""}`,
        text: f.label,
        attr: { "aria-label": f.aria, "data-filter": f.mode },
      });
      btn.addEventListener("click", () => this.applyFilter(f.mode, toolbar));
    }
    // SPEC_044: 오늘의 문장이 있으면 맨 위 한 줄(전체 목록일 때만, 닫으면 이 화면에선 안 보임)
    if (dueCount > 0 && this.filterMode === "ALL" && !this.warmupClosed) {
      renderWarmupBanner(toolbar, `☀️ 오늘의 문장 ${dueCount}개`, "오늘은 닫기", () => {
        this.applyFilter("DUE", toolbar);
        const first = this.session?.segments[today[0]];
        if (first) this.playerBar?.playSegment(first, false);
      }, () => ((this.warmupClosed = true), this.applyFilter(this.filterMode, toolbar)));
    } else if (this.quizOffer && !this.quizOffer.closed && this.filterMode === "ALL") {
      renderQuizBanner(toolbar, this.quizOffer, this.plugin, () => this.applyFilter(this.filterMode, toolbar)); // SPEC_050
    }

    const actionGroup = toolbar.createDiv({ cls: "ear-coach-toolbar-group" });

    const blindAllBtn = actionGroup.createEl("button", {
      cls: "ear-coach-btn",
      text: compact ? "모두 가림" : "🙈 전체 블라인드",
    });
    blindAllBtn.addEventListener("click", () => this.setAllUnlockSteps(0));

    const revealAllBtn = actionGroup.createEl("button", {
      cls: "ear-coach-btn",
      text: compact ? "모두 공개" : "📖 전체 공개",
    });
    revealAllBtn.addEventListener("click", () => this.setAllUnlockSteps(3));

    return actionGroup;
  }

  /** SPEC_027·044: 필터 바꾸기 — 오늘의 문장은 블라인드(0단계)부터 */
  private applyFilter(mode: FilterMode, toolbar: HTMLElement): void {
    if (mode === "DUE" && this.session) for (const i of this.todayIndices()) this.session.segments[i].unlockStep = 0;
    this.filterMode = mode;
    this.updateVirtualListSegments();
    toolbar.empty();
    this.renderToolbar(toolbar);
  }

  /** SPEC_044: 차례인 핀 + 지난날 틀린 빈칸 문장, 최대 5개 */
  private todayIndices(): number[] {
    if (!this.session) return [];
    const [now, tz] = [Date.now(), new Date().getTimezoneOffset()];
    const due = this.session.segments.filter((s) => isReviewDue(s, now, tz)).map((s) => s.index);
    return pickTodaySentences(due, this.wrongBlankIdx);
  }

  /** SPEC_044: learning.json의 틀린 빈칸 → 이 영상 문장 번호, 툴바 다시 그림 */
  public async loadWrongBlanks(): Promise<void> {
    const session = this.session;
    if (!session) return;
    try {
      const blanks = await this.plugin.learning.wrongBlanks();
      if (this.session !== session) return;
      this.wrongBlankIdx = wrongBlankSegmentIndices(session.segments, blanks, session.videoId, Date.now(), new Date().getTimezoneOffset());
    } catch (err) {
      diagnostics.record("learning.wrongBlanks", err);
      return;
    }
    this.quizOffer ??= await yesterdayQuizOffer(this.plugin); // SPEC_050
    if (this.toolbarEl && this.session === session) this.applyFilter(this.filterMode, this.toolbarEl);
  }

  /** SPEC_021: 바깥(AI 분석)에서 카드 내용을 다시 그릴 때 */
  public refreshSegments(): void {
    this.updateVirtualListSegments();
  }

  private updateVirtualListSegments(): void {
    if (!this.virtualList || !this.session) return;
    const today = new Set(this.todayIndices());
    const filtered = this.session.segments.filter((seg) => {
      if (this.filterMode === "PINNED") return seg.isPinned;
      if (this.filterMode === "DUE") return today.has(seg.index);
      if (this.filterMode === "SPEED_SPIKE") return seg.isSpeedSpike;
      return true;
    });
    this.virtualList.setSegments(filtered);
  }

  private setActiveHighlightSegment(segmentIdx: number, force = false): void {
    if (!force && segmentIdx === this.lastActiveSegmentIdx) return;
    this.virtualList?.setActiveHighlight(segmentIdx, force);
    this.lastActiveSegmentIdx = segmentIdx;
  }

  private handlePlaybackTimeUpdate(timeSec: number): void {
    if (performance.now() < this.manualLockUntil && this.manualLockSegmentIdx >= 0) {
      this.setActiveHighlightSegment(this.manualLockSegmentIdx);
      this.virtualList?.setPlaybackTime(this.manualLockSegmentIdx, timeSec); // SPEC_043
      return;
    }
    const activeIdx = followTargetIndex(
      this.timeIndex.findActiveSegmentIndex(timeSec),
      this.playerBar?.getLoopSegment()?.index ?? null
    );
    const changed = activeIdx >= 0 && activeIdx !== this.lastActiveSegmentIdx;
    this.setActiveHighlightSegment(activeIdx);
    this.virtualList?.setPlaybackTime(activeIdx, timeSec); // SPEC_043
    // SPEC_023: 재생 시점으로 지금 문장이 바뀌면 카드 목록을 따라가게 한다(사람이 손댄 지 4초 안이면 쉼).
    if (changed && this.virtualList) {
      const follow = shouldAutoFollow({
        enabled: this.plugin.settings.autoFollowPlayback,
        nowMs: performance.now(),
        userScrollUntilMs: this.virtualList.lastUserTouchMs + USER_SCROLL_PAUSE_MS,
      });
      if (follow) this.virtualList.scrollToSegment(activeIdx);
    }
  }

  public scrollToSegment(segmentIndex: number): void {
    this.virtualList?.scrollToSegment(segmentIndex);
    this.lastActiveSegmentIdx = segmentIndex;
  }

  private async setAllUnlockSteps(step: UnlockStep): Promise<void> {
    if (!this.session) return;
    for (const seg of this.session.segments) {
      seg.unlockStep = step;
    }
    this.updateVirtualListSegments();
    await this.persistCurrentSession(true);
  }

  private async persistCurrentSession(sidecarOnly = true): Promise<void> {
    if (!this.session || !this.activeNoteFile) return;
    await this.plugin.noteGenerator.saveSessionToNote(
      this.session,
      this.activeNoteFile,
      sidecarOnly
    );
  }

  /** SPEC_026: 핀 문장 → Anki. SPEC_042: 연결·원음 실패는 「다시」 */
  private async addSentenceToAnki(segment: TranscriptSegment): Promise<string> {
    const anki = this.plugin.anki;
    const msg = !anki
      ? "Anki 연결이 없어요"
      : await saveSentenceCard(
          {
            client: anki,
            fetchBytes: this.plugin.fetchBytes,
            settings: this.plugin.settings,
            videoId: this.session?.videoId ?? null,
            videoTitle: this.session?.title ?? null,
            snapshot: this.plugin.storyboard
              ? (videoId: string, sec: number) => captureSnapshot(this.plugin.storyboard, this.plugin.fetchBytes, videoId, sec)
              : null,
            audioClip: this.plugin.audioClip ?? null, // SPEC_036
          },
          segment
        );
    // SPEC_042: 연결·원음 실패는 「다시」
    if (msg === ANKI_MESSAGES.connection || msg === ANKI_MESSAGES.noAudio) notifyRetry(msg, () => this.addSentenceToAnki(segment));
    else new Notice(msg);
    return msg;
  }
}
