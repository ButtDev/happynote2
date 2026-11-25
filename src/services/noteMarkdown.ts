/**
 * 영상 노트 마크다운 — 만들기·세션 블록 바꾸기·세션 JSON 꺼내기 (순수 함수, NoteGenerator가 씀).
 *
 * 지킬 것:
 * - 노트에 세션 블록이 없거나 닫는 ``` 가 없어도 사람이 쓴 글(사운드 해부 기록 등)을 지우지 않는다.
 *   전에는 이때 노트 전체를 새 틀로 덮어써 사람이 쓴 글이 사라졌다.
 * - frontmatter 값 바꾸기는 맨 앞 frontmatter 안에서만 한다(본문 글은 건드리지 않음).
 * - 저장 때마다 「📌 핀 요약」 절 안만 지금 핀으로 바꾼다(SPEC_062). 절 밖 사람 글은 그대로.
 */
import type { ListeningSessionData } from "../types/transcript.ts";
import { formatSecondsToTimestamp } from "../utils/youtubeUrlParser.ts";

export const SESSION_CODEBLOCK_START = "```ear-coach-session";
export const SESSION_CODEBLOCK_END = "```";
export const SESSION_SECTION_HEADING = "## 🎛️ 인터랙티브 리스닝 세션 데이터";

export interface SidecarSessionPointer {
  storage: "sidecar";
  videoId: string;
  title: string;
  segmentCount: number;
  pinnedCount: number;
}

export function buildSidecarPointer(session: ListeningSessionData): SidecarSessionPointer {
  return {
    storage: "sidecar",
    videoId: session.videoId,
    title: session.title,
    segmentCount: session.segments.length,
    pinnedCount: session.segments.filter((s) => s.isPinned).length,
  };
}

function sessionBlock(session: ListeningSessionData): string {
  return [SESSION_CODEBLOCK_START, JSON.stringify(buildSidecarPointer(session)), SESSION_CODEBLOCK_END].join("\n");
}

export const PIN_SUMMARY_HEADING = "## 📌 집중 분석 핀(Unclear Spots) 요약";

/** 핀 요약 절 안의 글(핀 줄들, 핀이 없으면 안내 한 줄). 노트 만들기와 저장 때 갱신이 같은 글을 쓴다. */
export function buildPinSummary(session: ListeningSessionData): string {
  const lines = session.segments
    .filter((s) => s.isPinned)
    .map(
      (s) =>
        `- 📌 **[${formatSecondsToTimestamp(s.start)}]** — ||${s.text}|| *(소리 힌트: ${s.analysis?.phoneticKr || "분석 중"})*`
    )
    .join("\n");
  return lines || "- 아직 고정된 집중 분석 핀이 없습니다. 안 들리는 구간에서 `📌 핀` 버튼을 눌러보세요!";
}

/**
 * 핀 요약 절(제목 줄 다음 ~ 다음 `## ` 줄 또는 세션 블록 머리 바로 앞)을 지금 요약 + 빈 줄 하나로 바꾼다.
 * 제목 줄이 없으면 그대로(새로 넣지 않음), 두 개 이상이면 첫 번째만. 절 밖 글은 건드리지 않는다.
 */
export function refreshPinSummary(markdown: string, session: ListeningSessionData): string {
  const lines = markdown.split("\n");
  const h = lines.findIndex((l) => l.replace(/\r$/, "") === PIN_SUMMARY_HEADING);
  if (h === -1) return markdown;
  let end = h + 1;
  while (end < lines.length && !lines[end].startsWith("## ") && !lines[end].startsWith(SESSION_CODEBLOCK_START)) end++;
  const body = [...buildPinSummary(session).split("\n"), ""];
  return [...lines.slice(0, h + 1), ...body, ...lines.slice(end)].join("\n");
}

export function buildNoteMarkdown(session: ListeningSessionData): string {
  const pinnedCount = session.segments.filter((s) => s.isPinned).length;
  const speedSpikeCount = session.segments.filter((s) => s.isSpeedSpike).length;

  return [
    "---",
    `video_id: "${session.videoId}"`,
    `video_url: "${session.videoUrl}"`,
    `channel: "${(session.channelName || "YouTube").replace(/"/g, '\\"')}"`,
    `agy_conversation_id: "${session.agyConversationId || ""}"`,
    `pinned_count: ${pinnedCount}`,
    `speed_spike_count: ${speedSpikeCount}`,
    `created_at: "${session.createdAt}"`,
    `updated_at: "${session.updatedAt}"`,
    "tags:",
    "  - ear-coach",
    "  - english-listening",
    "---",
    "",
    `# 🎧 ${session.title}`,
    "",
    `> [!info] **Obsidian Ear-Coach 워크스페이스 안내**`,
    `> 좌측 목록에서 이 노트를 선택하거나 명령어 팔레트에서 **\`Ear-Coach: 현재 노트 리스닝 코치 열기\`**를 실행하면 **A-B 문장 무한 루프 + 3단계 블라인드 언락커 + 1:1 \`agy\` 사운드 닥터**를 인터랙티브하게 사용할 수 있습니다.`,
    "",
    PIN_SUMMARY_HEADING,
    buildPinSummary(session),
    "",
    SESSION_SECTION_HEADING,
    sessionBlock(session),
    "",
    "## 📝 나의 1:1 `agy` 사운드 해부 기록",
    "",
  ].join("\n");
}

/** 맨 앞 frontmatter(--- … ---)의 값만 바꾼다. frontmatter가 없으면 그대로. */
function refreshFrontmatter(markdown: string, session: ListeningSessionData): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/.exec(markdown);
  if (!m) return markdown;
  const pinnedCount = session.segments.filter((s) => s.isPinned).length;
  const speedSpikeCount = session.segments.filter((s) => s.isSpeedSpike).length;
  const fm = m[0]
    .replace(/^agy_conversation_id:[ \t]*"[^"\n]*"/m, () => `agy_conversation_id: "${session.agyConversationId || ""}"`)
    .replace(/^updated_at:[ \t]*"[^"\n]*"/m, () => `updated_at: "${session.updatedAt}"`)
    .replace(/^pinned_count:[ \t]*\d+/m, () => `pinned_count: ${pinnedCount}`)
    .replace(/^speed_spike_count:[ \t]*\d+/m, () => `speed_spike_count: ${speedSpikeCount}`);
  return fm + markdown.slice(m[0].length);
}

/**
 * 노트의 세션 블록을 지금 세션 포인터로 바꾼다. 빈 노트면 새 틀을 만든다.
 * 블록이 없으면 끝에 붙이고, 닫는 ``` 가 없으면 블록 머리 줄과 그 다음 JSON 한 줄만 바꾼다 — 다른 글은 그대로.
 */
export function replaceSessionBlock(markdown: string, session: ListeningSessionData): string {
  if (markdown.trim() === "") return buildNoteMarkdown(session);
  return refreshPinSummary(replaceBlockOnly(markdown, session), session);
}

function replaceBlockOnly(markdown: string, session: ListeningSessionData): string {
  const startIdx = markdown.indexOf(SESSION_CODEBLOCK_START);
  if (startIdx === -1) {
    const body = refreshFrontmatter(markdown, session).replace(/\s*$/, "");
    return `${body}\n\n${SESSION_SECTION_HEADING}\n${sessionBlock(session)}\n`;
  }

  const before = refreshFrontmatter(markdown.slice(0, startIdx), session);
  const jsonStart = startIdx + SESSION_CODEBLOCK_START.length;
  const endIdx = markdown.indexOf(SESSION_CODEBLOCK_END, jsonStart);
  if (endIdx !== -1) {
    return before + sessionBlock(session) + markdown.slice(endIdx + SESSION_CODEBLOCK_END.length);
  }

  // 닫는 ``` 없음: 머리 줄 끝, 그리고 바로 다음 줄이 JSON({…)이면 그 줄까지 바꾼다.
  let rest = markdown.slice(jsonStart);
  const headEnd = rest.indexOf("\n");
  rest = headEnd === -1 ? "" : rest.slice(headEnd + 1);
  if (rest.trimStart().startsWith("{")) {
    const lead = rest.length - rest.trimStart().length;
    const lineEnd = rest.indexOf("\n", lead);
    rest = lineEnd === -1 ? "" : rest.slice(lineEnd + 1);
  }
  return before + sessionBlock(session) + "\n" + rest;
}

/** 노트에서 세션 블록 속 JSON을 꺼낸다(옛 노트의 인라인 세션 또는 사이드카 포인터). 없거나 깨졌으면 null. */
export function extractSessionJson(markdown: string): unknown | null {
  const startIdx = markdown.indexOf(SESSION_CODEBLOCK_START);
  if (startIdx === -1) return null;
  const jsonStart = startIdx + SESSION_CODEBLOCK_START.length;
  const endIdx = markdown.indexOf(SESSION_CODEBLOCK_END, jsonStart);
  if (endIdx === -1) return null;
  try {
    return JSON.parse(markdown.slice(jsonStart, endIdx).trim());
  } catch {
    return null;
  }
}
