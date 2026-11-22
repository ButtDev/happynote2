/**
 * SPEC_026: 안 들림 핀 문장 → AnkiDroid 문장 듣기 카드 저장.
 * 순서: deckNames → modelNames → modelFieldNames → (원음 받기) → (장면 그림 storeMediaFile) → storeMediaFile(원음) → canAddNotes → addNote.
 * SPEC_036: 원음(유튜브 문장 구간 WAV)을 못 받으면 저장하지 않는다.
 * main.ts 900줄 한도 때문에 뷰 밖에 둔다.
 */
import type { TranscriptSegment } from "../types/transcript";
import type { AnkiInvoker, FetchBytes, SentenceSettingsLike } from "../services/anki";
import { ensureSegmentPronunciations, segmentSoundHint } from "../services/cmudictLite";
import { ANKI_MESSAGES, addNoteIfNew, ankiStatusMessage, audioFilename, buildSentenceNote, resolveSentenceTarget, snapshotFilename, storeSnapshot } from "../services/anki";

export interface SentenceAnkiDeps {
  client: AnkiInvoker;
  fetchBytes: FetchBytes;
  settings: SentenceSettingsLike;
  videoId: string | null;
  videoTitle: string | null;
  /** 영상·시각 → 장면 그림 JPEG base64(없으면 null) */
  snapshot: ((videoId: string, sec: number) => Promise<string | null>) | null;
  /** SPEC_036: 영상·문장 시각 → 원음 WAV base64(없으면 null) */
  audioClip: ((videoId: string, start: number, end: number) => Promise<string | null>) | null;
}

/** 저장하고 사람에게 보일 문구를 돌려준다(던지지 않음). */
export async function saveSentenceCard(deps: SentenceAnkiDeps, seg: TranscriptSegment): Promise<string> {
  const { client, settings } = deps;
  if (!settings.ankiDeck?.trim() || !settings.ankiSentenceNoteType?.trim()) return ANKI_MESSAGES.noSettings;
  try {
    const target = await resolveSentenceTarget(client, settings);
    if (!target.ok) return target.message;
    let pictureFilename: string | null = null;
    const { videoId, snapshot, audioClip } = deps;
    // SPEC_036: 원음 먼저(못 받으면 Anki에 아무것도 넣지 않음)
    let audioData: string | null = null;
    if (videoId && audioClip) {
      try {
        audioData = await audioClip(videoId, seg.start, seg.end);
      } catch {
        audioData = null;
      }
    }
    if (!videoId || !audioData) return ANKI_MESSAGES.noAudio;
    if (videoId && snapshot) {
      const sec = seg.end > seg.start ? (seg.start + seg.end) / 2 : seg.start;
      pictureFilename = await storeSnapshot(client, () => snapshot(videoId, sec), snapshotFilename(videoId, sec));
    }
    const audioName = await storeSnapshot(client, async () => audioData, audioFilename(videoId, seg.start));
    if (!audioName) return ANKI_MESSAGES.noAudio;
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
        audioFilename: audioName,
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
