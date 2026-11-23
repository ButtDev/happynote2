/**
 * SPEC_045: 쉐도잉 녹음 비교 — 순수 규칙(import 없음, 시험 러너가 그대로 읽는다).
 * 녹음 한도 · 녹음 형식 고르기 · 버튼 글자 · 실패 이유.
 */

/** 문장 길이에 더하는 여유(초) */
export const SHADOW_EXTRA_SEC = 2;
/** 녹음 최대 길이(초) — audioClip CLIP_MAX_SEC와 같은 값 */
export const SHADOW_MAX_SEC = 20;
/** 비교: 원음 시작 뒤 내 녹음까지 문장 길이에 더하는 틈(초) */
export const SHADOW_COMPARE_GAP_SEC = 0.3;
/** MediaRecorder에 물어볼 형식(앞이 먼저) */
export const SHADOW_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];

export const SHADOW_LABELS = {
  idle: "🎙",
  idleAria: "따라 말하기 녹음",
  compare: "🔁 비교",
  compareAria: "원음과 내 녹음 듣기",
  stopAria: "녹음 멈추기",
};

/** 실패 이유(해요체) — 알림은 `❌ 녹음 — <이유>` */
export const SHADOW_FAILURES = {
  denied: "마이크 권한을 허용해 주세요",
  noMic: "마이크를 찾지 못했어요",
  unsupported: "이 기기에선 녹음할 수 없어요",
};

/** 녹음 한도(초) = min(문장 길이 + 2, 20). 길이가 0 이하·숫자 아님 → 20 */
export function shadowLimitSec(duration: unknown): number {
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return SHADOW_MAX_SEC;
  return Math.min(duration + SHADOW_EXTRA_SEC, SHADOW_MAX_SEC);
}

/** 되는 형식 중 처음 것, 없으면 ""(브라우저 기본) */
export function pickRecorderMime(isSupported: (mime: string) => boolean): string {
  for (const m of SHADOW_MIME_CANDIDATES) {
    try {
      if (isSupported(m)) return m;
    } catch {
      /* 물어보다 오류 → 안 되는 것으로 */
    }
  }
  return "";
}

/** 녹음 중 버튼 글자 `⏹ <남은 초>`(올림, 0 밑으로 안 감) */
export function shadowRecordingLabel(remainingSec: number): string {
  const n = Number.isFinite(remainingSec) ? Math.max(0, Math.ceil(remainingSec - 1e-6)) : 0;
  return `⏹ ${n}`;
}

/** 녹음 실패 오류 → 사람이 읽는 이유(모르는 오류는 null — 공용 알림 규칙에 맡김) */
export function shadowFailureReason(err: unknown): string | null {
  const name = err && typeof err === "object" ? (err as { name?: unknown }).name : undefined;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return SHADOW_FAILURES.denied;
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "NotReadableError") return SHADOW_FAILURES.noMic;
  if (name === "ShadowUnsupported" || name === "NotSupportedError") return SHADOW_FAILURES.unsupported;
  return null;
}
