/**
 * SPEC_050: 어제 영상 퀴즈 창 — 문제마다 원음 듣기 → 문장 받아쓰기 → 확인(낱말별 맞음/틀림) → 다음.
 * 원음을 못 받은 문제는 건너뛰고 총점에서 뺀다. 끝나면 영상별로 기록한다.
 */
import { App, Modal } from "obsidian";
import { gradeQuizAnswer } from "../utils/yesterdayQuiz";
import { dictationMatches } from "../utils/dictationMatch";

export interface QuizItem {
  videoId: string;
  title: string;
  seg: { start: number; end: number; text: string };
}

export interface QuizDeps {
  /** WAV base64, 실패면 null (SPEC_036 audioClip) */
  clip: (videoId: string, start: number, end: number) => Promise<string | null>;
  record: (videoId: string, total: number, correct: number) => Promise<void> | void;
  onDone: () => void;
}

export const QUIZ_TEXT = {
  title: (n: number, total: number) => `🎧 퀴즈 ${n}/${total}`,
  play: "▶ 듣기",
  loading: "원음 받는 중…",
  noAudio: "원음을 못 받았어요 — 건너뛸게요",
  placeholder: "들은 문장을 그대로 써 보세요",
  check: "확인",
  next: "다음",
  finish: "끝내기",
  pass: "맞혔어요",
  fail: "아쉬워요",
  result: (total: number, correct: number) => (total > 0 ? `${total}문제 중 ${correct}개 맞힘` : "원음을 받지 못해 퀴즈를 못 했어요"),
} as const;

export class QuizModal extends Modal {
  private items: QuizItem[];
  private deps: QuizDeps;
  private at = 0;
  private results: Array<{ videoId: string; pass: boolean } | null> = [];
  private audio: HTMLAudioElement | null = null;
  private finished = false;

  constructor(app: App, items: QuizItem[], deps: QuizDeps) {
    super(app);
    this.items = items;
    this.deps = deps;
  }

  onOpen(): void {
    this.modalEl.addClass("ear-coach-quiz-modal");
    this.renderItem();
  }

  onClose(): void {
    this.stopAudio();
    if (!this.finished) this.finish(false);
    this.contentEl.empty();
  }

  private stopAudio(): void {
    this.audio?.pause();
    this.audio = null;
  }

  private renderItem(): void {
    const el = this.contentEl;
    el.empty();
    const item = this.items[this.at];
    el.createEl("h3", { cls: "ear-coach-quiz-title", text: QUIZ_TEXT.title(this.at + 1, this.items.length) });
    el.createDiv({ cls: "ear-coach-quiz-source", text: item.title });
    const playBtn = el.createEl("button", { cls: "ear-coach-btn ear-coach-btn-primary ear-coach-quiz-play", text: QUIZ_TEXT.loading });
    playBtn.disabled = true;
    const input = el.createEl("textarea", { cls: "ear-coach-quiz-input", attr: { placeholder: QUIZ_TEXT.placeholder, rows: "3", autocapitalize: "off", spellcheck: "false" } });
    const feedback = el.createDiv({ cls: "ear-coach-quiz-feedback" });
    const row = el.createDiv({ cls: "ear-coach-quiz-actions" });
    const checkBtn = row.createEl("button", { cls: "ear-coach-btn ear-coach-btn-primary ear-coach-quiz-check", text: QUIZ_TEXT.check });
    const last = this.at === this.items.length - 1;
    const nextBtn = row.createEl("button", { cls: "ear-coach-btn ear-coach-quiz-next is-hidden", text: last ? QUIZ_TEXT.finish : QUIZ_TEXT.next });

    let src: string | null = null;
    const index = this.at;
    void this.deps.clip(item.videoId, item.seg.start, item.seg.end).then((b64) => {
      if (this.at !== index || !el.isConnected) return;
      if (!b64) {
        this.results[index] = null;
        playBtn.setText(QUIZ_TEXT.noAudio);
        input.disabled = true;
        checkBtn.addClass("is-hidden");
        nextBtn.removeClass("is-hidden");
        return;
      }
      src = `data:audio/wav;base64,${b64}`;
      playBtn.setText(QUIZ_TEXT.play);
      playBtn.disabled = false;
    });
    playBtn.addEventListener("click", () => {
      if (!src) return;
      this.stopAudio();
      this.audio = new Audio(src);
      void this.audio.play().catch(() => {});
    });
    checkBtn.addEventListener("click", () => {
      const g = gradeQuizAnswer(input.value, item.seg.text, dictationMatches);
      this.results[index] = { videoId: item.videoId, pass: g.pass };
      feedback.empty();
      feedback.createDiv({ cls: `ear-coach-quiz-verdict ${g.pass ? "is-pass" : "is-fail"}`, text: `${g.pass ? QUIZ_TEXT.pass : QUIZ_TEXT.fail} · ${g.correct}/${g.total}` });
      const words = feedback.createDiv({ cls: "ear-coach-quiz-answer" });
      for (const w of g.words) words.createSpan({ cls: `ear-coach-quiz-word ${w.ok ? "is-ok" : "is-miss"}`, text: w.text });
      input.disabled = true;
      checkBtn.addClass("is-hidden");
      nextBtn.removeClass("is-hidden");
    });
    nextBtn.addEventListener("click", () => {
      this.stopAudio();
      if (last) this.finish(true);
      else {
        this.at++;
        this.renderItem();
      }
    });
  }

  /** 기록은 영상별로. 중간에 닫으면 확인한 문제만 기록 */
  private finish(showResult: boolean): void {
    this.finished = true;
    const done = this.results.filter((r): r is { videoId: string; pass: boolean } => !!r);
    const byVideo = new Map<string, { total: number; correct: number }>();
    for (const r of done) {
      const v = byVideo.get(r.videoId) ?? { total: 0, correct: 0 };
      v.total++;
      if (r.pass) v.correct++;
      byVideo.set(r.videoId, v);
    }
    for (const [id, v] of byVideo) void this.deps.record(id, v.total, v.correct);
    if (done.length > 0 || showResult) this.deps.onDone();
    if (!showResult) return;
    const el = this.contentEl;
    el.empty();
    el.createEl("h3", { cls: "ear-coach-quiz-title", text: "🎧 퀴즈 끝" });
    el.createDiv({ cls: "ear-coach-quiz-result", text: QUIZ_TEXT.result(done.length, done.filter((r) => r.pass).length) });
    const close = el.createEl("button", { cls: "ear-coach-btn ear-coach-btn-primary ear-coach-quiz-close", text: "닫기" });
    close.addEventListener("click", () => this.close());
  }
}
