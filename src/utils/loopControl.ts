/**
 * SPEC_023: 공통 컨트롤 반복 버튼 — 모드 순환·버튼 글자·반복 판정·자동 따라가기 판정 (순수 함수, obsidian import 없음).
 */
import { formatSecondsToTimestamp } from "./youtubeUrlParser.ts";

export type LoopMode = "off" | "one" | "count";

export function nextLoopMode(mode: LoopMode): LoopMode {
  if (mode === "off") return "one";
  if (mode === "one") return "count";
  return "off";
}

export function loopButtonText(
  mode: LoopMode,
  count: number,
  mobile: boolean,
  seg?: { start: number; end: number } | null
): string {
  if (mobile) {
    if (mode === "one") return "🔂 ∞";
    if (mode === "count") return `🔂 ×${count}`;
    return "🔁 OFF";
  }
  if (mode === "off") return "🔁 반복: OFF";
  const range = seg ? ` [${formatSecondsToTimestamp(seg.start)} ~ ${formatSecondsToTimestamp(seg.end)}]` : "";
  return mode === "one" ? `🔂 한 문장 무한${range}` : `🔂 ${count}번씩 다음 문장${range}`;
}

export interface LoopTickInput {
  mode: LoopMode;
  nowMs: number;
  current: number;
  end: number;
  pad: number;
  playsDone: number;
  count: number;
  gapSec: number;
  resumeAtMs: number | null;
}

export type LoopAction =
  | { kind: "none" }
  | { kind: "repeat" }
  | { kind: "advance" }
  | { kind: "gap"; resumeAtMs: number };

export function decideLoopTick(input: LoopTickInput): LoopAction {
  if (input.mode === "off") return { kind: "none" };
  const next = (): LoopAction =>
    input.mode === "count" && input.playsDone + 1 >= input.count ? { kind: "advance" } : { kind: "repeat" };
  if (input.resumeAtMs !== null) {
    return input.nowMs < input.resumeAtMs ? { kind: "none" } : next();
  }
  if (input.current < input.end + Math.max(input.pad, 0.35)) return { kind: "none" };
  if (input.gapSec > 0) return { kind: "gap", resumeAtMs: input.nowMs + input.gapSec * 1000 };
  return next();
}

/**
 * SPEC_023 회차 2: 반복 중에는 하이라이트·따라가기 대상을 반복 문장에 고정한다.
 * (반복 문장 끝 + 여유 동안 재생 시각이 다음 문장에 들어가 카드가 내려갔다 올라오는 것을 막음)
 */
export function followTargetIndex(activeIdx: number, loopIdx: number | null): number {
  return loopIdx ?? activeIdx;
}

export const USER_SCROLL_PAUSE_MS = 4000;

export function shouldAutoFollow(input: { enabled: boolean; nowMs: number; userScrollUntilMs: number }): boolean {
  return input.enabled && input.nowMs >= input.userScrollUntilMs;
}
