/**
 * 화면 검사 진입점: 고정 자막으로 모바일 EarCoachView를 띄운다(네트워크 없음).
 */
import { EarCoachView } from "../../src/ui/EarCoachView.ts";
import { mergeCuesIntoSegments } from "../../src/workers/transcriptProcessor.ts";
import { setPlatformMobileOverrideForTest } from "../../src/utils/platform.ts";
import { DEFAULT_EAR_COACH_SETTINGS } from "../../src/types/settings.ts";
import fixture from "./fixtures/transcript-sample.json";

declare global {
  interface Window {
    __uiReady?: boolean;
    __uiError?: string;
  }
}

async function main(): Promise<void> {
  document.body.classList.add("is-mobile");
  setPlatformMobileOverrideForTest(true);

  const settings = { ...DEFAULT_EAR_COACH_SETTINGS };
  (window as any).__earCoachSettings = settings; // SPEC_011: 저장 값 확인용
  const segments = mergeCuesIntoSegments(fixture.cues, {
    speedSpikeWpmThreshold: settings.speedSpikeWpmThreshold,
    defaultUnlockStep: settings.defaultUnlockStep,
    pinnedTimestamps: fixture.pinnedTimestamps,
  });

  const fakePlugin = {
    settings,
    saveSettings: async () => {},
    openUrlInputModal: () => {},
    restoreSessionForView: async () => {},
    runAgyBatchEnrichment: async () => {},
    agyService: {},
    noteGenerator: { saveSessionToNote: async () => {}, appendTutorCalloutToNote: async () => {} },
    weaknessTracker: { recordWeakSegment: async () => {} },
  };

  const view = new EarCoachView({} as any, fakePlugin as any);
  const host = document.getElementById("app")!;
  // 실제 Obsidian처럼 활성 leaf로 감싸고 뷰 타입을 단다(가로 전체화면 CSS가 이걸 본다).
  view.containerEl.dataset.type = view.getViewType();
  const leaf = document.createElement("div");
  leaf.className = "workspace-leaf mod-active";
  leaf.appendChild(view.containerEl);
  host.appendChild(leaf);
  await view.onOpen();
  const now = new Date().toISOString();
  await view.loadSession(
    {
      videoId: fixture.videoId,
      videoUrl: `https://www.youtube.com/watch?v=${fixture.videoId}`,
      title: fixture.title,
      createdAt: now,
      updatedAt: now,
      pinnedTimestamps: fixture.pinnedTimestamps,
      segments,
    },
    null
  );
  window.__uiReady = true;
}

main().catch((err) => {
  window.__uiError = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
});
