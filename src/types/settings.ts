import type { UnlockStep } from "./transcript";
import type { AnkiRole } from "../services/anki";
import type { AiProvider } from "../services/aiAnalysis";

/**
 * User-configurable settings for the Obsidian Ear-Coach plugin.
 */
export interface EarCoachSettings {
  notesFolder: string;
  /** SPEC_034: 「지우기」로 볼트 .trash에 옮긴 Ear-Coach 파일(비우기 대상) */
  videoDataTrash: string[];
  weaknessDashboardPath: string;
  agyBinaryPath: string;
  agyModel: string;
  ytDlpBinaryPath: string;
  autoRunAgyBatchOnCreate: boolean;
  maxBatchSegmentsPerRequest: number;
  speedSpikeWpmThreshold: number;
  defaultPlaybackRate: number;
  loopPaddingSeconds: number;
  /** SPEC_023: 「N번씩 다음 문장」의 N(2~10), 반복 사이 쉼(초, 0~5), 카드 목록 자동 따라가기 */
  loopRepeatCount: number;
  loopGapSeconds: number;
  autoFollowPlayback: boolean;
  defaultUnlockStep: UnlockStep;
  preferredCaptionLang: string;
  tutorPanelHeightPx: number;
  mobileListHeightPercent: number;
  /** SPEC_011: 가로 화면 영상 열 폭(%) */
  mobileLandscapeLeftPercent: number;
  /** SPEC_015: AnkiConnect Android 저장 */
  ankiDeck: string;
  ankiNoteType: string;
  ankiFieldMap: Record<AnkiRole, string>;
  ankiTags: string;
  /** SPEC_026: 안 들림 핀 문장 듣기 카드 노트 타입(필드 Sentence·Cloze·Picture·Hint·Source) */
  ankiSentenceNoteType: string;
  /** SPEC_021: 모바일 AI 번역·분석 */
  aiProvider: AiProvider;
  geminiApiKey: string;
  geminiModel: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
}

export const DEFAULT_EAR_COACH_SETTINGS: EarCoachSettings = {
  notesFolder: "YouTube Listening",
  videoDataTrash: [],
  weaknessDashboardPath: "YouTube Listening/My_Listening_Weakness.md",
  agyBinaryPath: "agy",
  agyModel: "gemini-3.8-flash",
  ytDlpBinaryPath: "yt-dlp",
  autoRunAgyBatchOnCreate: true,
  maxBatchSegmentsPerRequest: 25,
  speedSpikeWpmThreshold: 175,
  defaultPlaybackRate: 1.0,
  loopPaddingSeconds: 0.25,
  loopRepeatCount: 3,
  loopGapSeconds: 0,
  autoFollowPlayback: true,
  defaultUnlockStep: 0,
  preferredCaptionLang: "en",
  tutorPanelHeightPx: 380,
  mobileListHeightPercent: 50,
  mobileLandscapeLeftPercent: 58,
  ankiDeck: "happynote2",
  ankiNoteType: "Basic (and reversed card)",
  ankiFieldMap: {
    sentence: "Front",
    picture: "Front",
    meaning: "Front",
    word: "Back",
    ipa: "Back",
    audio: "Back",
    source: "Back",
  },
  ankiTags: "ear-coach",
  ankiSentenceNoteType: "happynote2 Listening",
  aiProvider: "gemini",
  geminiApiKey: "",
  geminiModel: "gemini-3.5-flash-lite",
  openaiBaseUrl: "https://api.groq.com/openai/v1",
  openaiApiKey: "",
  openaiModel: "openai/gpt-oss-120b",
};
