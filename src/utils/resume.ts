/**
 * SPEC_046: 이어 보기 — 영상별 마지막 재생 위치를 언제 저장하고 어디서 다시 열지 정하는 순수 함수.
 * import 없음(strip-types 시험이 바로 읽음).
 */
export const RESUME_MIN_SEC = 5;
export const RESUME_END_MARGIN_SEC = 5;
export const POSITION_SAVE_EVERY_SEC = 10;

/** 저장된 위치 → 다시 열 때 옮길 시각. 너무 앞(5초 미만)·끝까지 봄(마지막 문장 끝 5초 안)이면 null */
export function resumePoint(pos: { seconds: number } | null | undefined, lastSegmentEnd: number): number | null {
  if (!pos || typeof pos.seconds !== "number" || !Number.isFinite(pos.seconds)) return null;
  if (pos.seconds < RESUME_MIN_SEC) return null;
  if (pos.seconds > lastSegmentEnd - RESUME_END_MARGIN_SEC) return null;
  return pos.seconds;
}

/** 재생 중 시각 갱신 때 저장할지: 처음이거나 마지막 저장과 10초 이상 차이(앞·뒤 모두) */
export function shouldSavePosition(lastSavedSec: number | null, nowSec: number): boolean {
  if (lastSavedSec === null) return true;
  return Math.abs(nowSec - lastSavedSec) >= POSITION_SAVE_EVERY_SEC;
}
