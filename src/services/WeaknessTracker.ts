import { App, normalizePath, TFile } from "obsidian";
import { ListeningTrapType, TranscriptSegment } from "../types/transcript";
import {
  parseWeaknessDashboard,
  renderWeaknessDashboard,
  upsertWeaknessEntry,
  WeaknessEntry,
} from "../utils/weaknessDashboard";

export type WeaknessRecordEntry = WeaknessEntry;

/**
 * Automatically aggregates the user's listening blindspots into `My_Listening_Weakness.md`.
 * SPEC_055: 첫 기록 때 대시보드 끝 숨은 주석에서 지난 기록을 읽어 이어 쌓는다(앱 다시 켜도 안 지움).
 */
export class WeaknessTracker {
  private entries: WeaknessRecordEntry[] = [];
  private loaded = false;
  private app: App;
  private getDashboardPath: () => string;

  constructor(app: App, getDashboardPath: () => string) {
    this.app = app;
    this.getDashboardPath = getDashboardPath;
  }

  private targetPath(): string {
    return normalizePath(this.getDashboardPath() || "YouTube Listening/My_Listening_Weakness.md");
  }

  private async loadOnce(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const file = this.app.vault.getAbstractFileByPath(this.targetPath());
    if (file instanceof TFile) {
      this.entries = parseWeaknessDashboard(await this.app.vault.read(file));
    }
  }

  public async recordWeakSegment(params: {
    videoId: string;
    videoTitle: string;
    notePath: string;
    segment: TranscriptSegment;
    userHeard?: string;
  }): Promise<void> {
    await this.loadOnce();
    const traps: ListeningTrapType[] = params.segment.analysis?.traps?.length
      ? params.segment.analysis.traps
      : ["LINKING"];

    this.entries = upsertWeaknessEntry(this.entries, {
      videoId: params.videoId,
      videoTitle: params.videoTitle,
      notePath: params.notePath,
      segmentStart: params.segment.start,
      segmentText: params.segment.text,
      phoneticKr: params.segment.analysis?.phoneticKr || "",
      userHeard: params.userHeard,
      traps,
      recordedAt: new Date().toISOString().slice(0, 10),
    });

    await this.writeDashboardMarkdown();
  }

  private async writeDashboardMarkdown(): Promise<void> {
    const targetPath = this.targetPath();
    const folder = targetPath.split("/").slice(0, -1).join("/");
    if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }
    const markdown = renderWeaknessDashboard(this.entries, new Date().toISOString());
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, markdown);
    } else {
      await this.app.vault.create(targetPath, markdown);
    }
  }
}
