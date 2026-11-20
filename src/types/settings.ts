import type { UnlockStep } from "./transcript";
import type { AnkiRole } from "../services/anki";

/**
 * User-configurable settings for the Obsidian Ear-Coach plugin.
 */
export interface EarCoachSettings {
  notesFolder: string;
  weaknessDashboardPath: string;
  agyBinaryPath: string;
  agyModel: string;
  ytDlpBinaryPath: string;
  autoRunAgyBatchOnCreate: boolean;
  maxBatchSegmentsPerRequest: number;
  speedSpikeWpmThreshold: number;
  defaultPlaybackRate: number;
  loopPaddingSeconds: number;
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
}

export const DEFAULT_EAR_COACH_SETTINGS: EarCoachSettings = {
  notesFolder: "YouTube Listening",
  weaknessDashboardPath: "YouTube Listening/My_Listening_Weakness.md",
  agyBinaryPath: "agy",
  agyModel: "gemini-3.8-flash",
  ytDlpBinaryPath: "yt-dlp",
  autoRunAgyBatchOnCreate: true,
  maxBatchSegmentsPerRequest: 25,
  speedSpikeWpmThreshold: 175,
  defaultPlaybackRate: 1.0,
  loopPaddingSeconds: 0.25,
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
};
