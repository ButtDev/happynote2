/**
 * SPEC_044: 오늘의 문장 워밍업(순수 함수).
 * 지금 연 영상에서 차례인 핀 문장 + 오늘 전에 틀리고 아직 안 맞힌 빈칸 문장을 최대 5개.
 * 날짜는 달력 날짜(지역 시간) — tzOffsetMin은 Date#getTimezoneOffset() 값(KST = -540).
 */

export const TODAY_SENTENCES_MAX = 5;
/** 같은 문장 = 시작 시각 차이 이 값 미만(초) — learningStore SAME_PIN_SEC과 같은 값 */
const SAME_START_SEC = 0.5;

/** reviewQueue.dayNumber와 같은 셈(시험 러너가 확장자 없는 import를 못 읽어 여기 둠) */
function dayNumber(ms: number, tzOffsetMin: number): number {
  return Math.floor((ms - tzOffsetMin * 60_000) / 86_400_000);
}

export interface WrongBlankLike {
  videoId: string;
  start: number;
  at: string;
}

/** 틀린 빈칸(새것부터) → 이 영상·오늘 전 것의 문장 번호(중복 없이, blanks 순서) */
export function wrongBlankSegmentIndices(
  segments: readonly { index: number; start: number }[],
  blanks: readonly WrongBlankLike[],
  videoId: string,
  nowMs: number,
  tzOffsetMin: number
): number[] {
  const today = dayNumber(nowMs, tzOffsetMin);
  const out: number[] = [];
  for (const b of blanks) {
    if (b.videoId !== videoId) continue;
    const at = Date.parse(b.at);
    if (!Number.isFinite(at) || dayNumber(at, tzOffsetMin) >= today) continue;
    const seg = segments.find((s) => Math.abs(s.start - b.start) < SAME_START_SEC);
    if (seg && !out.includes(seg.index)) out.push(seg.index);
  }
  return out;
}

/** 차례인 핀 먼저, 그 뒤 틀린 빈칸 문장 — 중복 빼고 max개 */
export function pickTodaySentences(dueIdx: readonly number[], wrongIdx: readonly number[], max: number = TODAY_SENTENCES_MAX): number[] {
  const out: number[] = [];
  for (const i of [...dueIdx, ...wrongIdx]) {
    if (out.length >= max) break;
    if (!out.includes(i)) out.push(i);
  }
  return out;
}
