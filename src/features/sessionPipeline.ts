/**
 * SPEC_039: 리스닝 세션 만들기·불러오기·복구·재정렬·agy 분석.
 * main.ts의 같은 이름 메서드가 여기로 넘긴다.
 */
import { Notice, TFile } from "obsidian";
import type EarCoachPlugin from "../main";
import { ListeningSessionData } from "../types/transcript";
import { parseYouTubeUrl } from "../utils/youtubeUrlParser";
import { SegmentTimeIndex } from "../utils/binarySearch";
import { isDesktopApp, isMobileApp } from "../utils/platform";
import { diagnostics } from "../services/diagnostics";

/**
 * Loads session from memory/sidecar/markdown, and if the sidecar JSON was missing
 * (e.g. after mobile sync or app reinstall), automatically recovers it from YouTube!
 * 같은 영상의 복구는 한 번만 돈다(진행 중인 약속을 같이 기다림).
 */
export function createSessionLoader(
  plugin: EarCoachPlugin
): (file: TFile, prefetchedContent?: string) => Promise<ListeningSessionData | null> {
  const pendingRecoveryByVideoId = new Map<string, Promise<ListeningSessionData | null>>();
  return async (file, prefetchedContent) => {
    const loaded = await plugin.noteGenerator.loadSessionFromNote(file, plugin.workerManager, prefetchedContent);
    if (loaded) return loaded;

    let content = prefetchedContent;
    if (!content) {
      try {
        content = await plugin.app.vault.read(file);
      } catch {
        return null;
      }
    }

    const frontmatterMatch = content.match(/video_id:\s*["']?([a-zA-Z0-9_-]{6,15})["']?/);
    const videoId = frontmatterMatch?.[1] || plugin.noteGenerator.extractVideoIdFromFile(file);
    if (!videoId) return null;

    const existingPromise = pendingRecoveryByVideoId.get(videoId);
    if (existingPromise) return existingPromise;

    const recoveryPromise = (async (): Promise<ListeningSessionData | null> => {
      try {
        const fetched = await plugin.transcriptService.fetchTranscript(videoId, plugin.settings.preferredCaptionLang);
        const segments = await plugin.workerManager.processCuesAsync(fetched.cues, {
          speedSpikeWpmThreshold: plugin.settings.speedSpikeWpmThreshold,
          defaultUnlockStep: plugin.settings.defaultUnlockStep,
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
        await plugin.noteGenerator.saveSessionToNote(recovered, file, true);
        return recovered;
      } catch {
        return null;
      } finally {
        pendingRecoveryByVideoId.delete(videoId);
      }
    })();

    pendingRecoveryByVideoId.set(videoId, recoveryPromise);
    return recoveryPromise;
  };
}

/**
 * Core pipeline triggered by URI, Clipboard hotkey, or Modal.
 * If a note for this video already exists, adds the new timestamp pin and opens it immediately.
 * Otherwise extracts transcript -> merges sentences in Web Worker -> creates note -> opens interactive view -> runs optional `agy` batch analysis.
 */
export async function handleYouTubeTrigger(
  plugin: EarCoachPlugin,
  rawUrl: string,
  pinTimestampSeconds?: number
): Promise<void> {
  const parsed = parseYouTubeUrl(rawUrl);
  if (!parsed) {
    new Notice("유효한 유튜브 URL이 아닙니다.");
    return;
  }

  const effectivePin = pinTimestampSeconds ?? parsed.timestampSeconds;
  const existingFile = plugin.noteGenerator.findExistingNoteByVideoId(parsed.videoId);

  if (existingFile) {
    const existingSession = await plugin.loadOrRecoverSession(existingFile);
    if (existingSession) {
      if (effectivePin !== undefined) {
        if (!existingSession.pinnedTimestamps.includes(effectivePin)) {
          existingSession.pinnedTimestamps.push(effectivePin);
        }
        const idx = new SegmentTimeIndex(existingSession.segments).findNearestSegmentIndex(effectivePin);
        if (idx >= 0) {
          existingSession.segments[idx].isPinned = true;
        }
        await plugin.noteGenerator.saveSessionToNote(existingSession, existingFile);
        new Notice(`기존 노트에 📌 집중 분석 핀(${effectivePin}초)을 추가했습니다!`);
      }
      await plugin.activateWorkspaceView(existingSession, existingFile, effectivePin);
      return;
    }
  }

  new Notice("⏳ 유튜브 자막을 추출하고 문장 단위로 조립하고 있습니다...");

  try {
    const fetched = await plugin.transcriptService.fetchTranscript(parsed.videoId, plugin.settings.preferredCaptionLang);

    const pinnedTimestamps = effectivePin !== undefined ? [effectivePin] : [];

    const segments = await plugin.workerManager.processCuesAsync(fetched.cues, {
      speedSpikeWpmThreshold: plugin.settings.speedSpikeWpmThreshold,
      defaultUnlockStep: plugin.settings.defaultUnlockStep,
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

    const noteFile = await plugin.noteGenerator.saveSessionToNote(session);
    new Notice(`✅ 리스닝 노트 생성 완료: ${fetched.title}`);

    await plugin.activateWorkspaceView(session, noteFile, effectivePin);

    if (isDesktopApp() && plugin.settings.autoRunAgyBatchOnCreate) {
      plugin.runAgyBatchEnrichment(session, noteFile).catch(() => {
        // Fallback heuristics are already active; non-blocking background enrichment
      });
    }
  } catch (err) {
    diagnostics.record("노트 만들기", err);
    new Notice(`❌ 자막 추출 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Runs `agy` CLI structured batch analysis on pinned + speed-spike + key segments.
 */
export async function runAgyBatchEnrichment(
  plugin: EarCoachPlugin,
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
    .slice(0, plugin.settings.maxBatchSegmentsPerRequest);

  const response = await plugin.agyService.analyzeSegmentsBatch({
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
    await plugin.noteGenerator.saveSessionToNote(session, noteFile);
  }
}

/** 현재 노트의 자막을 최신 문장 단위로 다시 추출·정렬 */
export async function resegmentNoteFile(plugin: EarCoachPlugin, file: TFile): Promise<void> {
  const existing = await plugin.loadOrRecoverSession(file);
  const videoId = existing?.videoId || plugin.noteGenerator.extractVideoIdFromFile(file);
  if (!videoId) {
    new Notice("유튜브 Video ID를 찾을 수 없습니다.");
    return;
  }

  new Notice("⏳ 자막을 최신 문장 단위로 다시 추출·정렬하고 있습니다...");
  try {
    const fetched = await plugin.transcriptService.fetchTranscript(videoId, plugin.settings.preferredCaptionLang);
    const pinnedTimestamps = existing?.pinnedTimestamps ?? [];
    const segments = await plugin.workerManager.processCuesAsync(fetched.cues, {
      speedSpikeWpmThreshold: plugin.settings.speedSpikeWpmThreshold,
      defaultUnlockStep: plugin.settings.defaultUnlockStep,
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
    await plugin.noteGenerator.saveSessionToNote(updated, file, false);
    await plugin.activateWorkspaceView(updated, file);
    new Notice(`✅ 문장 단위 재정렬 완료 (${segments.length}문장)`);
  } catch (err) {
    diagnostics.record("재정렬", err);
    new Notice(`❌ 재정렬 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}
