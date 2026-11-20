/**
 * 화면 검사 진입점: 고정 자막으로 모바일 EarCoachView를 띄운다(네트워크 없음).
 */
import { EarCoachView } from "../../src/ui/EarCoachView.ts";
import { mergeCuesIntoSegments } from "../../src/workers/transcriptProcessor.ts";
import { setPlatformMobileOverrideForTest } from "../../src/utils/platform.ts";
import { DEFAULT_EAR_COACH_SETTINGS } from "../../src/types/settings.ts";
import fixture from "./fixtures/transcript-sample.json";
import { parseDictionaryApiDev } from "../../src/services/dictionary.ts";
import { PlayerBar } from "../../src/ui/components/PlayerBar.ts";
import helloDict from "../fixtures/dictionary/hello.json";
import phraseDict from "../fixtures/dictionary/look-forward-to.json";

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
    // SPEC_013: 가짜 사전(네트워크 없음) — 실제 응답 fixture를 파싱해 단어만 바꿔 돌려준다.
    // SPEC_015 회차 2: 발음 바이트(가짜, 3바이트)
    fetchBytes: async () => new Uint8Array([1, 2, 3]).buffer,
    // SPEC_015: 가짜 AnkiConnect — 호출 기록, window.__ankiDuplicate면 canAddNotes가 false
    anki: {
      invoke: async (action: string, params?: any) => {
        const w = window as any;
        w.__ankiCalls = [...(w.__ankiCalls ?? []), action];
        if (action === "deckNames") return w.__ankiDecks ?? ["happynote2"];
        if (action === "modelNames") return ["Basic (and reversed card)"];
        if (action === "modelFieldNames") return ["Front", "Back"];
        if (action === "canAddNotes") return [!w.__ankiDuplicate];
        if (action === "addNote") {
          w.__ankiNotes = [...(w.__ankiNotes ?? []), params?.note];
          return 1700000000000;
        }
        return null;
      },
    },
    dictionary: {
      name: "dictionaryapi.dev",
      lookup: async (w: string) => {
        (window as any).__dictLookups = [...((window as any).__dictLookups ?? []), w];
        // SPEC_014: 구는 이 목록에 있을 때만 결과(실제 구동사 응답 fixture를 단어만 바꿔서)
        if (w.includes(" ")) {
          if (!["go to", "get up", "show up"].includes(w)) return null;
          const p = parseDictionaryApiDev(phraseDict.response);
          return p ? { ...p, word: w } : null;
        }
        const e = parseDictionaryApiDev(helloDict.response);
        return e ? { ...e, word: w } : null;
      },
    },
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
  // SPEC_013: 사전 열 때 영상 멈춤 호출 수
  const origPause = PlayerBar.prototype.pause;
  PlayerBar.prototype.pause = function (this: PlayerBar) {
    (window as any).__pauseCalls = ((window as any).__pauseCalls ?? 0) + 1;
    return origPause.call(this);
  };
  window.__uiReady = true;
}

main().catch((err) => {
  window.__uiError = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
});
