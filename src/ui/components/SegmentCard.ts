import { TranscriptSegment, UnlockStep } from "../../types/transcript";
import { isDesktopApp, isMobileApp } from "../../utils/platform";
import { trapLabel } from "../../utils/trapLabels";
import { formatSecondsToTimestamp } from "../../utils/youtubeUrlParser";
import { MicroDictationBox } from "./MicroDictationBox";
import { ensureSegmentPronunciations, segmentSoundHint } from "../../services/cmudictLite";
import { activeWordIndex } from "../../utils/karaoke";
import { renderShadowRow } from "../shadowRow";

export interface SegmentCardCallbacks {
  onPlaySegment: (segment: TranscriptSegment, loop: boolean) => void;
  onTogglePin: (segment: TranscriptSegment) => void;
  onUnlockStepChange: (segment: TranscriptSegment, step: UnlockStep) => void;
  onOpenTutor: (segment: TranscriptSegment, userHeardText?: string) => void;
  isLooping?: (segment: TranscriptSegment) => boolean;
  /** SPEC_013: 3단계 문장에서 단어를 누름 */
  /** SPEC_014: following = 누른 낱말 뒤 낱말 최대 2개(글자 그대로, 구동사 후보용). SPEC_019: preceding = 앞 낱말 최대 2개(문장 순서) */
  onLookupWord?: (word: string, segment: TranscriptSegment, following: string[], preceding: string[]) => void;
  /** SPEC_026: 핀 문장 → Anki 듣기 카드(저장 뒤 보일 문구) */
  onAddSentenceToAnki?: (segment: TranscriptSegment) => Promise<string>;
  /** SPEC_027: 받아쓰기를 다 맞힘(ok) / 힌트·정답을 직접 엶(실패) — 「오늘」 복습 기록용 */
  onReviewResult?: (segment: TranscriptSegment, ok: boolean) => void;
  /** SPEC_044: 빈칸 하나의 결과(학습 기록) */
  onBlankResult?: (segment: TranscriptSegment, word: string, ok: boolean) => void;
  /** SPEC_045: 쉐도잉 비교 — 원음(그 문장) 재생 / 내 녹음 직전·멈출 때 원음 멈춤 */
  onPlayOriginal?: (segment: TranscriptSegment) => void;
  onStopOriginal?: () => void;
}

/**
 * Renders an individual sentence card with the 3-Step Ear Unlocker, WPM/trap badges,
 * A-B loop trigger, and Shadowing rhythm guide.
 */
export class SegmentCard {
  private cardEl: HTMLElement;
  private loopBtnEl: HTMLButtonElement | null = null;
  private isActivePlaying = false;
  private karaokeIdx = -1;

  constructor(
    parentEl: HTMLElement,
    private segment: TranscriptSegment,
    private callbacks: SegmentCardCallbacks
  ) {
    this.cardEl = parentEl.createDiv({
      cls: "ear-coach-segment-card",
      attr: { "data-segment-index": String(segment.index) },
    });
    this.render();
  }

  public getElement(): HTMLElement {
    return this.cardEl;
  }

  public setActiveHighlight(isActive: boolean): void {
    this.isActivePlaying = isActive;
    if (isActive) {
      this.cardEl.addClass("is-active-playing");
    } else {
      this.cardEl.removeClass("is-active-playing");
      this.setKaraokeWord(-1);
    }
  }

  /** SPEC_043: 재생 시각에 맞는 정답 문장 낱말 하나를 칠함(3단계 + 단어 시각 있을 때만) */
  public setPlaybackTime(t: number): void {
    this.setKaraokeWord(this.segment.unlockStep === 3 ? activeWordIndex(this.segment, t) : -1);
  }

  private setKaraokeWord(idx: number): void {
    if (idx === this.karaokeIdx) return;
    this.karaokeIdx = idx;
    this.cardEl.querySelectorAll(".ear-coach-word.is-karaoke").forEach((el) => el.removeClass("is-karaoke"));
    if (idx >= 0) this.cardEl.querySelector(`.ear-coach-full-script .ear-coach-word[data-wi="${idx}"]`)?.addClass("is-karaoke");
  }

  /** SPEC_031: CMUdict + 이어 말하기 규칙으로 계산한 소리 힌트, 사전에 없으면 AI phoneticKr */
  private soundHintText(withChunk = false): string {
    const hint = segmentSoundHint(this.segment);
    // SPEC_032: 정답 단계에선 어느 낱말의 힌트인지 앞에 붙임(2단계는 정답이 드러나므로 안 붙임)
    if (hint) return `${withChunk ? `${hint.text} → ` : ""}[${hint.hangul}] /${hint.ipa}/`;
    // SPEC_035: 사전에 없는 낱말 → dictionaryapi IPA를 받아 오면 다시 그림(그동안은 AI 값)
    const seg = this.segment;
    void ensureSegmentPronunciations(seg).then((added) => {
      if (added && this.segment === seg) this.render();
    });
    return this.segment.analysis?.phoneticKr ?? "";
  }

  public setLoopState(isLooping: boolean): void {
    if (!this.loopBtnEl) return;
    this.loopBtnEl.toggleClass("is-loop-active-btn", isLooping);
    this.loopBtnEl.setText(loopLabel(isLooping));
  }

  public updateSegment(segment: TranscriptSegment): void {
    this.segment = segment;
    this.render();
  }

  public render(): void {
    this.cardEl.empty();
    this.karaokeIdx = -1;
    this.cardEl.toggleClass("is-pinned", this.segment.isPinned);
    this.cardEl.toggleClass("is-active-playing", this.isActivePlaying);

    // 1. Top Header Bar: Timestamp, Loop, Pin, WPM & Trap Badges
    const headerEl = this.cardEl.createDiv({ cls: "ear-coach-card-header" });

    const leftControls = headerEl.createDiv({ cls: "ear-coach-card-left-controls" });

    const timeBtn = leftControls.createEl("button", {
      cls: "ear-coach-time-btn",
      text: `▶ ${formatSecondsToTimestamp(this.segment.start)}`,
    });
    timeBtn.addEventListener("click", () =>
      this.callbacks.onPlaySegment(this.segment, false)
    );

    const isCurrentlyLooping = this.callbacks.isLooping?.(this.segment) ?? false;
    this.loopBtnEl = leftControls.createEl("button", {
      cls: `ear-coach-mini-btn ear-coach-card-loop ${isCurrentlyLooping ? "is-loop-active-btn" : ""}`,
      text: loopLabel(isCurrentlyLooping),
      attr: { "aria-label": "이 문장 반복" },
    });
    this.loopBtnEl.addEventListener("click", () =>
      this.callbacks.onPlaySegment(this.segment, true)
    );

    // SPEC_028: 모바일은 아이콘만(켜짐은 노란 is-pinned-btn), 뜻은 aria-label
    const pinBtn = leftControls.createEl("button", {
      cls: `ear-coach-mini-btn ear-coach-card-pin ${this.segment.isPinned ? "is-pinned-btn" : ""}`,
      text: isMobileApp() ? "📌" : this.segment.isPinned ? "📌 안 들림 핀 해제" : "📌 안 들림 핀",
      attr: { "aria-label": "안 들림 핀", "aria-pressed": String(this.segment.isPinned) },
    });
    pinBtn.addEventListener("click", () => {
      this.segment.isPinned = !this.segment.isPinned;
      this.callbacks.onTogglePin(this.segment);
      this.render();
    });

    // SPEC_026: 핀 켜진 카드에만 「➕ Anki」(문장 듣기 카드)
    const onAnki = this.callbacks.onAddSentenceToAnki;
    if (this.segment.isPinned && onAnki) {
      const ankiBtn = leftControls.createEl("button", { cls: "ear-coach-mini-btn ear-coach-sentence-anki", text: "➕ Anki" });
      ankiBtn.addEventListener("click", async () => {
        ankiBtn.disabled = true;
        try {
          await onAnki(this.segment);
        } finally {
          ankiBtn.disabled = false;
        }
      });
    }

    // Badges (WPM + Traps)
    const badgeRow = headerEl.createDiv({ cls: "ear-coach-badge-row" });
    badgeRow.createSpan({
      cls: `ear-coach-badge ${this.segment.isSpeedSpike ? "badge-speed-spike" : "badge-wpm"}`,
      text: `${this.segment.wpm} WPM${this.segment.isSpeedSpike ? " 🚀" : ""}`,
    });

    // SPEC_028: 함정 배지는 한국어 이름, SPEED_SPIKE는 WPM 배지가 이미 보여 주므로 뺀다
    for (const trap of this.segment.analysis?.traps ?? []) {
      if (trap === "SPEED_SPIKE") continue;
      badgeRow.createSpan({
        cls: `ear-coach-badge badge-trap-${trap.toLowerCase()}`,
        text: trapLabel(trap),
      });
    }

    // 2. Step Switcher Bar (3-Step Ear Unlocker)
    const stepBar = this.cardEl.createDiv({ cls: "ear-coach-step-bar" });
    // SPEC_028: 모바일 단계 이름 「듣기·빈칸·힌트·정답」, 버튼은 data-step으로 찾는다
    const stepDefinitions: Array<{ step: UnlockStep; label: string }> = isMobileApp()
      ? [
          { step: 0, label: "듣기" },
          { step: 1, label: "빈칸" },
          { step: 2, label: "힌트" },
          { step: 3, label: "정답" },
        ]
      : [
          { step: 0, label: "🙈 0. 블라인드" },
          { step: 1, label: "🦴 1. 뼈대·빈칸" },
          { step: 2, label: "💡 2. 소리 힌트" },
          { step: 3, label: "📖 3. 정답·쉐도잉" },
        ];

    for (const def of stepDefinitions) {
      const btn = stepBar.createEl("button", {
        cls: `ear-coach-step-btn ${this.segment.unlockStep === def.step ? "is-current-step" : ""}`,
        text: def.label,
        attr: { "data-step": String(def.step) },
      });
      btn.addEventListener("click", () => {
        if (def.step >= 2 && this.segment.unlockStep < 2) this.callbacks.onReviewResult?.(this.segment, false);
        this.segment.unlockStep = def.step;
        this.callbacks.onUnlockStepChange(this.segment, def.step);
        this.render();
      });
    }

    if (isDesktopApp()) {
      this.renderDesktopTutorTrigger(stepBar);
    }

    // 3. Body Content based on current UnlockStep
    const bodyEl = this.cardEl.createDiv({ cls: "ear-coach-card-body" });
    this.renderStepContent(bodyEl, this.segment.unlockStep);
  }

  private renderDesktopTutorTrigger(stepBar: HTMLElement): void {
    const askBtn = stepBar.createEl("button", {
      cls: "ear-coach-step-btn ear-coach-tutor-trigger-btn",
      text: "🎙️ 1:1 사운드 해부",
    });
    askBtn.addEventListener("click", () => this.callbacks.onOpenTutor(this.segment));
  }

  /** SPEC_013: 문장을 단어 span으로 — 누르면 사전. 공백은 글자 그대로 둔다. */
  private renderTappableWords(el: HTMLElement, text: string): void {
    const onLookup = this.callbacks.onLookupWord;
    if (!onLookup) {
      el.setText(text);
      return;
    }
    const parts = text.split(/(\s+)/).filter((p) => p);
    const tokens = parts.filter((p) => !/^\s+$/.test(p));
    let ti = -1;
    for (const part of parts) {
      if (/^\s+$/.test(part)) {
        el.appendText(part);
        continue;
      }
      ti++;
      if (!/[A-Za-z]/.test(part)) {
        el.appendText(part);
        continue;
      }
      const following = tokens.slice(ti + 1, ti + 3);
      const preceding = tokens.slice(Math.max(0, ti - 2), ti);
      const w = el.createSpan({ cls: "ear-coach-word", text: part, attr: { "data-wi": String(ti) } });
      w.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onLookup(part, this.segment, following, preceding);
      });
    }
  }

  private renderStepContent(bodyEl: HTMLElement, step: UnlockStep): void {
    const analysis = this.segment.analysis;

    if (step === 0) {
      const blindBox = bodyEl.createDiv({ cls: "ear-coach-blind-box" });
      blindBox.createSpan({
        cls: "ear-coach-blind-prompt",
        // SPEC_028: 모바일은 한 줄(단어 수·길이만)
        text: isMobileApp()
          ? `🎧 ${this.segment.words.length}단어 · ${this.segment.duration}초`
          : `🎧 눈을 감고 소리에만 집중해 보세요! (총 ${this.segment.words.length}단어, ${this.segment.duration}초) — 안 들리면 [1. 뼈대·빈칸]이나 [2. 소리 힌트]를 클릭하세요.`,
      });
      return;
    }

    if (step === 1) {
      const dictContainer = bodyEl.createDiv();
      const dictBox = new MicroDictationBox(dictContainer, this.segment, {
        onDictationSolved: () => {
          this.callbacks.onReviewResult?.(this.segment, true);
          this.segment.unlockStep = 3;
          this.callbacks.onUnlockStepChange(this.segment, 3);
          this.render();
        },
        onAskTutorWithHeardText: (seg, heardText) => {
          this.callbacks.onOpenTutor(seg, heardText);
        },
        onBlankResult: (seg, word, ok) => this.callbacks.onBlankResult?.(seg, word, ok),
      });
      dictBox.render();
      return;
    }

    if (step === 2) {
      const hintBox = bodyEl.createDiv({ cls: "ear-coach-sound-hint-box" });
      hintBox.createDiv({
        cls: "ear-coach-phonetic-kr",
        text: `🔊 실제 발음 힌트: ${this.soundHintText() || "분석 데이터 없음"}`,
      });
      hintBox.createDiv({
        cls: "ear-coach-trap-explanation",
        text: `💡 왜 안 들렸을까?: ${analysis?.trapExplanation || ""}`,
      });
      return;
    }

    // Step 3: Full Reveal + Translation + Shadowing Rhythm Guide
    const fullBox = bodyEl.createDiv({ cls: "ear-coach-full-reveal-box" });
    const scriptEl = fullBox.createDiv({ cls: "ear-coach-full-script" });
    this.renderTappableWords(scriptEl, this.segment.text);

    // SPEC_045: 따라 말하기 녹음 → 원음·내 녹음 비교
    const onOriginal = this.callbacks.onPlayOriginal;
    if (onOriginal) {
      const seg = this.segment;
      renderShadowRow(fullBox, seg, {
        playOriginal: () => onOriginal(seg),
        stopOriginal: () => this.callbacks.onStopOriginal?.(),
        isAlive: () => this.cardEl.isConnected && this.segment === seg && seg.unlockStep === 3,
      });
    }

    if (analysis) {
      fullBox.createDiv({
        cls: "ear-coach-translation-kr",
        text: `🇰🇷 ${analysis.translationKr}`,
      });
      fullBox.createDiv({
        cls: "ear-coach-phonetic-kr",
        text: `🔊 발음 포인트: ${this.soundHintText(true) || analysis.phoneticKr} — ${analysis.trapExplanation}`,
      });
      fullBox.createDiv({
        cls: "ear-coach-rhythm-guide",
        text: `🗣️ 쉐도잉 리듬 악보: ${analysis.rhythmGuide}`,
      });
    }

    if (this.segment.tutorNotes && this.segment.tutorNotes.length > 0) {
      const notesBox = fullBox.createDiv({ cls: "ear-coach-saved-tutor-notes" });
      for (const note of this.segment.tutorNotes) {
        const item = notesBox.createDiv({ cls: "ear-coach-saved-tutor-item" });
        item.createDiv({
          cls: "ear-coach-saved-tutor-q",
          text: `🙋 내가 들은 소리: "${note.userHeard || "미입력"}" | 질문: ${note.question}`,
        });
        item.createDiv({
          cls: "ear-coach-saved-tutor-a",
          text: note.answer,
        });
      }
    }
  }
}

/** SPEC_028: 카드 반복 버튼 글자 — 모바일은 아이콘만(🔁 꺼짐 / 🔂 켜짐), 데스크톱은 「반복」으로 통일(G) */
function loopLabel(isLooping: boolean): string {
  if (isMobileApp()) return isLooping ? "🔂" : "🔁";
  return isLooping ? "🔁 반복 중 (해제)" : "🔁 이 문장 반복";
}
