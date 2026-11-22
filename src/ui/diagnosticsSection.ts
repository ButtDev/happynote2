import { Notice, Platform } from "obsidian";
import { diagnostics, DiagnosticsLog, formatDiagnosticsReport } from "../services/diagnostics";

/** SPEC_038: 설정 「🩺 진단 복사」 */
export interface DiagnosticsSectionOptions {
  appVersion: string;
  obsidianVersion?: string;
  /** 가릴 비밀 값(API 키 등) */
  secrets: () => string[];
  log?: DiagnosticsLog;
  /** 시험용 클립보드 */
  writeClipboard?: (text: string) => Promise<void>;
}

export function platformName(): string {
  if (Platform.isAndroidApp) return "android";
  if ((Platform as { isIosApp?: boolean }).isIosApp) return "ios";
  if (Platform.isMobile) return "mobile";
  return "desktop";
}

export function buildDiagnosticsReport(opts: DiagnosticsSectionOptions): { text: string; count: number } {
  const log = opts.log ?? diagnostics;
  const entries = log.list();
  const text = formatDiagnosticsReport(
    {
      now: new Date().toISOString(),
      appVersion: opts.appVersion,
      obsidianVersion: opts.obsidianVersion,
      platform: platformName(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      screen: typeof window !== "undefined" ? `${window.innerWidth}×${window.innerHeight}` : undefined,
    },
    entries,
    opts.secrets(),
  );
  return { text, count: entries.length };
}

export function renderDiagnosticsSection(containerEl: HTMLElement, opts: DiagnosticsSectionOptions): HTMLElement {
  const log = opts.log ?? diagnostics;
  const row = containerEl.createDiv({ cls: "ear-coach-diagnostics" });
  const info = row.createDiv({ cls: "ear-coach-videodata-info" });
  info.createDiv({ text: "🩺 진단 복사", cls: "ear-coach-videodata-title" });
  const n = log.size;
  info.createDiv({
    text: n ? `최근 오류 ${n}개 — 문제가 생기면 복사해서 보내 주세요.` : "기록된 오류가 없어요. 문제가 생기면 복사해서 보내 주세요.",
    cls: "ear-coach-videodata-meta",
  });
  const btn = row.createEl("button", { text: "복사" });
  btn.addEventListener("click", async () => {
    const { text, count } = buildDiagnosticsReport(opts);
    try {
      const write = opts.writeClipboard ?? ((t: string) => navigator.clipboard.writeText(t));
      await write(text);
      new Notice(`📋 진단을 복사했어요 (오류 ${count}개)`);
    } catch (e) {
      new Notice(`복사하지 못했어요: ${String((e as Error)?.message ?? e)}`);
    }
  });
  return row;
}

/** 처리 안 된 오류(window error·unhandledrejection)를 기록한다. 해제 함수를 돌려준다. */
export function installDiagnosticsCapture(win: Window, log: DiagnosticsLog = diagnostics): () => void {
  const onError = (ev: ErrorEvent) => log.record("처리 안 된 오류", ev.error ?? ev.message);
  const onRejection = (ev: PromiseRejectionEvent) => log.record("처리 안 된 오류", ev.reason);
  win.addEventListener("error", onError);
  win.addEventListener("unhandledrejection", onRejection);
  return () => {
    win.removeEventListener("error", onError);
    win.removeEventListener("unhandledrejection", onRejection);
  };
}
export { diagnostics } from "../services/diagnostics";
