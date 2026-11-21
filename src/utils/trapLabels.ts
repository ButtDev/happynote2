/**
 * 듣기 함정 코드 → 짧은 한국어 이름(SPEC_026 문장 카드 힌트, SPEC_028 카드 배지).
 * 모르는 값은 그대로 둔다. SPEED_SPIKE는 배지·힌트에서 뺀다(빠르기는 WPM이 이미 보여 줌).
 */
const TRAP_LABELS: Record<string, string> = {
  LINKING: "연음",
  FLAP_T: "플랩 t",
  WEAK_FORM: "약형",
  ELISION: "탈락",
  SLANG: "구어",
};

export function trapLabel(trap: string): string {
  return TRAP_LABELS[trap] ?? trap;
}

/** 보여 줄 함정 이름 목록 — SPEED_SPIKE·빈 값 빼고, 같은 이름은 한 번만. */
export function trapLabelList(traps: readonly string[] | undefined | null): string[] {
  const out: string[] = [];
  for (const t of traps ?? []) {
    if (!t || t === "SPEED_SPIKE") continue;
    const l = trapLabel(t);
    if (!out.includes(l)) out.push(l);
  }
  return out;
}
