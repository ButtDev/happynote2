import { Notice, Plugin, TFile, WorkspaceLeaf, requestUrl } from "obsidian";
import {
  DEFAULT_EAR_COACH_SETTINGS,
  EarCoachSettings,
} from "./types/settings";
import { ListeningSessionData } from "./types/transcript";
import {
  parseTimestampToSeconds,
  parseYouTubeUrl,
} from "./utils/youtubeUrlParser";
import { SegmentTimeIndex } from "./utils/binarySearch";
import { isDesktopApp, isMobileApp } from "./utils/platform";
import { TranscriptWorkerManager } from "./workers/WorkerPoolManager";
import { TranscriptService } from "./services/TranscriptService";
import { DictionaryApiDevProvider, DictionaryProvider } from "./services/dictionary";
import { ANKI_CONNECT_URL, AnkiConnectClient, AnkiInvoker, migrateAnkiDeck } from "./services/anki";
import { StoryboardInfo, storyboardFromPlayerResponse, storyboardFromWatchHtml } from "./services/storyboard";
import { AgyCliService } from "./services/AgyCliService";
import { AI_MESSAGES, AiConfig, AiHttpRequest, AiHttpResponse, aiResultMessage, needsAiAnalysis, runAiAnalysis, testAiConnection } from "./services/aiAnalysis";
import { NoteGenerator } from "./services/NoteGenerator";
import { WeaknessTracker } from "./services/WeaknessTracker";
import { EarCoachView, VIEW_TYPE_EAR_COACH } from "./ui/EarCoachView";
import { UrlInputModal } from "./ui/UrlInputModal";
import { EarCoachSettingTab } from "./ui/SettingsTab";

/**
 * Main Obsidian Plugin class for Ear-Coach (YouTube + Obsidian + agy CLI).
 */
export default class EarCoachPlugin extends Plugin {
  public settings: EarCoachSettings = DEFAULT_EAR_COACH_SETTINGS;
  public workerManager!: TranscriptWorkerManager;
  public transcriptService!: TranscriptService;
  public agyService!: AgyCliService;
  /** SPEC_013: 자막 단어 사전 */
  public dictionary: DictionaryProvider = new DictionaryApiDevProvider(async (url) => {
    const r = await requestUrl({ url, throw: false });
    let json: unknown = null;
    try {
      json = r.json;
    } catch {
      json = null;
    }
    return { status: r.status, json };
  });
  /** SPEC_015: AnkiConnect Android (웹뷰 CORS를 피해 requestUrl) */
  public anki: AnkiInvoker = new AnkiConnectClient(async (body) => {
    const r = await requestUrl({ url: ANKI_CONNECT_URL, method: "POST", contentType: "application/json", body, throw: false });
    let json: unknown = null;
    try {
      json = r.json;
    } catch {
      json = null;
    }
    return { status: r.status, json };
  });
  /** SPEC_021: 모바일 AI 요청 (requestUrl) */
  public aiFetch = async (req: AiHttpRequest): Promise<AiHttpResponse> => {
    const r = await requestUrl({ url: req.url, method: req.method, headers: req.headers, body: req.body, throw: false });
    let json: unknown = null;
    try {
      json = r.json;
    } catch {
      json = null;
    }
    return { status: r.status, json };
  };
  private aiRunning = new Set<string>();
  /** SPEC_015: 발음 파일 바이트(Anki addNote data용) */
  public fetchBytes = async (url: string): Promise<ArrayBuffer> => {
    const r = await requestUrl({ url, throw: false });
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
    return r.arrayBuffer;
  };
  /** SPEC_017: 영상 스토리보드 스펙(시청 페이지 L3 320×180 → Android innertube L2), 영상별 캐시 */
  private storyboardCache = new Map<string, Promise<StoryboardInfo | null>>();
  public storyboard = (videoId: string): Promise<StoryboardInfo | null> => {
    const hit = this.storyboardCache.get(videoId);
    if (hit) return hit;
    const p = this.fetchStoryboard(videoId);
    this.storyboardCache.set(videoId, p);
    void p.then((v) => {
      if (!v) this.storyboardCache.delete(videoId);
    });
    return p;
  };
  private async fetchStoryboard(videoId: string): Promise<StoryboardInfo | null> {
    const id = encodeURIComponent(videoId);
    try {
      const r = await requestUrl({
        url: `https://www.youtube.com/watch?v=${id}&hl=en`,
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        throw: false,
      });
      const info = r.status === 200 ? storyboardFromWatchHtml(r.text) : null;
      if (info) return info;
    } catch {
      // Android innertube로
    }
    try {
      const r = await requestUrl({
        url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        method: "POST",
        contentType: "application/json",
        headers: { "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip" },
        body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en", gl: "US" } }, videoId }),
        throw: false,
      });
      return r.status === 200 ? storyboardFromPlayerResponse(JSON.parse(r.text)) : null;
    } catch {
      return null;
    }
  }
  public noteGenerator!: NoteGenerator;
  public weaknessTracker!: WeaknessTracker;
  public bypassOpenInterceptor = false;

  public async onload(): Promise<void> {
    await this.loadSettings();

    this.workerManager = new TranscriptWorkerManager(2);
    this.transcriptService = new TranscriptService(
      () => this.settings.ytDlpBinaryPath
    );
    this.agyService = new AgyCliService(
      () => this.settings.agyBinaryPath,
      () => this.settings.agyModel
    );
    this.noteGenerator = new NoteGenerator(
      this.app,
      () => this.settings.notesFolder
    );
    this.weaknessTracker = new WeaknessTracker(
      this.app,
      () => this.settings.weaknessDashboardPath
    );

    // 1. Register Custom Interactive Workspace View
    this.registerView(
      VIEW_TYPE_EAR_COACH,
      (leaf: WorkspaceLeaf) => new EarCoachView(leaf, this)
    );

    // 2. Register Custom URI Handler: obsidian://ear-coach?url=...&t=142&pin=true
    this.registerObsidianProtocolHandler("ear-coach", async (params) => {
      const rawUrl = params.url;
      if (!rawUrl) {
        new Notice("Ear-Coach URI에 유튜브 url 파라미터가 없습니다.");
        return;
      }
      const pinSec = parseTimestampToSeconds(params.t);
      await this.handleYouTubeTrigger(rawUrl, pinSec);
    });

    // 3. Register Ribbon Icon
    this.addRibbonIcon(
      "headphones",
      "Ear-Coach: 유튜브 영어 리스닝 노트 생성 / 열기",
      () => {
        this.openUrlInputModal();
      }
    );

    // 4. Register Commands
    this.addCommand({
      id: "ear-coach-create-from-url-modal",
      name: "유튜브 URL로 리스닝 노트 생성 및 열기 (Create Listening Note from URL)",
      callback: () => {
        this.openUrlInputModal();
      },
    });

    this.addCommand({
      id: "ear-coach-create-from-clipboard",
      name: "클립보드 유튜브 URL로 즉시 리스닝 노트 생성 (Zero-Friction Clipboard Trigger)",
      callback: async () => {
        try {
          const clip = await navigator.clipboard.readText();
          const parsed = parseYouTubeUrl(clip);
          if (!parsed) {
            new Notice("클립보드에 유효한 유튜브 URL이 없습니다. 입력창을 엽니다.");
            this.openUrlInputModal();
            return;
          }
          await this.handleYouTubeTrigger(clip, parsed.timestampSeconds);
        } catch {
          this.openUrlInputModal();
        }
      },
    });

    this.addCommand({
      id: "ear-coach-open-current-note",
      name: "현재 마크다운 노트의 인터랙티브 리스닝 코치 워크스페이스 열기",
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return false;
        if (!checking) {
          void this.openEarCoachForNoteFile(activeFile);
        }
        return true;
      },
    });

    this.addCommand({
      id: "ear-coach-mobile-ai-continue",
      name: "현재 노트 AI 번역·분석 이어서 하기 (모바일)",
      checkCallback: (checking: boolean) => {
        if (!isMobileApp()) return false;
        const activeFile = this.getActiveEarCoachFile();
        if (!activeFile) return false;
        if (!checking) {
          void (async () => {
            const session = await this.loadOrRecoverSession(activeFile);
            if (!session) {
              new Notice("이 노트에는 Ear-Coach 리스닝 세션 데이터가 없습니다.");
              return;
            }
            if (!this.getAiConfig()) {
              new Notice("설정 → 🤖 AI 번역·분석에 API 키를 넣어 주세요.");
              return;
            }
            await this.runMobileAiEnrichment(session, activeFile);
          })();
        }
        return true;
      },
    });

    this.addCommand({
      id: "ear-coach-resegment-current-note",
      name: "현재 노트의 자막을 최신 문장 단위로 다시 추출·정렬 (Re-segment)",
      checkCallback: (checking: boolean) => {
        const activeFile = this.getActiveEarCoachFile();
        if (!activeFile) return false;
        if (!checking) {
          void this.resegmentNoteFile(activeFile);
        }
        return true;
      },
    });

    // 5. Register Markdown Codeblock Processor for `ear-coach-session`
    this.registerMarkdownCodeBlockProcessor(
      "ear-coach-session",
      (source, el, ctx) => {
        el.empty();
        const card = el.createDiv({ cls: "ear-coach-inline-banner" });
        try {
          const parsed = JSON.parse(source);
          const isSidecar = parsed && parsed.storage === "sidecar";
          const title = parsed.title || "Ear-Coach 리스닝 세션";
          const segCount = isSidecar
            ? parsed.segmentCount ?? 0
            : Array.isArray(parsed.segments)
              ? parsed.segments.length
              : 0;
          const pinCount = isSidecar
            ? parsed.pinnedCount ?? 0
            : Array.isArray(parsed.segments)
              ? parsed.segments.filter((s: any) => s.isPinned).length
              : 0;

          card.createEl("h4", {
            text: `🎧 ${title} — 총 ${segCount}문장 (📌 핀 ${pinCount}개)`,
          });
          const openBtn = card.createEl("button", {
            cls: "ear-coach-btn ear-coach-btn-primary",
            text: isMobileApp()
              ? "🚀 인터랙티브 리스닝 워크스페이스 열기 (구간반복 + 3단계 블라인드)"
              : "🚀 인터랙티브 리스닝 워크스페이스 열기 (구간반복 + 3단계 블라인드 + agy 튜터)",
          });
          openBtn.addEventListener("click", async () => {
            const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
            if (file instanceof TFile) {
              const fullSession = isSidecar
                ? await this.loadOrRecoverSession(file)
                : (parsed as ListeningSessionData);
              if (fullSession) {
                await this.activateWorkspaceView(fullSession, file);
              } else {
                new Notice("⚠️ 리스닝 세션을 불러오거나 복구하지 못했습니다.");
              }
            } else if (!isSidecar) {
              await this.activateWorkspaceView(parsed as ListeningSessionData, null);
            }
          });
        } catch {
          card.setText("⚠️ 리스닝 세션 JSON 데이터를 파싱할 수 없습니다.");
        }
      }
    );

    // 6. Settings Tab
    this.addSettingTab(new EarCoachSettingTab(this.app, this));

    // 7. Intercept WorkspaceLeaf.openFile BEFORE CodeMirror parses giant Markdown files (0ms skip)
    const plugin = this;
    const origOpenFile = WorkspaceLeaf.prototype.openFile;
    WorkspaceLeaf.prototype.openFile = async function (
      this: WorkspaceLeaf,
      file: TFile,
      openState?: any
    ): Promise<void> {
      if (
        file &&
        file.extension === "md" &&
        !plugin.bypassOpenInterceptor &&
        plugin.isEarCoachNoteFast(file)
      ) {
        const session = await plugin.loadOrRecoverSession(file);
        if (session) {
          const coachLeaves = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_EAR_COACH);
          if (coachLeaves.length > 0) {
            const targetLeaf = coachLeaves[0];
            if (this !== targetLeaf && this.view.getViewType() === "empty") {
              this.detach();
            }
            plugin.app.workspace.revealLeaf(targetLeaf);
            if (targetLeaf.view instanceof EarCoachView) {
              await targetLeaf.view.loadSession(session, file);
            }
            return;
          } else {
            await this.setViewState({
              type: VIEW_TYPE_EAR_COACH,
              active: true,
            });
            plugin.app.workspace.revealLeaf(this);
            if (this.view instanceof EarCoachView) {
              await this.view.loadSession(session, file);
            }
            return;
          }
        }
      }
      return origOpenFile.call(this, file, openState);
    };
    this.register(() => {
      WorkspaceLeaf.prototype.openFile = origOpenFile;
    });

    // 8. Fallback Auto-open when metadataCache wasn't warm yet or layout ready
    this.registerEvent(
      this.app.workspace.on("file-open", async (file) => {
        if (!file || !file.path.endsWith(".md") || this.bypassOpenInterceptor) return;
        await this.tryAutoOpenEarCoachForFile(file);
      })
    );

    this.app.workspace.onLayoutReady(async () => {
      await this.sweepOpenMarkdownLeavesForEarCoach();
      // Mobile cold-start safety: metadataCache & leaf restoration may settle slightly after layout ready
      window.setTimeout(() => {
        void this.sweepOpenMarkdownLeavesForEarCoach();
      }, 450);
    });

    this.registerEvent(
      this.app.metadataCache.on("resolved", () => {
        void this.sweepOpenMarkdownLeavesForEarCoach();
      })
    );
  }

  public isEarCoachNoteFast(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const tags = cache?.frontmatter?.tags;
    if (
      cache?.frontmatter?.video_id ||
      (Array.isArray(tags) &&
        (tags.includes("ear-coach") || tags.includes("english-listening"))) ||
      tags === "ear-coach"
    ) {
      return true;
    }

    // Cold-start fallback before metadataCache is populated
    const notesFolder = (this.settings.notesFolder || "YouTube Listening").replace(/\/+$/, "");
    if (
      file.path.startsWith(`${notesFolder}/`) &&
      /\[[a-zA-Z0-9_-]{6,15}\]\.md$/.test(file.name)
    ) {
      return true;
    }
    return false;
  }

  private switchingPaths = new Set<string>();
  private pendingRecoveryByVideoId = new Map<string, Promise<ListeningSessionData | null>>();

  private async sweepOpenMarkdownLeavesForEarCoach(): Promise<void> {
    if (this.bypassOpenInterceptor) return;
    const filesToCheck: TFile[] = [];
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && activeFile.extension === "md") {
      filesToCheck.push(activeFile);
    }

    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === "markdown") {
        const mdFile = (leaf.view as any).file;
        if (mdFile instanceof TFile && !filesToCheck.some((f) => f.path === mdFile.path)) {
          filesToCheck.push(mdFile);
        }
      }
    });

    for (const file of filesToCheck) {
      await this.tryAutoOpenEarCoachForFile(file);
    }
  }

  private async tryAutoOpenEarCoachForFile(file: TFile): Promise<void> {
    if (this.switchingPaths.has(file.path)) return;
    const cache = this.app.metadataCache.getFileCache(file);
    const tags = cache?.frontmatter?.tags;
    let isEarCoach = Boolean(
      cache?.frontmatter?.video_id ||
        (Array.isArray(tags) && (tags.includes("ear-coach") || tags.includes("english-listening"))) ||
        tags === "ear-coach"
    );

    let prefetchedContent: string | undefined;
    if (!isEarCoach) {
      try {
        const content = await this.app.vault.read(file);
        if (content.includes("ear-coach-session") || content.includes("video_id:")) {
          isEarCoach = true;
          prefetchedContent = content;
        }
      } catch {
        // Ignore read errors
      }
    }

    if (isEarCoach) {
      this.switchingPaths.add(file.path);
      try {
        const session = await this.loadOrRecoverSession(file, prefetchedContent);
        if (session) {
          await this.activateWorkspaceView(session, file, undefined, true);
        }
      } finally {
        window.setTimeout(() => {
          this.switchingPaths.delete(file.path);
        }, 250);
      }
    }
  }

  /**
   * Loads session from memory/sidecar/markdown, and if the sidecar JSON was missing
   * (e.g. after mobile sync or app reinstall), automatically recovers it from YouTube!
   */
  public async loadOrRecoverSession(
    file: TFile,
    prefetchedContent?: string
  ): Promise<ListeningSessionData | null> {
    const loaded = await this.noteGenerator.loadSessionFromNote(
      file,
      this.workerManager,
      prefetchedContent
    );
    if (loaded) return loaded;

    let content = prefetchedContent;
    if (!content) {
      try {
        content = await this.app.vault.read(file);
      } catch {
        return null;
      }
    }

    const frontmatterMatch = content.match(/video_id:\s*["']?([a-zA-Z0-9_-]{6,15})["']?/);
    const videoId =
      frontmatterMatch?.[1] || this.noteGenerator.extractVideoIdFromFile(file);
    if (!videoId) return null;

    const existingPromise = this.pendingRecoveryByVideoId.get(videoId);
    if (existingPromise) return existingPromise;

    const recoveryPromise = (async (): Promise<ListeningSessionData | null> => {
      try {
        const fetched = await this.transcriptService.fetchTranscript(
          videoId,
          this.settings.preferredCaptionLang
        );
        const segments = await this.workerManager.processCuesAsync(fetched.cues, {
          speedSpikeWpmThreshold: this.settings.speedSpikeWpmThreshold,
          defaultUnlockStep: this.settings.defaultUnlockStep,
        });
        const now = new Date().toISOString();
        const recovered: ListeningSessionData = {
          videoId,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          title: fetched.title,
          channelName: fetched.channelName,
          createdAt: now,
          updatedAt: now,
          pinnedTimestamps: [],
          segments,
        };
        await this.noteGenerator.saveSessionToNote(recovered, file, true);
        return recovered;
      } catch {
        return null;
      } finally {
        this.pendingRecoveryByVideoId.delete(videoId);
      }
    })();

    this.pendingRecoveryByVideoId.set(videoId, recoveryPromise);
    return recoveryPromise;
  }

  public async restoreSessionForView(
    view: EarCoachView,
    filePath?: string | null,
    videoId?: string | null
  ): Promise<void> {
    let targetFile: TFile | null = null;
    if (filePath) {
      const abstract = this.app.vault.getAbstractFileByPath(filePath);
      if (abstract instanceof TFile) {
        targetFile = abstract;
      }
    }
    if (!targetFile && videoId) {
      targetFile = this.noteGenerator.findExistingNoteByVideoId(videoId);
    }
    if (!targetFile) return;

    const session = await this.loadOrRecoverSession(targetFile);
    if (session) {
      await view.loadSession(session, targetFile);
      // SPEC_021: 앱 재시작으로 복원된 화면도 해석 없는 카드를 AI로 채움
      if (isMobileApp() && this.getAiConfig() && session.segments.some(needsAiAnalysis)) void this.runMobileAiEnrichment(session, targetFile);
    }
  }

  public onunload(): void {
    this.workerManager?.destroy();
  }

  public openUrlInputModal(): void {
    new UrlInputModal(this.app, async ({ url, pinTimestampSeconds }) => {
      await this.handleYouTubeTrigger(url, pinTimestampSeconds);
    }).open();
  }

  /**
   * Core pipeline triggered by URI, Clipboard hotkey, or Modal.
   * If a note for this video already exists, adds the new timestamp pin and opens it immediately.
   * Otherwise extracts transcript -> merges sentences in Web Worker -> creates note -> opens interactive view -> runs optional `agy` batch analysis.
   */
  public async handleYouTubeTrigger(
    rawUrl: string,
    pinTimestampSeconds?: number
  ): Promise<void> {
    const parsed = parseYouTubeUrl(rawUrl);
    if (!parsed) {
      new Notice("유효한 유튜브 URL이 아닙니다.");
      return;
    }

    const effectivePin = pinTimestampSeconds ?? parsed.timestampSeconds;
    const existingFile = this.noteGenerator.findExistingNoteByVideoId(
      parsed.videoId
    );

    if (existingFile) {
      const existingSession = await this.loadOrRecoverSession(existingFile);
      if (existingSession) {
        if (effectivePin !== undefined) {
          if (!existingSession.pinnedTimestamps.includes(effectivePin)) {
            existingSession.pinnedTimestamps.push(effectivePin);
          }
          const idx = new SegmentTimeIndex(
            existingSession.segments
          ).findNearestSegmentIndex(effectivePin);
          if (idx >= 0) {
            existingSession.segments[idx].isPinned = true;
          }
          await this.noteGenerator.saveSessionToNote(
            existingSession,
            existingFile
          );
          new Notice(
            `기존 노트에 📌 집중 분석 핀(${effectivePin}초)을 추가했습니다!`
          );
        }
        await this.activateWorkspaceView(
          existingSession,
          existingFile,
          effectivePin
        );
        return;
      }
    }

    new Notice("⏳ 유튜브 자막을 추출하고 문장 단위로 조립하고 있습니다...");

    try {
      const fetched = await this.transcriptService.fetchTranscript(
        parsed.videoId,
        this.settings.preferredCaptionLang
      );

      const pinnedTimestamps =
        effectivePin !== undefined ? [effectivePin] : [];

      const segments = await this.workerManager.processCuesAsync(fetched.cues, {
        speedSpikeWpmThreshold: this.settings.speedSpikeWpmThreshold,
        defaultUnlockStep: this.settings.defaultUnlockStep,
        pinnedTimestamps,
      });

      const now = new Date().toISOString();
      const session: ListeningSessionData = {
        videoId: parsed.videoId,
        videoUrl: parsed.canonicalUrl,
        title: fetched.title,
        channelName: fetched.channelName,
        createdAt: now,
        updatedAt: now,
        pinnedTimestamps,
        segments,
      };

      const noteFile = await this.noteGenerator.saveSessionToNote(session);
      new Notice(`✅ 리스닝 노트 생성 완료: ${fetched.title}`);

      await this.activateWorkspaceView(session, noteFile, effectivePin);

      if (isDesktopApp() && this.settings.autoRunAgyBatchOnCreate) {
        this.runAgyBatchEnrichment(session, noteFile).catch(() => {
          // Fallback heuristics are already active; non-blocking background enrichment
        });
      }
    } catch (err) {
      new Notice(
        `❌ 자막 추출 실패: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Runs `agy` CLI structured batch analysis on pinned + speed-spike + key segments.
   */
  public async runAgyBatchEnrichment(
    session: ListeningSessionData,
    noteFile: TFile | null
  ): Promise<void> {
    if (isMobileApp()) return;
    const prioritized = [...session.segments]
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        if (a.isSpeedSpike !== b.isSpeedSpike) return a.isSpeedSpike ? -1 : 1;
        return a.index - b.index;
      })
      .slice(0, this.settings.maxBatchSegmentsPerRequest);

    const response = await this.agyService.analyzeSegmentsBatch({
      videoTitle: session.title,
      segments: prioritized.map((s) => ({
        index: s.index,
        text: s.text,
        wpm: s.wpm,
        isPinned: s.isPinned,
      })),
    });

    for (const item of response.items) {
      const seg = session.segments[item.segmentIndex];
      if (!seg) continue;
      seg.analysis = {
        traps: item.traps,
        phoneticKr: item.phoneticKr,
        trapExplanation: item.trapExplanation,
        skeletonWordIndices: item.skeletonWordIndices,
        dictationBlankIndices: item.dictationBlankIndices,
        rhythmGuide: item.rhythmGuide,
        translationKr: item.translationKr,
      };
    }

    if (noteFile) {
      await this.noteGenerator.saveSessionToNote(session, noteFile);
    }
  }

  private getActiveEarCoachFile(): TFile | null {
    const activeView = this.app.workspace.getActiveViewOfType(EarCoachView);
    if (activeView) {
      const state = activeView.getState() as { filePath?: string | null };
      if (state.filePath) {
        const f = this.app.vault.getAbstractFileByPath(state.filePath);
        if (f instanceof TFile) return f;
      }
    }
    const activeFile = this.app.workspace.getActiveFile();
    return activeFile ?? null;
  }

  private async resegmentNoteFile(file: TFile): Promise<void> {
    const existing = await this.loadOrRecoverSession(file);
    const videoId = existing?.videoId || this.noteGenerator.extractVideoIdFromFile(file);
    if (!videoId) {
      new Notice("유튜브 Video ID를 찾을 수 없습니다.");
      return;
    }

    new Notice("⏳ 자막을 최신 문장 단위로 다시 추출·정렬하고 있습니다...");
    try {
      const fetched = await this.transcriptService.fetchTranscript(
        videoId,
        this.settings.preferredCaptionLang
      );
      const pinnedTimestamps = existing?.pinnedTimestamps ?? [];
      const segments = await this.workerManager.processCuesAsync(fetched.cues, {
        speedSpikeWpmThreshold: this.settings.speedSpikeWpmThreshold,
        defaultUnlockStep: this.settings.defaultUnlockStep,
        pinnedTimestamps,
      });

      const updated: ListeningSessionData = {
        videoId,
        videoUrl: existing?.videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
        title: existing?.title || fetched.title,
        channelName: existing?.channelName || fetched.channelName,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pinnedTimestamps,
        segments,
        agyConversationId: existing?.agyConversationId,
      };
      await this.noteGenerator.saveSessionToNote(updated, file, false);
      await this.activateWorkspaceView(updated, file);
      new Notice(`✅ 문장 단위 재정렬 완료 (${segments.length}문장)`);
    } catch (err) {
      new Notice(
        `❌ 재정렬 실패: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async openEarCoachForNoteFile(file: TFile): Promise<void> {
    const session = await this.loadOrRecoverSession(file);
    if (!session) {
      new Notice("이 노트에는 Ear-Coach 리스닝 세션 데이터가 없습니다.");
      return;
    }
    await this.activateWorkspaceView(session, file);
  }

  public async activateWorkspaceView(
    session: ListeningSessionData,
    noteFile: TFile | null,
    focusTimestampSec?: number,
    closeOriginMarkdownLeaf: boolean = false
  ): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const coachLeaves = workspace.getLeavesOfType(VIEW_TYPE_EAR_COACH);

    // noteFile을 표시하고 있는 마크다운 리프 찾기
    const mdLeavesToClose: WorkspaceLeaf[] = [];
    if (closeOriginMarkdownLeaf && noteFile) {
      workspace.iterateAllLeaves((l) => {
        if (l.view.getViewType() === "markdown") {
          const mdView = l.view as any;
          if (mdView.file && mdView.file.path === noteFile.path) {
            mdLeavesToClose.push(l);
          }
        }
      });
    }

    if (coachLeaves.length > 0) {
      // 1. 이미 EarCoachView 탭이 열려있으면 기존 탭을 재사용!
      leaf = coachLeaves[0];
      // 파일 클릭 시 새로 생긴 마크다운 에디터 탭 닫기
      for (const mdLeaf of mdLeavesToClose) {
        try {
          mdLeaf.detach();
        } catch {
          // ignore detach error
        }
      }
    } else {
      // 2. EarCoachView 탭이 없으면, 새로 열린 마크다운 탭을 EarCoachView로 즉시 전환!
      if (mdLeavesToClose.length > 0) {
        leaf = mdLeavesToClose[0];
        for (let i = 1; i < mdLeavesToClose.length; i++) {
          try {
            mdLeavesToClose[i].detach();
          } catch {
            // ignore
          }
        }
        await leaf.setViewState({
          type: VIEW_TYPE_EAR_COACH,
          active: true,
        });
      } else {
        leaf = workspace.getLeaf("tab");
        await leaf.setViewState({
          type: VIEW_TYPE_EAR_COACH,
          active: true,
        });
      }
    }

    workspace.revealLeaf(leaf);
    if (leaf.view instanceof EarCoachView) {
      await leaf.view.loadSession(session, noteFile, focusTimestampSec);
    }

    // SPEC_021: 모바일 — 해석이 없는 카드를 AI로 채움(키가 있을 때만, 백그라운드)
    if (isMobileApp() && this.getAiConfig() && session.segments.some(needsAiAnalysis)) {
      void this.runMobileAiEnrichment(session, noteFile);
    }
  }

  /** SPEC_021: 설정에서 지금 쓸 AI 설정. 키가 없으면 null */
  public getAiConfig(): AiConfig | null {
    const st = this.settings;
    if (st.aiProvider === "openai") {
      if (!st.openaiApiKey) return null;
      return { provider: "openai", apiKey: st.openaiApiKey, model: st.openaiModel, baseUrl: st.openaiBaseUrl };
    }
    if (!st.geminiApiKey) return null;
    return { provider: "gemini", apiKey: st.geminiApiKey, model: st.geminiModel };
  }

  /** SPEC_021: 설정 화면 🔌 연결 확인 */
  public testAiConnection(): Promise<string> {
    return testAiConnection(this.getAiConfig(), this.aiFetch);
  }

  /** SPEC_021: 모바일 AI 번역·분석 (대기 카드만, 20장씩, 묶음마다 저장·다시 그림) */
  public async runMobileAiEnrichment(session: ListeningSessionData, noteFile: TFile | null): Promise<void> {
    const config = this.getAiConfig();
    if (!config || this.aiRunning.has(session.videoId)) return;
    const pending = session.segments.filter(needsAiAnalysis).length;
    if (pending === 0) return;
    this.aiRunning.add(session.videoId);
    new Notice(AI_MESSAGES.start(pending));
    const refresh = () => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_EAR_COACH)) {
        if (leaf.view instanceof EarCoachView) leaf.view.refreshSegments();
      }
    };
    try {
      const result = await runAiAnalysis(session.segments, config, {
        fetch: this.aiFetch,
        sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
        title: session.title,
        onBatch: async () => {
          if (noteFile) await this.noteGenerator.saveSessionToNote(session, noteFile);
          refresh();
        },
      });
      new Notice(aiResultMessage(result), result.stoppedBy ? 10000 : 5000);
    } catch (err) {
      new Notice(AI_MESSAGES.failed(err instanceof Error ? err.message : String(err)), 10000);
    } finally {
      this.aiRunning.delete(session.videoId);
    }
  }

  public async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_EAR_COACH_SETTINGS,
      await this.loadData()
    );
    // SPEC_015: 필드 대응은 객체라 얕은 병합으로 빠진 역할을 기본값으로 채운다
    this.settings.ankiFieldMap = { ...DEFAULT_EAR_COACH_SETTINGS.ankiFieldMap, ...(this.settings.ankiFieldMap ?? {}) };
    // SPEC_016: 이전 기본 덱 Default → happynote2
    this.settings.ankiDeck = migrateAnkiDeck(this.settings.ankiDeck);
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
