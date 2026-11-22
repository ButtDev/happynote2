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
// SPEC_017: 합성 스토리보드 시트(960×540, 3×3 색 칸)
import storyboardSheet from "./fixtures/storyboard-sheet.png";
import { renderVideoDataSection } from "../../src/ui/videoDataSection.ts";
import { renderDiagnosticsSection } from "../../src/ui/diagnosticsSection.ts";
import { diagnostics } from "../../src/services/diagnostics.ts";
// SPEC_036: 실제 유튜브 itag 140 초기화+조각 1(TED iG9CE55wbtY) — Chrome 디코드 검사
import audioFixture from "../fixtures/audio-clip/itag140-frag1.m4a";
import { decodeAudioClip } from "../../src/ui/audioDecode.ts";
import { encodeWav } from "../../src/services/audioClip.ts";

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

  // SPEC_027: 첫 핀은 오늘 켠 것(아직 차례 아님), 나머지 핀은 시각 모름(바로 차례)
  const firstPinned = segments.find((s) => s.isPinned);
  if (firstPinned) firstPinned.pinnedAt = new Date().toISOString();

  const fakePlugin = {
    settings,
    saveSettings: async () => {},
    openUrlInputModal: () => {},
    restoreSessionForView: async () => {},
    runAgyBatchEnrichment: async () => {},
    agyService: {},
    noteGenerator: { saveSessionToNote: async () => {}, appendTutorCalloutToNote: async () => {} },
    weaknessTracker: { recordWeakSegment: async () => {} },
    learning: { setPin: async (...a: unknown[]) => { ((window as any).__learningPins ??= []).push(a); } }, // SPEC_040
    // SPEC_013: 가짜 사전(네트워크 없음) — 실제 응답 fixture를 파싱해 단어만 바꿔 돌려준다.
    // SPEC_015 회차 2: 발음 바이트(가짜, 3바이트)
    // SPEC_017: 스토리보드 시트 주소면 합성 시트 바이트
    fetchBytes: async (url: string) => {
      if (url.includes("/sb/")) {
        (window as any).__sbUrls = [...((window as any).__sbUrls ?? []), url];
        return (storyboardSheet as Uint8Array).slice().buffer;
      }
      return new Uint8Array([1, 2, 3]).buffer;
    },
    // SPEC_017: 가짜 스토리보드 스펙(L0 3×3 2초), window.__storyboardNone이면 없음
    storyboard: async (videoId: string) =>
      (window as any).__storyboardNone
        ? null
        : { spec: `https://i.ytimg.com/sb/${videoId}/storyboard3_L$L/$N.jpg?sqp=x|320#180#9#3#3#2000#M$M#sig`, durationSec: 60 },
    // SPEC_036: 가짜 원음(작은 WAV base64), window.__audioNone이면 null
    audioClip: async (videoId: string, start: number, end: number) => {
      const w = window as any;
      w.__clipArgs = [...(w.__clipArgs ?? []), [videoId, start, end]];
      return w.__audioNone ? null : "UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=";
    },
    // SPEC_015: 가짜 AnkiConnect — 호출 기록, window.__ankiDuplicate면 canAddNotes가 false
    anki: {
      invoke: async (action: string, params?: any) => {
        const w = window as any;
        w.__ankiCalls = [...(w.__ankiCalls ?? []), action];
        if (action === "deckNames") return w.__ankiDecks ?? ["happynote2"];
        if (action === "modelNames") return ["Basic (and reversed card)", "happynote2 Listening"];
        // SPEC_026: 문장 듣기 카드 노트 타입 필드
        if (action === "modelFieldNames") return params?.modelName === "happynote2 Listening" ? ["Sentence", "Cloze", "Picture", "Hint", "Source"] : ["Front", "Back"];
        if (action === "canAddNotes") return [!w.__ankiDuplicate];
        if (action === "storeMediaFile") {
          w.__ankiMedia = [...(w.__ankiMedia ?? []), params];
          return params?.filename;
        }
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
  (window as any).__decodeAudioClip = decodeAudioClip; // SPEC_036
  (window as any).__encodeWav = encodeWav;
  (window as any).__audioFixture = audioFixture;
  (window as any).__earCoachView = view; // SPEC_023: 재생 시각 흉내(playerBar.seekTo)
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
  // SPEC_033: 설정 화면 「🗑 저장된 영상」 — 가짜 저장소(영상 2개), 휴지통 호출은 window.__vdTrash
  (window as any).__renderVideoData = () => {
    const now = Date.now();
    const files: Record<string, { size: number; mtime: number; content?: string }> = {
      "YouTube Listening/How to Speak Fast English Like a Native Speaker in 30 Days [abcDEF12345].md": { size: 2048, mtime: now },
      "YouTube Listening/.ear-coach-sessions/abcDEF12345.json": { size: 812000, mtime: now },
      ".obsidian/plugins/obsidian-ear-coach/sessions/abcDEF12345.json": { size: 812000, mtime: now },
      "YouTube Listening/.ear-coach-sessions/xyzOnly0001.json": { size: 1600000, mtime: now - 86400000 * 3, content: '{"title":"Rick Song"}' },
      // SPEC_034: 사람이 Obsidian에서 지운 다른 노트(비우기가 건드리면 안 됨)
      ".trash/My diary.md": { size: 900, mtime: now },
    };
    const w = window as any;
    w.__vdTrash = [];
    w.__vdRemove = [];
    w.__vdRecorded = [];
    const store = {
      listFiles: async (dir: string) => Object.keys(files).filter((p) => p.startsWith(dir + "/")),
      stat: async (p: string) => (files[p] ? { size: files[p].size, mtime: files[p].mtime } : null),
      read: async (p: string) => files[p]?.content ?? "",
      trash: async (p: string) => {
        w.__vdTrash.push(p);
        // 실제처럼 볼트 .trash로 옮김(같은 이름이면 「 1」을 붙임)
        const base = p.slice(p.lastIndexOf("/") + 1);
        let dest = `.trash/${base}`;
        for (let i = 1; files[dest]; i++) dest = `.trash/${base.replace(/(\.[^.]+)$/, ` ${i}$1`)}`;
        files[dest] = files[p];
        delete files[p];
      },
      notes: async () => Object.keys(files).filter((p) => p.endsWith(".md") && !p.startsWith(".trash/")).map((path) => ({ path, videoId: null })),
    };
    const host = document.createElement("div");
    host.className = "ear-coach-ui-settings-host vertical-tab-content";
    // 실기기 설정 화면 근사: 헤더 아래 전체, 좌우 여백 16px
    host.style.cssText = "position:fixed;inset:88px 0 0 0;z-index:30;overflow:auto;box-sizing:border-box;padding:12px 16px;background:var(--background-primary)";
    document.body.appendChild(host);
    renderVideoDataSection(host, {
      app: {} as any,
      store,
      dirs: { notesDir: "YouTube Listening", sessionsDir: "YouTube Listening/.ear-coach-sessions", legacyDir: ".obsidian/plugins/obsidian-ear-coach/sessions" },
      trash: {
        store: {
          listFiles: store.listFiles,
          stat: store.stat,
          remove: async (p: string) => {
            w.__vdRemove.push(p);
            delete files[p];
          },
        },
        getRecorded: () => [...w.__vdRecorded],
        setRecorded: async (paths: string[]) => {
          w.__vdRecorded = paths;
        },
      },
      onDeleted: (item) => {
        w.__vdDeleted = [...(w.__vdDeleted ?? []), item.videoId];
      },
    });
  };
  // SPEC_038: 설정 「🩺 진단 복사」 — 공용 기록(window.__diagnostics), 복사 글은 window.__diagClip
  (window as any).__diagnostics = diagnostics;
  (window as any).__renderDiagnostics = () => {
    document.querySelector(".ear-coach-ui-settings-host")?.remove();
    const host = document.createElement("div");
    host.className = "ear-coach-ui-settings-host vertical-tab-content";
    host.style.cssText = "position:fixed;inset:88px 0 0 0;z-index:30;overflow:auto;box-sizing:border-box;padding:12px 16px;background:var(--background-primary)";
    document.body.appendChild(host);
    renderDiagnosticsSection(host, {
      appVersion: "9.9.9",
      obsidianVersion: "1.7.7",
      secrets: () => ["ui-fake-secret-123456"],
      writeClipboard: async (t: string) => {
        (window as any).__diagClip = t;
      },
    });
  };
  window.__uiReady = true;
}

main().catch((err) => {
  window.__uiError = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
});
