import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { DEFAULT_EAR_COACH_SETTINGS, EarCoachSettings } from "./types/settings";
import { ListeningSessionData } from "./types/transcript";
import { TranscriptWorkerManager } from "./workers/WorkerPoolManager";
import { TranscriptService } from "./services/TranscriptService";
import { DictionaryProvider } from "./services/dictionary";
import { setPronunciationFetcher } from "./services/cmudictLite";
import { AnkiInvoker, migrateAnkiDeck } from "./services/anki";
import { AgyCliService } from "./services/AgyCliService";
import { AiConfig, testAiConnection } from "./services/aiAnalysis";
import { NoteGenerator } from "./services/NoteGenerator";
import { WeaknessTracker } from "./services/WeaknessTracker";
import { EarCoachView, VIEW_TYPE_EAR_COACH } from "./ui/EarCoachView";
import { UrlInputModal } from "./ui/UrlInputModal";
import { EarCoachSettingTab } from "./ui/SettingsTab";
import { installDiagnosticsCapture } from "./ui/diagnosticsSection";
// SPEC_039: 기능은 src/features/에, 이 파일은 연결만
import { aiFetch, createAnki, createAudioClip, createDictionary, createStoryboard, DICT_CACHE_FILE_NAME, fetchBytes } from "./features/network";
import { createSessionLoader, handleYouTubeTrigger, runAgyBatchEnrichment } from "./features/sessionPipeline";
import { activateWorkspaceView, isEarCoachNoteFast, registerAutoOpen, restoreSessionForView } from "./features/workspaceView";
import { aiConfigFromSettings, createMobileAiRunner } from "./features/mobileAi";
import { registerEntryPoints } from "./features/commands";
import { createLearningStore, pluginDataFile } from "./features/learning";

/**
 * Main Obsidian Plugin class for Ear-Coach (YouTube + Obsidian + agy CLI).
 */
export default class EarCoachPlugin extends Plugin {
  public settings: EarCoachSettings = DEFAULT_EAR_COACH_SETTINGS;
  public workerManager!: TranscriptWorkerManager;
  public transcriptService!: TranscriptService;
  public agyService!: AgyCliService;
  public noteGenerator!: NoteGenerator;
  public weaknessTracker!: WeaknessTracker;
  public bypassOpenInterceptor = false;

  /** SPEC_013: 자막 단어 사전 */
  public dictionary: DictionaryProvider = createDictionary(pluginDataFile(this, DICT_CACHE_FILE_NAME)); // SPEC_047 캐시
  /** SPEC_015: AnkiConnect Android */
  public anki: AnkiInvoker = createAnki();
  /** SPEC_021: 모바일 AI 요청 */
  public aiFetch = aiFetch;
  /** SPEC_015: 발음 파일 바이트(Anki addNote data용) */
  public fetchBytes = fetchBytes;
  /** SPEC_036: 원음 구간 WAV */
  public audioClip = createAudioClip();
  /** SPEC_017: 영상 스토리보드 스펙, 영상별 캐시 */
  public storyboard = createStoryboard();
  /** SPEC_040: 영상을 가로지르는 학습 기록(learning.json) */
  public learning = createLearningStore(this);

  private sessionLoader = createSessionLoader(this);
  private mobileAiRunner = createMobileAiRunner(this);

  public async onload(): Promise<void> {
    setPronunciationFetcher(async (w) => {
      const e = await this.dictionary.lookup(w);
      return e?.ipaUs ?? e?.phonetic ?? null;
    }); // SPEC_035
    await this.loadSettings();
    this.register(installDiagnosticsCapture(window)); // SPEC_038

    this.workerManager = new TranscriptWorkerManager(2);
    this.transcriptService = new TranscriptService(() => this.settings.ytDlpBinaryPath);
    this.agyService = new AgyCliService(
      () => this.settings.agyBinaryPath,
      () => this.settings.agyModel
    );
    this.noteGenerator = new NoteGenerator(this.app, () => this.settings.notesFolder);
    this.weaknessTracker = new WeaknessTracker(this.app, () => this.settings.weaknessDashboardPath);

    // 1. Register Custom Interactive Workspace View
    this.registerView(VIEW_TYPE_EAR_COACH, (leaf: WorkspaceLeaf) => new EarCoachView(leaf, this));

    // 2~5. URI 핸들러·리본·명령·코드 블록
    registerEntryPoints(this);

    // 6. Settings Tab
    this.addSettingTab(new EarCoachSettingTab(this.app, this));

    // 7~8. 마크다운으로 열리는 Ear-Coach 노트를 Ear-Coach 화면으로
    registerAutoOpen(this);
  }

  public onunload(): void {
    this.workerManager?.destroy();
  }

  public isEarCoachNoteFast(file: TFile): boolean {
    return isEarCoachNoteFast(this, file);
  }

  /** 노트에서 세션을 읽고, 없으면 유튜브에서 복구 */
  public loadOrRecoverSession(file: TFile, prefetchedContent?: string): Promise<ListeningSessionData | null> {
    return this.sessionLoader(file, prefetchedContent);
  }

  public restoreSessionForView(view: EarCoachView, filePath?: string | null, videoId?: string | null): Promise<void> {
    return restoreSessionForView(this, view, filePath, videoId);
  }

  public openUrlInputModal(): void {
    new UrlInputModal(this.app, async ({ url, pinTimestampSeconds }) => {
      await this.handleYouTubeTrigger(url, pinTimestampSeconds);
    }).open();
  }

  /** URI·클립보드·입력창에서: 기존 노트면 핀 추가 후 열기, 아니면 자막 → 노트 → 화면 */
  public handleYouTubeTrigger(rawUrl: string, pinTimestampSeconds?: number): Promise<void> {
    return handleYouTubeTrigger(this, rawUrl, pinTimestampSeconds);
  }

  /** 데스크톱 `agy` CLI 일괄 분석 */
  public runAgyBatchEnrichment(session: ListeningSessionData, noteFile: TFile | null): Promise<void> {
    return runAgyBatchEnrichment(this, session, noteFile);
  }

  public activateWorkspaceView(
    session: ListeningSessionData,
    noteFile: TFile | null,
    focusTimestampSec?: number,
    closeOriginMarkdownLeaf: boolean = false
  ): Promise<void> {
    return activateWorkspaceView(this, session, noteFile, focusTimestampSec, closeOriginMarkdownLeaf);
  }

  /** SPEC_021: 설정에서 지금 쓸 AI 설정. 키가 없으면 null */
  public getAiConfig(): AiConfig | null {
    return aiConfigFromSettings(this.settings);
  }

  /** SPEC_021: 설정 화면 🔌 연결 확인 */
  public testAiConnection(): Promise<string> {
    return testAiConnection(this.getAiConfig(), this.aiFetch);
  }

  /** SPEC_021: 모바일 AI 번역·분석 (대기 카드만, 20장씩, 묶음마다 저장·다시 그림) */
  public runMobileAiEnrichment(session: ListeningSessionData, noteFile: TFile | null): Promise<void> {
    return this.mobileAiRunner(session, noteFile);
  }

  public async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_EAR_COACH_SETTINGS, await this.loadData());
    // SPEC_015: 필드 대응은 객체라 얕은 병합으로 빠진 역할을 기본값으로 채운다
    this.settings.ankiFieldMap = { ...DEFAULT_EAR_COACH_SETTINGS.ankiFieldMap, ...(this.settings.ankiFieldMap ?? {}) };
    // SPEC_016: 이전 기본 덱 Default → happynote2
    this.settings.ankiDeck = migrateAnkiDeck(this.settings.ankiDeck);
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
