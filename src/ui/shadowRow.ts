/**
 * SPEC_045: 정답(3단계) 카드의 쉐도잉 버튼 줄 — 🎙 녹음(⏹ 남은 초) · 🔁 비교.
 * 상태는 공용 ShadowRecorder에 있고, 줄은 그 상태를 그대로 그린다(카드를 다시 그려도 녹음은 이어짐).
 */
import { SHADOW_LABELS, shadowLimitSec, shadowRecordingLabel } from "../utils/shadowing";
import { sharedShadowRecorder, ShadowRecorder, ShadowTarget } from "./shadowRecorder";

export interface ShadowRowHooks {
  playOriginal: () => void;
  stopOriginal: () => void;
  /** false면 카드가 화면에서 빠진 것 — 녹음 중이면 마이크를 닫는다 */
  isAlive: () => boolean;
}

export function renderShadowRow(parent: HTMLElement, target: ShadowTarget, hooks: ShadowRowHooks, recorder: ShadowRecorder = sharedShadowRecorder()): HTMLElement {
  const row = parent.createDiv({ cls: "ear-coach-shadow-row" });
  const recBtn = row.createEl("button", { cls: "ear-coach-mini-btn ear-coach-shadow-rec" });
  const cmpBtn = row.createEl("button", { cls: "ear-coach-mini-btn ear-coach-shadow-compare", text: SHADOW_LABELS.compare, attr: { "aria-label": SHADOW_LABELS.compareAria } });

  recBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (recorder.status(target).recording) recorder.stop();
    else void recorder.start(target, shadowLimitSec(target.duration), hooks.isAlive);
  });
  cmpBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    recorder.compare(target, hooks.playOriginal, hooks.stopOriginal);
  });

  const paint = () => {
    const st = recorder.status(target);
    const recText = st.recording ? shadowRecordingLabel(st.remainingSec) : SHADOW_LABELS.idle;
    if (recBtn.textContent !== recText) recBtn.setText(recText);
    recBtn.setAttribute("aria-label", st.recording ? SHADOW_LABELS.stopAria : SHADOW_LABELS.idleAria);
    recBtn.toggleClass("is-recording", st.recording);
    cmpBtn.toggleClass("is-comparing", st.comparing);
    cmpBtn.toggleClass("is-hidden", !st.hasRecording || st.recording);
  };
  paint();
  const off = recorder.subscribe(() => {
    if (!row.isConnected) {
      off();
      return;
    }
    paint();
  });
  return row;
}
