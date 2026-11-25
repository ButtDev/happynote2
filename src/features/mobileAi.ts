/**
 * SPEC_039: 모바일 AI 번역·분석(SPEC_021) — 설정에서 AI 설정 고르기, 대기 카드 채우기.
 */
import { Notice, TFile } from "obsidian";
import type EarCoachPlugin from "../main";
import { EarCoachSettings } from "../types/settings";
import { ListeningSessionData } from "../types/transcript";
import { AI_MESSAGES, AiConfig, aiResultMessage, aiStopDiagnostic, needsAiAnalysis, runAiAnalysis } from "../services/aiAnalysis";
import { diagnostics } from "../services/diagnostics";
import { failureCause } from "../services/notices";
import { notifyRetry } from "../ui/notify";
import { EarCoachView, VIEW_TYPE_EAR_COACH } from "../ui/EarCoachView";

/** 설정에서 지금 쓸 AI 설정. 키가 없으면 null */
export function aiConfigFromSettings(st: EarCoachSettings): AiConfig | null {
  if (st.aiProvider === "openai") {
    if (!st.openaiApiKey) return null;
    return { provider: "openai", apiKey: st.openaiApiKey, model: st.openaiModel, baseUrl: st.openaiBaseUrl };
  }
  if (!st.geminiApiKey) return null;
  return { provider: "gemini", apiKey: st.geminiApiKey, model: st.geminiModel };
}

/** 대기 카드만, 20장씩, 묶음마다 저장·다시 그림. 같은 영상은 한 번에 하나만 돈다. */
export function createMobileAiRunner(
  plugin: EarCoachPlugin
): (session: ListeningSessionData, noteFile: TFile | null) => Promise<void> {
  const running = new Set<string>();
  const run = async (session: ListeningSessionData, noteFile: TFile | null): Promise<void> => {
    const config = plugin.getAiConfig();
    if (!config || running.has(session.videoId)) return;
    const pending = session.segments.filter(needsAiAnalysis).length;
    if (pending === 0) return;
    running.add(session.videoId);
    new Notice(AI_MESSAGES.start(pending));
    const refresh = () => {
      for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE_EAR_COACH)) {
        if (leaf.view instanceof EarCoachView) leaf.view.refreshSegments();
      }
    };
    try {
      const result = await runAiAnalysis(session.segments, config, {
        fetch: plugin.aiFetch,
        sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
        title: session.title,
        onBatch: async () => {
          if (noteFile) await plugin.noteGenerator.saveSessionToNote(session, noteFile);
          refresh();
        },
      });
      if (result.stoppedBy) diagnostics.record("AI 분석", aiStopDiagnostic(result.stoppedBy));
      // SPEC_042: 붐빔·연결 실패는 「다시」(한도·키 거부는 다시 해도 같음)
      const kind = result.stoppedBy?.kind;
      if (kind === "busy" || kind === "network" || kind === "format") notifyRetry(aiResultMessage(result), () => run(session, noteFile));
      else new Notice(aiResultMessage(result), result.stoppedBy ? 10000 : 5000);
    } catch (err) {
      diagnostics.record("AI 분석", err);
      notifyRetry(AI_MESSAGES.failed(failureCause(err)), () => run(session, noteFile));
    } finally {
      running.delete(session.videoId);
    }
  };
  return run;
}
