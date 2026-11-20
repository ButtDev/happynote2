/** SPEC_011: 가로 화면 영상 열 폭(%) — 좌우 비율 조절 바. */
export const LANDSCAPE_LEFT_DEFAULT = 58;
export const LANDSCAPE_LEFT_MIN = 30;
export const LANDSCAPE_LEFT_MAX = 70;

export function clampLandscapeLeftPercent(pct: number): number {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return LANDSCAPE_LEFT_DEFAULT;
  return Math.max(LANDSCAPE_LEFT_MIN, Math.min(LANDSCAPE_LEFT_MAX, Math.round(pct)));
}

export function landscapeLeftPercentFromPointer(
  clientX: number,
  containerLeft: number,
  containerWidth: number
): number {
  return clampLandscapeLeftPercent(((clientX - containerLeft) / Math.max(200, containerWidth)) * 100);
}
