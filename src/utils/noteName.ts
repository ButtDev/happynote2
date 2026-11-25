// 노트 파일 이름 규칙(SPEC_060). import 없음 — node strip-types 시험이 바로 읽는다.

export const NOTE_TITLE_MAX = 70;
export const NOTE_TITLE_FALLBACK = "YouTube";

/**
 * 영상 제목 → 파일 이름에 쓸 제목.
 * - 파일 시스템 금지 글자 `\ / : * ? " < > |`와 제어 문자는 빈칸으로
 * - 70 코드 포인트까지(이모지 반쪽을 남기지 않음)
 * - 앞의 점(숨은 파일이 되어 Obsidian 목록에서 사라짐)과 끝의 점·빈칸을 뺌
 * - 남는 게 없으면 "YouTube"
 */
export function safeNoteTitle(title: string): string {
  const cleaned = String(title ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cut = Array.from(cleaned).slice(0, NOTE_TITLE_MAX).join("");
  const tidy = cut.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  return tidy || NOTE_TITLE_FALLBACK;
}

/** 노트 파일 이름(확장자 포함): `<제목> [<videoId>].md` */
export function noteFileName(title: string, videoId: string): string {
  return `${safeNoteTitle(title)} [${videoId}].md`;
}

/**
 * 파일 이름에서 영상 ID. 이 앱이 만든 이름 끝 `[id].md`를 먼저 보고,
 * 없으면 맨 끝의 `[id]`(제목 속 `[Official]` 같은 대괄호를 고르지 않게).
 */
export function videoIdFromNoteName(name: string): string | null {
  const tail = name.match(/\[([a-zA-Z0-9_-]{6,15})\]\.md$/);
  if (tail) return tail[1];
  const all = Array.from(name.matchAll(/\[([a-zA-Z0-9_-]{6,15})\]/g));
  return all.length ? all[all.length - 1][1] : null;
}
