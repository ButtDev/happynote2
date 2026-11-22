/**
 * SPEC_039: Ear-Coach 화면(탭) 열기·복원, 마크다운 노트를 열 때 Ear-Coach 화면으로 바꿔 열기.
 */
import { Notice, TFile, WorkspaceLeaf } from "obsidian";
import type EarCoachPlugin from "../main";
import { ListeningSessionData } from "../types/transcript";
import { isMobileApp } from "../utils/platform";
import { needsAiAnalysis } from "../services/aiAnalysis";
import { EarCoachView, VIEW_TYPE_EAR_COACH } from "../ui/EarCoachView";

/** 모바일 — 해석이 없는 카드를 AI로 채움(키가 있을 때만, 백그라운드) */
function maybeStartMobileAi(plugin: EarCoachPlugin, session: ListeningSessionData, noteFile: TFile | null): void {
  if (isMobileApp() && plugin.getAiConfig() && session.segments.some(needsAiAnalysis)) {
    void plugin.runMobileAiEnrichment(session, noteFile);
  }
}

export async function activateWorkspaceView(
  plugin: EarCoachPlugin,
  session: ListeningSessionData,
  noteFile: TFile | null,
  focusTimestampSec?: number,
  closeOriginMarkdownLeaf: boolean = false
): Promise<void> {
  const { workspace } = plugin.app;
  let leaf: WorkspaceLeaf | null = null;
  const coachLeaves = workspace.getLeavesOfType(VIEW_TYPE_EAR_COACH);

  // noteFile을 표시하고 있는 마크다운 리프 찾기
  const mdLeavesToClose: WorkspaceLeaf[] = [];
  if (closeOriginMarkdownLeaf && noteFile) {
    workspace.iterateAllLeaves((l) => {
      if (l.view.getViewType() === "markdown") {
        const mdView = l.view as any;
        if (mdView.file && mdView.file.path === noteFile.path) {
          mdLeavesToClose.push(l);
        }
      }
    });
  }

  if (coachLeaves.length > 0) {
    // 1. 이미 EarCoachView 탭이 열려있으면 기존 탭을 재사용!
    leaf = coachLeaves[0];
    // 파일 클릭 시 새로 생긴 마크다운 에디터 탭 닫기
    for (const mdLeaf of mdLeavesToClose) {
      try {
        mdLeaf.detach();
      } catch {
        // ignore detach error
      }
    }
  } else if (mdLeavesToClose.length > 0) {
    // 2. EarCoachView 탭이 없으면, 새로 열린 마크다운 탭을 EarCoachView로 즉시 전환!
    leaf = mdLeavesToClose[0];
    for (let i = 1; i < mdLeavesToClose.length; i++) {
      try {
        mdLeavesToClose[i].detach();
      } catch {
        // ignore
      }
    }
    await leaf.setViewState({ type: VIEW_TYPE_EAR_COACH, active: true });
  } else {
    leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_EAR_COACH, active: true });
  }

  workspace.revealLeaf(leaf);
  if (leaf.view instanceof EarCoachView) {
    await leaf.view.loadSession(session, noteFile, focusTimestampSec);
  }

  // SPEC_021: 모바일 — 해석이 없는 카드를 AI로 채움
  maybeStartMobileAi(plugin, session, noteFile);
}

/** 앱 재시작으로 Obsidian이 복원한 Ear-Coach 화면에 세션을 다시 채움 */
export async function restoreSessionForView(
  plugin: EarCoachPlugin,
  view: EarCoachView,
  filePath?: string | null,
  videoId?: string | null
): Promise<void> {
  let targetFile: TFile | null = null;
  if (filePath) {
    const abstract = plugin.app.vault.getAbstractFileByPath(filePath);
    if (abstract instanceof TFile) {
      targetFile = abstract;
    }
  }
  if (!targetFile && videoId) {
    targetFile = plugin.noteGenerator.findExistingNoteByVideoId(videoId);
  }
  if (!targetFile) return;

  const session = await plugin.loadOrRecoverSession(targetFile);
  if (session) {
    await view.loadSession(session, targetFile);
    // SPEC_021: 앱 재시작으로 복원된 화면도 해석 없는 카드를 AI로 채움
    maybeStartMobileAi(plugin, session, targetFile);
  }
}

/** 지금 보고 있는 Ear-Coach 화면의 노트(없으면 활성 파일) */
export function getActiveEarCoachFile(plugin: EarCoachPlugin): TFile | null {
  const activeView = plugin.app.workspace.getActiveViewOfType(EarCoachView);
  if (activeView) {
    const state = activeView.getState() as { filePath?: string | null };
    if (state.filePath) {
      const f = plugin.app.vault.getAbstractFileByPath(state.filePath);
      if (f instanceof TFile) return f;
    }
  }
  return plugin.app.workspace.getActiveFile() ?? null;
}

export async function openEarCoachForNoteFile(plugin: EarCoachPlugin, file: TFile): Promise<void> {
  const session = await plugin.loadOrRecoverSession(file);
  if (!session) {
    new Notice("이 노트에는 Ear-Coach 리스닝 세션 데이터가 없습니다.");
    return;
  }
  await plugin.activateWorkspaceView(session, file);
}

/** 프런트매터·태그로 빠르게 Ear-Coach 노트인지(메타데이터가 아직 없으면 폴더·파일 이름으로) */
export function isEarCoachNoteFast(plugin: EarCoachPlugin, file: TFile): boolean {
  const cache = plugin.app.metadataCache.getFileCache(file);
  const tags = cache?.frontmatter?.tags;
  if (
    cache?.frontmatter?.video_id ||
    (Array.isArray(tags) && (tags.includes("ear-coach") || tags.includes("english-listening"))) ||
    tags === "ear-coach"
  ) {
    return true;
  }

  // Cold-start fallback before metadataCache is populated
  const notesFolder = (plugin.settings.notesFolder || "YouTube Listening").replace(/\/+$/, "");
  return file.path.startsWith(`${notesFolder}/`) && /\[[a-zA-Z0-9_-]{6,15}\]\.md$/.test(file.name);
}

/**
 * 마크다운으로 열리는 Ear-Coach 노트를 Ear-Coach 화면으로 바꿔 연다.
 * 7. WorkspaceLeaf.openFile 가로채기(CodeMirror가 큰 노트를 파싱하기 전) — 언로드 때 원래대로
 * 8. file-open·레이아웃 준비·메타데이터 resolved 때 열린 마크다운 탭 훑기(가로채기 놓친 경우)
 */
export function registerAutoOpen(plugin: EarCoachPlugin): void {
  const origOpenFile = WorkspaceLeaf.prototype.openFile;
  WorkspaceLeaf.prototype.openFile = async function (this: WorkspaceLeaf, file: TFile, openState?: any): Promise<void> {
    if (file && file.extension === "md" && !plugin.bypassOpenInterceptor && plugin.isEarCoachNoteFast(file)) {
      const session = await plugin.loadOrRecoverSession(file);
      if (session) {
        const coachLeaves = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_EAR_COACH);
        if (coachLeaves.length > 0) {
          const targetLeaf = coachLeaves[0];
          if (this !== targetLeaf && this.view.getViewType() === "empty") {
            this.detach();
          }
          plugin.app.workspace.revealLeaf(targetLeaf);
          if (targetLeaf.view instanceof EarCoachView) {
            await targetLeaf.view.loadSession(session, file);
          }
          return;
        }
        await this.setViewState({ type: VIEW_TYPE_EAR_COACH, active: true });
        plugin.app.workspace.revealLeaf(this);
        if (this.view instanceof EarCoachView) {
          await this.view.loadSession(session, file);
        }
        return;
      }
    }
    return origOpenFile.call(this, file, openState);
  };
  plugin.register(() => {
    WorkspaceLeaf.prototype.openFile = origOpenFile;
  });

  const switchingPaths = new Set<string>();

  const tryAutoOpenEarCoachForFile = async (file: TFile): Promise<void> => {
    if (switchingPaths.has(file.path)) return;
    const cache = plugin.app.metadataCache.getFileCache(file);
    const tags = cache?.frontmatter?.tags;
    let isEarCoach = Boolean(
      cache?.frontmatter?.video_id ||
        (Array.isArray(tags) && (tags.includes("ear-coach") || tags.includes("english-listening"))) ||
        tags === "ear-coach"
    );

    let prefetchedContent: string | undefined;
    if (!isEarCoach) {
      try {
        const content = await plugin.app.vault.read(file);
        if (content.includes("ear-coach-session") || content.includes("video_id:")) {
          isEarCoach = true;
          prefetchedContent = content;
        }
      } catch {
        // Ignore read errors
      }
    }

    if (isEarCoach) {
      switchingPaths.add(file.path);
      try {
        const session = await plugin.loadOrRecoverSession(file, prefetchedContent);
        if (session) {
          await plugin.activateWorkspaceView(session, file, undefined, true);
        }
      } finally {
        window.setTimeout(() => {
          switchingPaths.delete(file.path);
        }, 250);
      }
    }
  };

  const sweepOpenMarkdownLeavesForEarCoach = async (): Promise<void> => {
    if (plugin.bypassOpenInterceptor) return;
    const filesToCheck: TFile[] = [];
    const activeFile = plugin.app.workspace.getActiveFile();
    if (activeFile && activeFile.extension === "md") {
      filesToCheck.push(activeFile);
    }
    plugin.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view.getViewType() === "markdown") {
        const mdFile = (leaf.view as any).file;
        if (mdFile instanceof TFile && !filesToCheck.some((f) => f.path === mdFile.path)) {
          filesToCheck.push(mdFile);
        }
      }
    });
    for (const file of filesToCheck) {
      await tryAutoOpenEarCoachForFile(file);
    }
  };

  // 8. Fallback Auto-open when metadataCache wasn't warm yet or layout ready
  plugin.registerEvent(
    plugin.app.workspace.on("file-open", async (file) => {
      if (!file || !file.path.endsWith(".md") || plugin.bypassOpenInterceptor) return;
      await tryAutoOpenEarCoachForFile(file);
    })
  );

  plugin.app.workspace.onLayoutReady(async () => {
    await sweepOpenMarkdownLeavesForEarCoach();
    // Mobile cold-start safety: metadataCache & leaf restoration may settle slightly after layout ready
    window.setTimeout(() => {
      void sweepOpenMarkdownLeavesForEarCoach();
    }, 450);
  });

  plugin.registerEvent(
    plugin.app.metadataCache.on("resolved", () => {
      void sweepOpenMarkdownLeavesForEarCoach();
    })
  );
}
