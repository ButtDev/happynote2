/**
 * SPEC_010: 가로 화면 카드 위 좌우 스와이프 → 옵시디언 옆 메뉴(drawer) 열기.
 * 세로에서 옵시디언이 하던 동작과 같은 방향: 오른쪽으로 밀면 왼쪽 메뉴, 왼쪽으로 밀면 오른쪽 메뉴.
 */
export type SwipeAction = "open-left" | "open-right" | null;

export const SWIPE_MIN_DX = 60;
export const SWIPE_AXIS_RATIO = 2;
export const SWIPE_MAX_MS = 600;

export function classifySwipe(dx: number, dy: number, dtMs: number): SwipeAction {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dtMs)) return null;
  if (dtMs < 0 || dtMs > SWIPE_MAX_MS) return null;
  if (Math.abs(dx) < SWIPE_MIN_DX) return null;
  if (Math.abs(dx) < SWIPE_AXIS_RATIO * Math.abs(dy)) return null;
  return dx > 0 ? "open-left" : "open-right";
}
