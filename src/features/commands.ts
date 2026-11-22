/**
 * SPEC_039: 사람이 Ear-Coach를 부르는 입구 — URI 핸들러, 리본 아이콘, 명령, `ear-coach-session` 코드 블록.
 */
import { Notice, TFile } from "obsidian";
import type EarCoachPlugin from "../main";
import { ListeningSessionData } from "../types/transcript";
import { parseTimestampToSeconds, parseYouTubeUrl } from "../utils/youtubeUrlParser";
import { isMobileApp } from "../utils/platform";
import { diagnostics } from "../services/diagnostics";
import { getActiveEarCoachFile, openEarCoachForNoteFile } from "./workspaceView";
import { resegmentNoteFile } from "./sessionPipeline";

export function registerEntryPoints(plugin: EarCoachPlugin): void {
  // 2. Register Custom URI Handler: obsidian://ear-coach?url=...&t=142&pin=true
  plugin.registerObsidianProtocolHandler("ear-coach", async (params) => {
    const rawUrl = params.url;
    if (!rawUrl) {
      new Notice("Ear-Coach URI에 유튜브 url 파라미터가 없습니다.");
      return;
    }
    const pinSec = parseTimestampToSeconds(params.t);
    await plugin.handleYouTubeTrigger(rawUrl, pinSec);
  });

  // 3. Register Ribbon Icon
  plugin.addRibbonIcon("headphones", "Ear-Coach: 유튜브 영어 리스닝 노트 생성 / 열기", () => {
    plugin.openUrlInputModal();
  });

  // 4. Register Commands
  plugin.addCommand({
    id: "ear-coach-create-from-url-modal",
    name: "유튜브 URL로 리스닝 노트 생성 및 열기 (Create Listening Note from URL)",
    callback: () => {
      plugin.openUrlInputModal();
    },
  });

  plugin.addCommand({
    id: "ear-coach-create-from-clipboard",
    name: "클립보드 유튜브 URL로 즉시 리스닝 노트 생성 (Zero-Friction Clipboard Trigger)",
    callback: async () => {
      try {
        const clip = await navigator.clipboard.readText();
        const parsed = parseYouTubeUrl(clip);
        if (!parsed) {
          new Notice("클립보드에 유효한 유튜브 URL이 없습니다. 입력창을 엽니다.");
          plugin.openUrlInputModal();
          return;
        }
        await plugin.handleYouTubeTrigger(clip, parsed.timestampSeconds);
      } catch {
        plugin.openUrlInputModal();
      }
    },
  });

  plugin.addCommand({
    id: "ear-coach-open-current-note",
    name: "현재 마크다운 노트의 인터랙티브 리스닝 코치 워크스페이스 열기",
    checkCallback: (checking: boolean) => {
      const activeFile = plugin.app.workspace.getActiveFile();
      if (!activeFile) return false;
      if (!checking) {
        void openEarCoachForNoteFile(plugin, activeFile);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: "ear-coach-mobile-ai-continue",
    name: "현재 노트 AI 번역·분석 이어서 하기 (모바일)",
    checkCallback: (checking: boolean) => {
      if (!isMobileApp()) return false;
      const activeFile = getActiveEarCoachFile(plugin);
      if (!activeFile) return false;
      if (!checking) {
        void (async () => {
          const session = await plugin.loadOrRecoverSession(activeFile);
          if (!session) {
            new Notice("이 노트에는 Ear-Coach 리스닝 세션 데이터가 없습니다.");
            return;
          }
          if (!plugin.getAiConfig()) {
            new Notice("설정 → 🤖 AI 번역·분석에 API 키를 넣어 주세요.");
            return;
          }
          await plugin.runMobileAiEnrichment(session, activeFile);
        })();
      }
      return true;
    },
  });

  plugin.addCommand({
    id: "ear-coach-resegment-current-note",
    name: "현재 노트의 자막을 최신 문장 단위로 다시 추출·정렬 (Re-segment)",
    checkCallback: (checking: boolean) => {
      const activeFile = getActiveEarCoachFile(plugin);
      if (!activeFile) return false;
      if (!checking) {
        void resegmentNoteFile(plugin, activeFile);
      }
      return true;
    },
  });

  // 5. Register Markdown Codeblock Processor for `ear-coach-session`
  plugin.registerMarkdownCodeBlockProcessor("ear-coach-session", (source, el, ctx) => {
    el.empty();
    const card = el.createDiv({ cls: "ear-coach-inline-banner" });
    try {
      const parsed = JSON.parse(source);
      const isSidecar = parsed && parsed.storage === "sidecar";
      const title = parsed.title || "Ear-Coach 리스닝 세션";
      const segCount = isSidecar
        ? parsed.segmentCount ?? 0
        : Array.isArray(parsed.segments)
          ? parsed.segments.length
          : 0;
      const pinCount = isSidecar
        ? parsed.pinnedCount ?? 0
        : Array.isArray(parsed.segments)
          ? parsed.segments.filter((s: any) => s.isPinned).length
          : 0;

      card.createEl("h4", {
        text: `🎧 ${title} — 총 ${segCount}문장 (📌 핀 ${pinCount}개)`,
      });
      const openBtn = card.createEl("button", {
        cls: "ear-coach-btn ear-coach-btn-primary",
        text: isMobileApp()
          ? "🚀 인터랙티브 리스닝 워크스페이스 열기 (구간반복 + 3단계 블라인드)"
          : "🚀 인터랙티브 리스닝 워크스페이스 열기 (구간반복 + 3단계 블라인드 + agy 튜터)",
      });
      openBtn.addEventListener("click", async () => {
        const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (file instanceof TFile) {
          const fullSession = isSidecar ? await plugin.loadOrRecoverSession(file) : (parsed as ListeningSessionData);
          if (fullSession) {
            await plugin.activateWorkspaceView(fullSession, file);
          } else {
            diagnostics.record("세션 불러오기", ctx.sourcePath);
            new Notice("⚠️ 리스닝 세션을 불러오거나 복구하지 못했습니다.");
          }
        } else if (!isSidecar) {
          await plugin.activateWorkspaceView(parsed as ListeningSessionData, null);
        }
      });
    } catch {
      card.setText("⚠️ 리스닝 세션 JSON 데이터를 파싱할 수 없습니다.");
    }
  });
}
