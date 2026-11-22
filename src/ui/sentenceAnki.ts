/**
 * SPEC_026: 안 들림 핀 문장 → AnkiDroid 문장 듣기 카드 저장.
 * 순서: deckNames → modelNames → modelFieldNames → (장면 그림 storeMediaFile) → canAddNotes → addNote.
 * main.ts 900줄 한도 때문에 뷰 밖에 둔다.
 */
import type { TranscriptSegment } from "../types/transcript";
import type { AnkiInvoker, FetchBytes, SentenceSettingsLike } from "../services/anki";
import { ensureSegmentPronunciations, segmentSoundHint } from "../services/cmudictLite";
import { ANKI_MESSAGES, addNoteIfNew, ankiStatusMessage, buildSentenceNote, resolveSentenceTarget, snapshotFilename, storeSnapshot } from "../services/anki";

export interface SentenceAnkiDeps {
  client: AnkiInvoker;
  fetchBytes: FetchBytes;
  settings: SentenceSettingsLike;
  videoId: string | null;
  videoTitle: string | null;
  /** 영상·시각 → 장면 그림 JPEG base64(없으면 null) */
  snapshot: ((videoId: string, sec: number) => Promise<string | null>) | null;
}

/** 저장하고 사람에게 보일 문구를 돌려준다(던지지 않음). */
export async function saveSentenceCard(deps: SentenceAnkiDeps, seg: TranscriptSegment): Promise<string> {
  const { client, settings } = deps;
  if (!settings.ankiDeck?.trim() || !settings.ankiSentenceNoteType?.trim()) return ANKI_MESSAGES.noSettings;
  try {
    const target = await resolveSentenceTarget(client, settings);
    if (!target.ok) return target.message;
    let pictureFilename: string | null = null;
    const { videoId, snapshot } = deps;
    if (videoId && snapshot) {
      const sec = seg.end > seg.start ? (seg.start + seg.end) / 2 : seg.start;
      pictureFilename = await storeSnapshot(client, () => snapshot(videoId, sec), snapshotFilename(videoId, sec));
    }
    await ensureSegmentPronunciations(seg); // SPEC_035: 사전에 없는 낱말 IPA
    const note = buildSentenceNote(
      {
        text: seg.text,
        words: seg.words,
        attempts: seg.userDictationAttempts ?? null,
        phoneticKr: seg.analysis?.phoneticKr ?? null,
        traps: seg.analysis?.traps ?? null,
        videoId,
        videoTitle: deps.videoTitle,
        startSec: seg.start,
        pictureFilename,
        soundHint: segmentSoundHint(seg),
      },
      settings
    );
    const r = await addNoteIfNew(client, note);
    return r === "added" && !pictureFilename ? ANKI_MESSAGES.addedNoPicture : ankiStatusMessage(r);
  } catch (e) {
    return ankiStatusMessage(e);
  }
}
