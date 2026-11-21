/**
 * SPEC_027: 안 들림 핀 문장 간격 재청취 큐(순수 함수).
 * 핀을 켠 날(또는 마지막 복습일)부터 연속 성공 횟수에 따라 1·3·7·14일 뒤 「오늘 다시 들을 문장」.
 * 실패하면 처음(1일)부터. 연속 성공 2번이면 핀 해제를 제안(자동 해제 아님).
 * 날짜는 달력 날짜(지역 시간)로 센다 — tzOffsetMin은 Date#getTimezoneOffset() 값(KST = -540).
 */

export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14] as const;
export const GRADUATE_STREAK = 2;
const DAY_MS = 86_400_000;

export interface ReviewRecord {
  at: string;
  ok: boolean;
}

export interface ReviewState {
  isPinned: boolean;
  pinnedAt?: string;
  reviews?: ReviewRecord[];
}

export function dayNumber(ms: number, tzOffsetMin: number): number {
  return Math.floor((ms - tzOffsetMin * 60_000) / DAY_MS);
}

/** 마지막 실패 뒤 연속 성공 횟수 */
export function successStreak(reviews: readonly ReviewRecord[] | undefined): number {
  let n = 0;
  for (let i = (reviews?.length ?? 0) - 1; i >= 0; i--) {
    if (!reviews![i].ok) break;
    n++;
  }
  return n;
}

/** 다음 복습까지 기다릴 날 수 */
export function reviewIntervalDays(s: ReviewState): number {
  const k = Math.min(successStreak(s.reviews), REVIEW_INTERVAL_DAYS.length - 1);
  return REVIEW_INTERVAL_DAYS[k];
}

/** 오늘 다시 들을 차례인가. 핀 시각을 모르는 옛 핀은 바로 차례. */
export function isReviewDue(s: ReviewState, nowMs: number, tzOffsetMin: number): boolean {
  if (!s.isPinned) return false;
  const last = s.reviews && s.reviews.length > 0 ? s.reviews[s.reviews.length - 1].at : s.pinnedAt;
  const base = last ? Date.parse(last) : NaN;
  if (!Number.isFinite(base)) return true;
  return dayNumber(nowMs, tzOffsetMin) - dayNumber(base, tzOffsetMin) >= reviewIntervalDays(s);
}

/** 오늘 큐(문장 번호, 원래 순서) */
export function dueIndices(segments: readonly (ReviewState & { index: number })[], nowMs: number, tzOffsetMin: number): number[] {
  return segments.filter((s) => isReviewDue(s, nowMs, tzOffsetMin)).map((s) => s.index);
}

/** 복습 결과를 덧붙인 새 기록 */
export function withReview(reviews: readonly ReviewRecord[] | undefined, ok: boolean, atIso: string): ReviewRecord[] {
  return [...(reviews ?? []), { at: atIso, ok }];
}

/** 핀 해제를 제안할까(연속 성공 2번 이상) */
export function shouldGraduate(s: ReviewState): boolean {
  return s.isPinned && successStreak(s.reviews) >= GRADUATE_STREAK;
}
