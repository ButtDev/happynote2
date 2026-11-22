/**
 * SPEC_041: 네트워크 요청 정책 — 시간 제한·잠깐 실패 재시도·오프라인 구분을 한 곳에서.
 * obsidian import 없음. 요청 함수·대기·온라인 여부는 주입(시험에서 그대로 쓴다).
 */

export interface HttpPolicy {
  /** 이 시간 안에 응답이 없으면 실패(ms) */
  timeoutMs: number;
  /** 첫 시도 뒤 더 해 보는 횟수 */
  retries: number;
  /** n번째 재시도 전 대기(ms). 모자라면 마지막 값 */
  backoffMs: number[];
}

export type HttpFailureKind = "offline" | "timeout" | "network" | "status";

/** 재시도해도 안 된 요청. message는 사람이 읽는 한 줄(알림에 그대로 붙음). */
export class HttpFailure extends Error {
  kind: HttpFailureKind;
  status: number | null;
  attempts: number;
  constructor(kind: HttpFailureKind, message: string, status: number | null = null, attempts = 1) {
    super(message);
    this.name = "HttpFailure";
    this.kind = kind;
    this.status = status;
    this.attempts = attempts;
  }
}

/** 잠깐 문제라 다시 해 볼 만한 상태 코드 */
export const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504];

export const HTTP_POLICIES = {
  /** 사전·발음 파일·자막·원음 구간처럼 다시 받아도 되는 GET */
  fetch: { timeoutMs: 15000, retries: 1, backoffMs: [800] },
  /** AI: 자체 재시도(aiAnalysis busy)가 있어 여기선 시간 제한만 */
  ai: { timeoutMs: 90000, retries: 0, backoffMs: [] },
  /** AnkiConnect(기기 안): 같은 카드가 두 번 들어가면 안 되므로 재시도 없음 */
  anki: { timeoutMs: 20000, retries: 0, backoffMs: [] },
  /** 장면 그림: 대체 경로가 있어 짧게 */
  probe: { timeoutMs: 10000, retries: 0, backoffMs: [] },
} satisfies Record<string, HttpPolicy>;

export const HTTP_MESSAGES = {
  offline: "인터넷 연결이 없어요",
  timeout: (sec: number) => `응답이 없어요 (${sec}초)`,
};

export interface HttpDeps {
  sleep: (ms: number) => Promise<void>;
  /** false면 오프라인(모름이면 true) */
  isOnline: () => boolean;
}

const TIMEOUT = Symbol("timeout");

function statusOf(v: unknown): number | null {
  const s = (v as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : null;
}

/**
 * request를 정책대로 부른다. 돌려준 응답의 status가 재시도 대상이면 다시 해 보고,
 * 끝까지 그러면 마지막 응답을 그대로 돌려준다(부르는 쪽이 상태로 판단하던 동작 유지).
 * throw·시간 초과는 재시도 뒤 HttpFailure로.
 */
export async function sendWithPolicy<R>(request: () => Promise<R>, policy: HttpPolicy, deps: HttpDeps): Promise<R> {
  const total = policy.retries + 1;
  let lastErr: HttpFailure | null = null;
  for (let attempt = 1; attempt <= total; attempt++) {
    if (attempt > 1) {
      const waits = policy.backoffMs;
      await deps.sleep(waits.length > 0 ? waits[Math.min(attempt - 2, waits.length - 1)] : 0);
    }
    if (!deps.isOnline()) {
      lastErr = new HttpFailure("offline", HTTP_MESSAGES.offline, null, attempt);
      continue;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), policy.timeoutMs);
    });
    try {
      const got = await Promise.race([request(), timeout]);
      if (got === TIMEOUT) {
        lastErr = new HttpFailure("timeout", HTTP_MESSAGES.timeout(Math.round(policy.timeoutMs / 1000)), null, attempt);
        continue;
      }
      const st = statusOf(got);
      if (st !== null && RETRYABLE_STATUS.includes(st) && attempt < total) continue;
      return got;
    } catch (e) {
      const st = statusOf(e);
      if (!deps.isOnline()) lastErr = new HttpFailure("offline", HTTP_MESSAGES.offline, null, attempt);
      else if (st !== null) {
        // requestUrl(throw: true)의 4xx·5xx — 원래 오류 글을 살림
        const msg = e instanceof Error ? e.message : `HTTP ${st}`;
        if (!RETRYABLE_STATUS.includes(st)) throw new HttpFailure("status", msg, st, attempt);
        lastErr = new HttpFailure("status", msg, st, attempt);
      } else {
        lastErr = new HttpFailure("network", e instanceof Error ? e.message : String(e), null, attempt);
      }
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }
  throw lastErr ?? new HttpFailure("network", "요청 실패", null, total);
}
