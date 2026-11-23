import { TranscriptSegment } from "../../types/transcript";
import { isMobileApp } from "../../utils/platform";
import { dictationMatches } from "../../utils/dictationMatch";
import { dictationBlanksFor } from "../../services/soundHint";

export interface MicroDictationCallbacks {
  onDictationSolved: (segment: TranscriptSegment) => void;
  onAskTutorWithHeardText: (segment: TranscriptSegment, userHeardText: string) => void;
  /** SPEC_044: 빈칸 결과 — 맞음으로 바뀔 때 true, 칸을 떠날 때 틀린 글자가 남아 있으면 false(같은 결과 연달아 두 번 없음) */
  onBlankResult?: (segment: TranscriptSegment, word: string, ok: boolean) => void;
}

/**
 * Interactive Micro-Dictation component for Step 1 of the Ear Unlocker.
 * Turns only the key linked/weak words into input blanks so the user isn't overwhelmed by typing the entire sentence.
 */
export class MicroDictationBox {
  constructor(
    private containerEl: HTMLElement,
    private segment: TranscriptSegment,
    private callbacks: MicroDictationCallbacks
  ) {}

  public render(): void {
    this.containerEl.empty();
    this.containerEl.addClass("ear-coach-dictation-box");

    // SPEC_037: 힌트 덩어리와 같은 낱말을 비움
    const blankIndices = new Set(dictationBlanksFor(this.segment));
    const skeletonIndices = new Set(
      this.segment.analysis?.skeletonWordIndices ?? []
    );

    const tokenRow = this.containerEl.createDiv({ cls: "ear-coach-dictation-tokens" });
    const inputs: Array<{ idx: number; expected: string; inputEl: HTMLInputElement }> = [];

    this.segment.words.forEach((rawWord, idx) => {
      const cleanExpected = rawWord.replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "");

      if (blankIndices.has(idx) && cleanExpected.length > 0) {
        const inputEl = tokenRow.createEl("input", {
          cls: "ear-coach-blank-input",
          type: "text",
          attr: {
            placeholder: "_".repeat(Math.max(3, cleanExpected.length)),
            "aria-label": `Blank word ${idx + 1}`,
          },
        });
        inputEl.style.width = `${Math.max(4.5, cleanExpected.length * 0.75 + 1.5)}em`;

        const savedAttempt = this.segment.userDictationAttempts?.[idx];
        if (savedAttempt) {
          inputEl.value = savedAttempt;
          this.validateSingleInput(inputEl, cleanExpected);
        }

        // SPEC_044: 학습 기록용 빈칸 결과
        let lastReported: boolean | null = null;
        const report = (ok: boolean) => {
          if (lastReported === ok) return;
          lastReported = ok;
          this.callbacks.onBlankResult?.(this.segment, cleanExpected, ok);
        };
        inputEl.addEventListener("change", () => {
          if (inputEl.value.trim() && !dictationMatches(inputEl.value, cleanExpected)) report(false);
        });

        inputEl.addEventListener("input", () => {
          if (!this.segment.userDictationAttempts) {
            this.segment.userDictationAttempts = {};
          }
          this.segment.userDictationAttempts[idx] = inputEl.value;
          const solved = this.validateSingleInput(inputEl, cleanExpected);
          if (solved) report(true);
          if (solved) this.focusNextBlank(inputs, inputEl);
          this.checkAllSolved(inputs);
        });

        inputs.push({ idx, expected: cleanExpected, inputEl });
      } else {
        const isStressed = skeletonIndices.has(idx);
        tokenRow.createSpan({
          cls: `ear-coach-word-token ${isStressed ? "is-stressed-skeleton" : "is-context-word"}`,
          text: rawWord + " ",
        });
      }
    });

    if (isMobileApp()) {
      this.renderMobileHeardRow();
    } else {
      this.renderDesktopHeardRow();
    }
  }

  private renderDesktopHeardRow(): void {
    // "What did it sound like to you?" phonetic memo + instant tutor ask
    const heardRow = this.containerEl.createDiv({ cls: "ear-coach-heard-row" });
    const heardInput = heardRow.createEl("input", {
      cls: "ear-coach-heard-input",
      type: "text",
      attr: {
        placeholder: "👂 내 귀에 들린 대로 적어보세요 (예: 아마나 고 / 바러 카)",
      },
    });

    const askWhyBtn = heardRow.createEl("button", {
      cls: "ear-coach-btn ear-coach-btn-accent",
      text: "🎙️ 왜 이렇게 들리는지 agy에게 묻기",
    });
    askWhyBtn.addEventListener("click", () => {
      this.callbacks.onAskTutorWithHeardText(this.segment, heardInput.value.trim());
    });
  }

  private renderMobileHeardRow(): void {
    const heardRow = this.containerEl.createDiv({ cls: "ear-coach-heard-row" });
    heardRow.createEl("input", {
      cls: "ear-coach-heard-input",
      type: "text",
      attr: {
        placeholder: "👂 내 귀에 들린 대로 메모해 보세요 (예: 아마나 고 / 바러 카)",
      },
    });
  }

  private validateSingleInput(inputEl: HTMLInputElement, expected: string): boolean {
    if (!inputEl.value.trim()) {
      inputEl.removeClass("is-correct", "is-wrong");
      return false;
    }

    // SPEC_030: 아포스트로피 무시 + 같은 말 줄임('cause=because) 정답
    if (dictationMatches(inputEl.value, expected)) {
      inputEl.addClass("is-correct");
      inputEl.removeClass("is-wrong");
      return true;
    } else {
      inputEl.addClass("is-wrong");
      inputEl.removeClass("is-correct");
      return false;
    }
  }

  /** SPEC_030: 맞히면 같은 카드의 다음 안 맞힌 빈칸으로 커서 이동(없으면 그대로) */
  private focusNextBlank(
    inputs: Array<{ idx: number; expected: string; inputEl: HTMLInputElement }>,
    current: HTMLInputElement
  ): void {
    const at = inputs.findIndex((item) => item.inputEl === current);
    const next = inputs.slice(at + 1).find((item) => !item.inputEl.hasClass("is-correct"));
    if (next) next.inputEl.focus();
  }

  private checkAllSolved(
    inputs: Array<{ idx: number; expected: string; inputEl: HTMLInputElement }>
  ): void {
    if (inputs.length === 0) return;
    const allCorrect = inputs.every((item) =>
      this.validateSingleInput(item.inputEl, item.expected)
    );
    if (allCorrect) {
      this.callbacks.onDictationSolved(this.segment);
    }
  }
}
