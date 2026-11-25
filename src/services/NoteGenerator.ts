import { App, normalizePath, TFile } from "obsidian";
import {
  ListeningSessionData,
  SegmentTutorNote,
  TranscriptSegment,
} from "../types/transcript";
import { formatSecondsToTimestamp } from "../utils/youtubeUrlParser";
import type { TranscriptWorkerManager } from "../workers/WorkerPoolManager";
import { noteFileName, videoIdFromNoteName } from "../utils/noteName";
import { buildNoteMarkdown, extractSessionJson, replaceSessionBlock } from "./noteMarkdown";

/**
 * Generates and updates Obsidian Markdown notes for YouTube listening sessions.
 * Stores heavy segment arrays in a compressed JSON sidecar file inside the plugin directory
 * so Markdown notes remain ultra-light (~30 lines instead of 27,000+ lines) and Obsidian stays 60fps.
 */
export class NoteGenerator {
  private sessionMemoryCache = new Map<string, ListeningSessionData>();
  /** SPEC_033: 지운 영상 id → 지운 시각. 그 전에 만든 세션은 다시 저장하지 않는다(진행 중 AI 분석이 되살리지 않게). */
  private forgottenAt = new Map<string, number>();

  constructor(
    private app: App,
    private getNotesFolder: () => string
  ) {}

  public getPrimarySidecarDir(): string {
    const folder = this.getNotesFolder() || "YouTube Listening";
    return normalizePath(`${folder}/.ear-coach-sessions`);
  }

  private getPrimarySidecarPath(videoId: string): string {
    return normalizePath(`${this.getPrimarySidecarDir()}/${videoId}.json`);
  }

  public getLegacyPluginSidecarDir(): string {
    return normalizePath(`${this.app.vault.configDir}/plugins/obsidian-ear-coach/sessions`);
  }

  private getLegacyPluginSidecarPath(videoId: string): string {
    return normalizePath(`${this.getLegacyPluginSidecarDir()}/${videoId}.json`);
  }

  private async ensureAdapterDirRecursive(dirPath: string): Promise<void> {
    const parts = normalizePath(dirPath).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(current))) {
        await this.app.vault.adapter.mkdir(current);
      }
    }
  }

  /** SPEC_033: 지운 영상의 메모리 사본을 비우고, 지우기 전 세션의 저장을 막는다. */
  public forgetSession(videoId: string): void {
    this.sessionMemoryCache.delete(videoId);
    this.forgottenAt.set(videoId, Date.now());
  }

  public getCachedSession(videoId: string): ListeningSessionData | null {
    return this.sessionMemoryCache.get(videoId) ?? null;
  }

  public async ensureFolderExists(folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath);
    if (!normalized) return;
    const parts = normalized.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const exists = this.app.vault.getAbstractFileByPath(current);
      if (!exists) {
        try {
          await this.app.vault.createFolder(current);
        } catch {
          // Ignore if folder was created concurrently
        }
      }
    }
  }

  public getNoteFilePath(title: string, videoId: string): string {
    const folder = this.getNotesFolder() || "YouTube Listening";
    return normalizePath(`${folder}/${noteFileName(title, videoId)}`);
  }

  public findExistingNoteByVideoId(videoId: string): TFile | null {
    const markdownFiles = this.app.vault.getMarkdownFiles();
    for (const file of markdownFiles) {
      if (file.name.includes(`[${videoId}]`)) {
        return file;
      }
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter?.video_id === videoId) {
        return file;
      }
    }
    return null;
  }

  public extractVideoIdFromFile(file: TFile): string | null {
    const cache = this.app.metadataCache.getFileCache(file);
    if (cache?.frontmatter?.video_id) {
      return String(cache.frontmatter.video_id);
    }
    return videoIdFromNoteName(file.name);
  }

  /**
   * Saves heavy session data to the minified sidecar JSON file (O(1) memory cache + fast disk write)
   * and writes only a tiny 1-line pointer inside the Markdown note.
   */
  public async saveSessionToNote(
    session: ListeningSessionData,
    existingFile?: TFile | null,
    sidecarOnly = false
  ): Promise<TFile | null> {
    const forgotten = this.forgottenAt.get(session.videoId);
    if (forgotten !== undefined && !(Date.parse(session.createdAt) > forgotten)) return null;
    session.updatedAt = new Date().toISOString();
    this.sessionMemoryCache.set(session.videoId, session);

    // 1. Save full payload to primary Vault sidecar (survives plugin updates & syncs) AND legacy plugin sidecar
    const payload = JSON.stringify(session);
    const primaryDir = this.getPrimarySidecarDir();
    await this.ensureAdapterDirRecursive(primaryDir);
    await this.app.vault.adapter.write(
      this.getPrimarySidecarPath(session.videoId),
      payload
    );

    try {
      const legacyDir = this.getLegacyPluginSidecarDir();
      await this.ensureAdapterDirRecursive(legacyDir);
      await this.app.vault.adapter.write(
        this.getLegacyPluginSidecarPath(session.videoId),
        payload
      );
    } catch {
      // Legacy plugin directory mirror is best-effort
    }

    const targetFile = existingFile ?? this.findExistingNoteByVideoId(session.videoId);
    if (sidecarOnly && targetFile) {
      return targetFile;
    }

    // 2. Keep Markdown note clean and lightweight (~30 lines)
    const folder = this.getNotesFolder() || "YouTube Listening";
    await this.ensureFolderExists(folder);

    if (targetFile) {
      const currentContent = await this.app.vault.read(targetFile);
      const updatedContent = replaceSessionBlock(currentContent, session);
      if (updatedContent !== currentContent) {
        await this.app.vault.modify(targetFile, updatedContent);
      }
      return targetFile;
    }

    const filePath = this.getNoteFilePath(session.title, session.videoId);
    const markdown = buildNoteMarkdown(session);
    return await this.app.vault.create(filePath, markdown);
  }

  /**
   * Ultra-fast session loader:
   * 1. Checks in-memory cache first (0.00ms)
   * 2. Checks compressed sidecar JSON file (~2ms, skips 27k-line Markdown entirely)
   * 3. Falls back to legacy inline Markdown JSON and automatically migrates it in background.
   */
  public async loadSessionFromNote(
    file: TFile,
    workerManager?: TranscriptWorkerManager,
    prefetchedMarkdown?: string
  ): Promise<ListeningSessionData | null> {
    const videoId = this.extractVideoIdFromFile(file);

    if (videoId) {
      const memHit = this.sessionMemoryCache.get(videoId);
      if (memHit) return memHit;

      const candidatePaths = [
        this.getPrimarySidecarPath(videoId),
        this.getLegacyPluginSidecarPath(videoId),
      ];

      for (const sidecarPath of candidatePaths) {
        try {
          if (await this.app.vault.adapter.exists(sidecarPath)) {
            const rawJson = await this.app.vault.adapter.read(sidecarPath);
            const session = JSON.parse(rawJson) as ListeningSessionData;
            if (session && Array.isArray(session.segments)) {
              this.sessionMemoryCache.set(videoId, session);
              // Migrate legacy plugin-dir-only session into primary Vault sidecar silently
              if (sidecarPath !== candidatePaths[0]) {
                void this.ensureAdapterDirRecursive(this.getPrimarySidecarDir())
                  .then(() => this.app.vault.adapter.write(candidatePaths[0], rawJson))
                  .catch(() => {});
              }
              return session;
            }
          }
        } catch {
          // Try next candidate path
        }
      }
    }

    // Legacy inline Markdown fallback (and auto-migrate to sidecar in background!)
    const content = prefetchedMarkdown ?? (await this.app.vault.read(file));
    let session: ListeningSessionData | null = null;
    if (workerManager) {
      session = await workerManager.parseSessionAsync(content);
    } else {
      session = this.extractSessionFromMarkdown(content);
    }

    if (session && Array.isArray((session as any).segments)) {
      this.sessionMemoryCache.set(session.videoId, session);
      // Auto-migrate heavy 27k-line note to lightweight sidecar asynchronously without blocking UI
      window.setTimeout(() => {
        this.saveSessionToNote(session!, file, false).catch(() => {});
      }, 800);
      return session;
    }

    return null;
  }

  public extractSessionFromMarkdown(markdown: string): ListeningSessionData | null {
    return extractSessionJson(markdown) as ListeningSessionData | null;
  }

  /**
   * Appends a permanent Markdown callout to the note when the user saves an `agy` 1:1 Sound Doctor coaching answer.
   */
  public async appendTutorCalloutToNote(
    file: TFile,
    segment: TranscriptSegment,
    tutorNote: SegmentTutorNote
  ): Promise<void> {
    const content = await this.app.vault.read(file);
    const timeLabel = formatSecondsToTimestamp(segment.start);

    const calloutLines = [
      "",
      `> [!tip]+ 🎙️ [${timeLabel}] "${segment.text}" — 사운드 해부 노트`,
      `> - **내가 들은 소리**: \`${tutorNote.userHeard || "미입력"}\``,
      `> - **질문**: ${tutorNote.question}`,
      ...tutorNote.answer.split(/\r?\n/).map((line) => `> ${line}`),
      "",
    ].join("\n");

    await this.app.vault.modify(file, content + calloutLines);
  }
}
