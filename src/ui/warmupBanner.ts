/**
 * SPEC_044: 툴바 맨 위 한 줄 「☀️ 오늘의 문장 N개 · 시작 · ✕」. SPEC_050: 같은 자리에 「🎧 … 퀴즈」.
 * 툴바 맨 끝에 붙이고 CSS order로 맨 위에 올린다(첫 그룹 = 필터 알약 스타일을 안 건드림).
 */
export function renderWarmupBanner(toolbar: HTMLElement, text: string, closeAria: string, onStart: () => void, onClose: () => void): HTMLElement {
  const row = toolbar.createDiv({ cls: "ear-coach-warmup" });
  row.createSpan({ cls: "ear-coach-warmup-text", text });
  const start = row.createEl("button", { cls: "ear-coach-btn ear-coach-btn-primary", text: "시작" });
  start.addEventListener("click", onStart);
  const close = row.createEl("button", { cls: "ear-coach-btn", text: "✕", attr: { "aria-label": closeAria } });
  close.addEventListener("click", onClose);
  return row;
}
