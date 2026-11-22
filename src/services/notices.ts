/**
 * SPEC_042: 알림 문구 — 실패는 「무엇 — 원인 한 줄」, 원문 오류는 진단 기록에만.
 * obsidian import 없음(시험에서 그대로 쓴다).
 */
import { HTTP_MESSAGES, RETRYABLE_STATUS } from "./http.ts";

export const NOTICE_CAUSES = {
  offline: HTTP_MESSAGES.offline,
  timeout: HTTP_MESSAGES.timeout,
  busy: "서버가 잠깐 바빠요",
  unknown: "알 수 없는 오류 — 🩺 진단 복사로 보내 주세요",
};

/** 「다시」 버튼 알림이 보이는 시간(ms)과 버튼 글자 */
export const RETRY_NOTICE_MS = 10000;
export const RETRY_LABEL = "다시";

/** 사람이 읽을 수 있게 이미 만든 실패 이유(해요체). 알림에 그대로 붙는다. */
export class KnownFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnownFailure";
  }
}

const TIMEOUT_TEXT = /^응답이 없어요 \(\d+초\)$/;

function fromText(text: string): string | null {
  const t = text.trim();
  if (t === NOTICE_CAUSES.offline) return t;
  if (TIMEOUT_TEXT.test(t)) return t;
  return null;
}

/** 오류 → 사람이 읽는 원인 한 줄(네 가지 또는 KnownFailure 글). */
export function failureCause(err: unknown): string {
  if (err === null || err === undefined) return NOTICE_CAUSES.unknown;
  if (typeof err === "string") return fromText(err) ?? NOTICE_CAUSES.unknown;
  if (typeof err !== "object") return NOTICE_CAUSES.unknown;
  const o = err as { name?: unknown; kind?: unknown; status?: unknown; message?: unknown };
  const message = typeof o.message === "string" ? o.message : "";
  if (o.name === "KnownFailure" && message) return message;
  if (o.name === "HttpFailure") {
    if (o.kind === "offline") return NOTICE_CAUSES.offline;
    if (o.kind === "timeout") return fromText(message) ?? NOTICE_CAUSES.timeout(0);
  }
  if (typeof o.status === "number" && RETRYABLE_STATUS.includes(o.status)) return NOTICE_CAUSES.busy;
  if (o.kind === "busy") return NOTICE_CAUSES.busy;
  return fromText(message) ?? NOTICE_CAUSES.unknown;
}

/** `❌ <무엇> — <원인>` */
export function failureNotice(what: string, err: unknown): string {
  return `❌ ${what} — ${failureCause(err)}`;
}
