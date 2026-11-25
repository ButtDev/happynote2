/**
 * SPEC_038: 진단 기록 — 최근 오류를 메모리 링버퍼에 모으고, 비밀 값을 가린 보고 글을 만든다.
 * obsidian import 없음(시험에서 그대로 쓴다).
 */

export interface DiagnosticsEntry {
  /** ISO 시각(처음 생긴 때) */
  at: string;
  /** 단계 이름(예: 「Anki 저장」) */
  stage: string;
  /** 한 줄 메시지 */
  message: string;
  /** 스택 앞 3줄(있으면) */
  detail?: string;
  /** 연달아 같은 단계·메시지가 온 횟수 */
  count: number;
}

export interface DiagnosticsEnv {
  /** 보고 시각(ISO) */
  now: string;
  appVersion: string;
  obsidianVersion?: string;
  platform: string;
  userAgent?: string;
  screen?: string;
}

export const DIAGNOSTICS_MAX_ENTRIES = 50;

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** SPEC_057: 오류 객체의 `detail` 문자열(한 줄), 없거나 빈 글이면 null */
export function errorDetail(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const d = (err as { detail?: unknown }).detail;
  if (typeof d !== "string") return null;
  const t = oneLine(d);
  return t || null;
}

/** 무엇이 throw되든 메시지·스택을 꺼낸다. */
export function describeError(err: unknown): { message: string; detail?: string } {
  if (err instanceof Error) {
    const detail = err.stack
      ? err.stack
          .split("\n")
          .slice(1, 4)
          .map((l) => l.trim())
          .filter(Boolean)
          .join("\n")
      : "";
    const message = oneLine(err.message || err.name || "Error");
    // SPEC_057: HttpFailure.detail(원래 오류 글)을 한 줄에 덧붙임
    const extra = errorDetail(err);
    return { message: extra && !message.includes(extra) ? `${message} (${extra})` : message, detail: detail || undefined };
  }
  if (typeof err === "string") return { message: oneLine(err) };
  if (err && typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return { message: oneLine(m) };
    try {
      return { message: oneLine(JSON.stringify(err)) };
    } catch {
      return { message: "[object]" };
    }
  }
  return { message: String(err) };
}

export class DiagnosticsLog {
  private entries: DiagnosticsEntry[] = [];
  private listeners = new Set<() => void>();

  private max: number;
  private clock: () => string;

  constructor(max: number = DIAGNOSTICS_MAX_ENTRIES, clock: () => string = () => new Date().toISOString()) {
    this.max = max;
    this.clock = clock;
  }

  /** 오류 하나를 기록한다. 바로 앞과 단계·메시지가 같으면 count만 올린다. */
  record(stage: string, err: unknown): void {
    const { message, detail } = describeError(err);
    const last = this.entries[this.entries.length - 1];
    if (last && last.stage === stage && last.message === message) {
      last.count += 1;
    } else {
      this.entries.push({ at: this.clock(), stage, message, detail, count: 1 });
      if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max);
    }
    for (const fn of this.listeners) fn();
  }

  list(): DiagnosticsEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 비밀 값·키 모양·URL 쿼리를 가린다. */
export function redactDiagnostics(text: string, secrets: string[] = []): string {
  let out = text;
  for (const s of secrets) {
    const v = (s ?? "").trim();
    if (v.length >= 6) out = out.replace(new RegExp(escapeRegExp(v), "g"), "***");
  }
  out = out
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "***")
    .replace(/gsk_[0-9A-Za-z]{10,}/g, "***")
    .replace(/sk-[0-9A-Za-z_-]{10,}/g, "***")
    .replace(/\b(key|token|api_key|apikey|access_token)=[^&\s"']+/gi, "$1=***")
    .replace(/(https?:\/\/[^\s?#"']+)\?[^\s#"']*/g, "$1?…");
  return out;
}

/** 클립보드에 넣을 보고 글. 전체를 한 번 더 가린다. */
export function formatDiagnosticsReport(env: DiagnosticsEnv, entries: DiagnosticsEntry[], secrets: string[] = []): string {
  const lines: string[] = [];
  lines.push(`Ear-Coach 진단 ${env.now}`);
  lines.push(`앱 ${env.appVersion} · Obsidian ${env.obsidianVersion || "?"} · ${env.platform}`);
  if (env.userAgent) lines.push(`기기 ${env.userAgent}`);
  if (env.screen) lines.push(`화면 ${env.screen}`);
  if (!entries.length) {
    lines.push("오류 없음");
  } else {
    lines.push(`오류 ${entries.length}개 (최근 ${DIAGNOSTICS_MAX_ENTRIES}개까지)`);
    for (const e of entries) {
      lines.push(`[${e.at}] ${e.stage}${e.count > 1 ? ` ×${e.count}` : ""}: ${e.message}`);
      if (e.detail) for (const d of e.detail.split("\n")) lines.push(`    ${d}`);
    }
  }
  return redactDiagnostics(lines.join("\n"), secrets);
}

/** 플러그인 전체가 함께 쓰는 기록(catch 자리에서 `diagnostics.record(단계, err)`). */
export const diagnostics = new DiagnosticsLog();
