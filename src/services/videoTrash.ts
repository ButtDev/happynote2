/**
 * SPEC_034: 「지우기」로 볼트 휴지통(.trash)에 옮긴 Ear-Coach 파일을 기록하고, 기록한 것만 영구 삭제한다.
 * obsidian import 없음 — 저장소 함수를 주입받는다.
 */

export const VAULT_TRASH_DIR = ".trash";

export interface VideoTrashStore {
  /** 폴더 안 파일 전체 경로. 없으면 [] */
  listFiles(dir: string): Promise<string[]>;
  stat(path: string): Promise<{ size: number } | null>;
  /** 영구 삭제 */
  remove(path: string): Promise<void>;
}

/** `.trash/` 밑이고 `..`이 없는 경로만 지울 수 있다 */
export function isSafeTrashPath(p: string): boolean {
  return typeof p === "string" && p.startsWith(VAULT_TRASH_DIR + "/") && !p.split("/").includes("..");
}

/** 지우기 직전·직후 목록의 차이(새로 생긴 것) */
export function newTrashEntries(before: readonly string[], after: readonly string[]): string[] {
  const had = new Set(before);
  return after.filter((p) => !had.has(p));
}

/** 기록에 더하기(중복 없이, 안전한 경로만) */
export function addTrashRecords(recorded: readonly string[], added: readonly string[]): string[] {
  const out = [...recorded];
  for (const p of added) if (isSafeTrashPath(p) && !out.includes(p)) out.push(p);
  return out;
}

/** 기록 중 지금 있는 파일과 크기 합 */
export async function trashStatus(store: VideoTrashStore, recorded: readonly string[]): Promise<{ paths: string[]; size: number }> {
  const paths: string[] = [];
  let size = 0;
  for (const p of recorded) {
    if (!isSafeTrashPath(p)) continue;
    const st = await store.stat(p);
    if (!st) continue;
    paths.push(p);
    size += st.size;
  }
  return { paths, size };
}

/**
 * 기록한 파일만 영구 삭제. 안전하지 않은 경로·이미 없는 경로는 기록에서만 뺀다.
 * 지우다 실패한 경로는 `remaining`(새 기록)에 남는다.
 */
export async function emptyVideoTrash(
  store: VideoTrashStore,
  recorded: readonly string[],
): Promise<{ removed: string[]; remaining: string[] }> {
  const removed: string[] = [];
  const remaining: string[] = [];
  for (const p of recorded) {
    if (!isSafeTrashPath(p)) continue;
    if (!(await store.stat(p))) continue;
    try {
      await store.remove(p);
      removed.push(p);
    } catch {
      remaining.push(p);
    }
  }
  return { removed, remaining };
}
