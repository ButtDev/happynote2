import { ItemView, Notice, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import {
  ListeningSessionData,
  TranscriptSegment,
  UnlockStep,
} from "../types/transcript";
import { SegmentTimeIndex } from "../utils/binarySearch";
import { isMobileApp } from "../utils/platform";
import { clampLandscapeLeftPercent, landscapeLeftPercentFromPointer, LANDSCAPE_LEFT_DEFAULT } from "../utils/landscapeSplit";
import { PlayerBar } from "./components/PlayerBar";
import { VirtualSegmentList } from "./components/VirtualSegmentList";
import { AgyTutorPanel } from "./components/AgyTutorPanel";
import { DictionaryModal } from "./DictionaryModal";
import type EarCoachPlugin from "../main";

export const VIEW_TYPE_EAR_COACH = "ear-coach-listening-view";

type FilterMode = "ALL" | "PINNED" | "SPEED_SPIKE";

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

  private isShellMounted = false;
  private toolbarEl: HTMLElement | null = null;
  private listContainerEl: HTMLElement | null = null;
  private tutorContainerEl: HTMLElement | null = null;
  private boundKeyHandler: (ev: KeyboardEvent) => void;
  // SPEC_005 임시 진단: 모바일 가로로 열릴 때 뷰 열림당 1회

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
    this.containerEl.removeEventListener("keydown", this.boundKeyHandler, { capture: true });
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
    this.timeIndex.setSegments(session.segments);
    this.lastActiveSegmentIdx = -1;
    this.manualLockSegmentIdx = -1;
    this.manualLockUntil = 0;

    try {
      (this.leaf as any).updateHeader?.();
      this.app.workspace.requestSaveLayout();
    } catch {
      // Ignore leaf header update errors
    }

    this.renderWorkspace();

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

    this.setupTutorResizer(resizerEl, tutorContainerEl, leftColumn);

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

    this.setupMobileTouchResizer(resizerEl, listWrapper, mobileContainer);

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

  private setupMobileTouchResizer(
    resizerEl: HTMLElement,
    listWrapper: HTMLElement,
    mobileContainer: HTMLElement
  ): void {
    const clampPercent = (pct: number): number =>
      Math.max(25, Math.min(72, Math.round(pct)));

    let currentPercent = clampPercent(
      this.plugin.settings.mobileListHeightPercent ?? 50
    );

    const applyListHeight = (pct: number) => {
      const clamped = clampPercent(pct);
      currentPercent = clamped;
      listWrapper.style.flex = `0 0 ${clamped}%`;
      listWrapper.style.height = `${clamped}%`;
    };

    applyListHeight(currentPercent);

    // SPEC_011: 가로에서는 같은 막대가 영상 열 폭(좌우)을 조절한다(CSS 변수 --ear-coach-landscape-left).
    const isLandscape = () => window.matchMedia("(orientation: landscape)").matches;
    let currentLeft = clampLandscapeLeftPercent(
      this.plugin.settings.mobileLandscapeLeftPercent ?? LANDSCAPE_LEFT_DEFAULT
    );
    const applyLeft = (pct: number) => {
      currentLeft = clampLandscapeLeftPercent(pct);
      mobileContainer.style.setProperty("--ear-coach-landscape-left", String(currentLeft));
    };
    applyLeft(currentLeft);
    let dragLandscape = false;
    let containerLeft = 0;
    let containerW = 0;
    let latestClientX = 0;

    let isDragging = false;
    let startY = 0;
    let startListH = 0;
    let containerH = 0;
    let pendingRaf: number | null = null;
    let latestClientY = 0;

    const commitResize = async () => {
      if (!isDragging) return;
      isDragging = false;
      resizerEl.removeClass("is-dragging");
      if (pendingRaf !== null) {
        window.cancelAnimationFrame(pendingRaf);
        pendingRaf = null;
      }
      if (dragLandscape) this.plugin.settings.mobileLandscapeLeftPercent = currentLeft;
      else this.plugin.settings.mobileListHeightPercent = currentPercent;
      await this.plugin.saveSettings();
    };

    const scheduleUpdate = (clientY: number, clientX: number) => {
      latestClientY = clientY;
      latestClientX = clientX;
      if (pendingRaf !== null) return;
      pendingRaf = window.requestAnimationFrame(() => {
        pendingRaf = null;
        if (dragLandscape) {
          applyLeft(landscapeLeftPercentFromPointer(latestClientX, containerLeft, containerW));
          return;
        }
        const deltaY = startY - latestClientY;
        const nextListH = startListH + deltaY;
        const rawPct = (nextListH / Math.max(200, containerH)) * 100;
        applyListHeight(rawPct);
      });
    };

    resizerEl.addEventListener("pointerdown", (ev: PointerEvent) => {
      ev.preventDefault();
      isDragging = true;
      dragLandscape = isLandscape();
      const cRect = mobileContainer.getBoundingClientRect();
      containerLeft = cRect.left;
      containerW = cRect.width || window.innerWidth;
      startY = ev.clientY;
      startListH = listWrapper.getBoundingClientRect().height;
      containerH =
        mobileContainer.getBoundingClientRect().height || window.innerHeight;
      resizerEl.addClass("is-dragging");
      try {
        resizerEl.setPointerCapture(ev.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported
      }
    });

    resizerEl.addEventListener("pointermove", (ev: PointerEvent) => {
      if (!isDragging) return;
      ev.preventDefault();
      scheduleUpdate(ev.clientY, ev.clientX);
    });

    resizerEl.addEventListener("pointerup", () => {
      void commitResize();
    });
    resizerEl.addEventListener("pointercancel", () => {
      void commitResize();
    });

    // Double-tap / double-click resets cleanly to 50% (가로는 58%)
    resizerEl.addEventListener("dblclick", async () => {
      if (isLandscape()) {
        applyLeft(LANDSCAPE_LEFT_DEFAULT);
        this.plugin.settings.mobileLandscapeLeftPercent = LANDSCAPE_LEFT_DEFAULT;
      } else {
        applyListHeight(50);
        this.plugin.settings.mobileListHeightPercent = 50;
      }
      await this.plugin.saveSettings();
    });
  }

  private mountPlayerBar(playerSection: HTMLElement): void {
    this.playerBar?.destroy();
    this.playerBar = new PlayerBar(
      playerSection,
      {
        onTimeUpdate: (timeSec) => this.handlePlaybackTimeUpdate(timeSec),
        onLoopToggle: (isLooping, segment, prevSegment) => {
          if (prevSegment) {
            this.virtualList?.setLoopStateForSegment(prevSegment.index, false);
          }
          if (segment) {
            this.virtualList?.setLoopStateForSegment(segment.index, isLooping);
          }
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
        await this.persistCurrentSession(false);
        if (s.isPinned && this.activeNoteFile && this.session) {
          await this.plugin.weaknessTracker.recordWeakSegment({
            videoId: this.session.videoId,
            videoTitle: this.session.title,
            notePath: this.activeNoteFile.path,
            segment: s,
          });
        }
      },
      onUnlockStepChange: async () => {
        await this.persistCurrentSession(true);
      },
      onLookupWord: (word) => {
        const provider = this.plugin.dictionary;
        if (!provider) return;
        this.playerBar?.pause();
        new DictionaryModal(this.app, word, provider).open();
      },
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

  private setupTutorResizer(
    resizerEl: HTMLElement,
    tutorContainerEl: HTMLElement,
    leftColumn: HTMLElement
  ): void {
    const savedHeight = this.plugin.settings.tutorPanelHeightPx || 420;
    tutorContainerEl.style.height = `${savedHeight}px`;
    tutorContainerEl.style.flex = `0 0 ${savedHeight}px`;
    tutorContainerEl.style.maxHeight = "none";

    let startY = 0;
    let startHeight = 0;

    const onMouseMove = (ev: MouseEvent) => {
      ev.preventDefault();
      const deltaY = startY - ev.clientY;
      const leftColH = leftColumn.getBoundingClientRect().height || window.innerHeight;
      const minH = 140;
      const maxH = Math.max(minH, leftColH - 70);
      const newH = Math.max(minH, Math.min(maxH, startHeight + deltaY));
      tutorContainerEl.style.height = `${newH}px`;
      tutorContainerEl.style.flex = `0 0 ${newH}px`;
      tutorContainerEl.style.maxHeight = "none";
    };

    const onMouseUp = async () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      resizerEl.removeClass("is-dragging");

      const finalH = parseInt(tutorContainerEl.style.height, 10);
      if (Number.isFinite(finalH) && finalH >= 140) {
        this.plugin.settings.tutorPanelHeightPx = finalH;
        await this.plugin.saveSettings();
      }
    };

    resizerEl.addEventListener("mousedown", (ev: MouseEvent) => {
      ev.preventDefault();
      startY = ev.clientY;
      startHeight = tutorContainerEl.getBoundingClientRect().height || savedHeight;
      resizerEl.addClass("is-dragging");
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    });
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
        new Notice("agy CLI 정밀 연음·약화 분석이 완료되었습니다!");
      } catch (err) {
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
    const filters: Array<{ mode: FilterMode; label: string }> = [
      { mode: "ALL", label: `전체 (${this.session.segments.length})` },
      {
        mode: "PINNED",
        label: compact
          ? `📌 핀 (${this.session.segments.filter((s) => s.isPinned).length})`
          : `📌 안 들림 핀 (${this.session.segments.filter((s) => s.isPinned).length})`,
      },
      {
        mode: "SPEED_SPIKE",
        label: compact
          ? `🚀 과속 (${this.session.segments.filter((s) => s.isSpeedSpike).length})`
          : `🚀 과속 구간 (${this.session.segments.filter((s) => s.isSpeedSpike).length})`,
      },
    ];

    for (const f of filters) {
      const btn = filterGroup.createEl("button", {
        cls: `ear-coach-btn ${this.filterMode === f.mode ? "is-active" : ""}`,
        text: f.label,
      });
      btn.addEventListener("click", () => {
        this.filterMode = f.mode;
        this.updateVirtualListSegments();
        toolbar.empty();
        this.renderToolbar(toolbar);
      });
    }

    const actionGroup = toolbar.createDiv({ cls: "ear-coach-toolbar-group" });

    const blindAllBtn = actionGroup.createEl("button", {
      cls: "ear-coach-btn",
      text: compact ? "🙈 블라인드" : "🙈 전체 블라인드",
    });
    blindAllBtn.addEventListener("click", () => this.setAllUnlockSteps(0));

    const revealAllBtn = actionGroup.createEl("button", {
      cls: "ear-coach-btn",
      text: compact ? "📖 공개" : "📖 전체 공개",
    });
    revealAllBtn.addEventListener("click", () => this.setAllUnlockSteps(3));

    return actionGroup;
  }

  private updateVirtualListSegments(): void {
    if (!this.virtualList || !this.session) return;
    const filtered = this.session.segments.filter((seg) => {
      if (this.filterMode === "PINNED") return seg.isPinned;
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
      return;
    }
    const activeIdx = this.timeIndex.findActiveSegmentIndex(timeSec);
    this.setActiveHighlightSegment(activeIdx);
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
}
