/**
 * SPEC_033: 영상별 저장 데이터 목록·지우기(볼트 휴지통으로).
 * obsidian import 없음 — 저장소 함수를 주입받는다(시험은 가짜 저장소로).
 */

export interface VideoDataFileStat {
  size: number;
  mtime: number;
}

export interface VideoDataNote {
  path: string;
  /** front matter `video_id` (있으면) */
  videoId?: string | null;
}

export interface VideoDataStore {
  /** 폴더 안 파일 전체 경로. 폴더가 없으면 [] */
  listFiles(dir: string): Promise<string[]>;
  stat(path: string): Promise<VideoDataFileStat | null>;
  read(path: string): Promise<string>;
  /** 볼트 휴지통(.trash)으로 옮긴다 — 영구 삭제 아님 */
  trash(path: string): Promise<void>;
  notes(): Promise<VideoDataNote[]>;
}

export interface VideoDataDirs {
  /** 노트 폴더(예: YouTube Listening) */
  notesDir: string;
  /** `<노트폴더>/.ear-coach-sessions` */
  sessionsDir: string;
  /** `<configDir>/plugins/obsidian-ear-coach/sessions` */
  legacyDir: string;
}

export interface VideoDataItem {
  videoId: string;
  title: string;
  /** 지울 파일 경로(존재하는 것만) */
  paths: string[];
  size: number;
  mtime: number;
}

const NOTE_ID_RE = /\[([A-Za-z0-9_-]{6,15})\]\.md$/;
const JSON_ID_RE = /([A-Za-z0-9_-]{6,15})\.json$/;

function baseName(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

function inDir(p: string, dir: string): boolean {
  const d = dir.replace(/\/+$/, "");
  return d === "" ? !p.includes("/") : p.startsWith(d + "/") && !p.slice(d.length + 1).includes("/");
}

/** 노트 파일명 `<제목> [<id>].md`의 id */
export function videoIdFromNoteName(p: string): string | null {
  return baseName(p).match(NOTE_ID_RE)?.[1] ?? null;
}

/** 노트 파일명 `<제목> [<id>].md`의 제목(없으면 null) */
export function titleFromNoteName(p: string): string | null {
  const name = baseName(p);
  const m = name.match(/^(.*?)\s*\[[A-Za-z0-9_-]{6,15}\]\.md$/);
  const t = m?.[1]?.trim();
  return t ? t : null;
}

/** 크기 글자: 1MB 미만은 KB(최소 1), 그 위는 MB 소수 한 자리 */
export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** 지역 시간 YYYY-MM-DD */
export function formatDate(mtime: number): string {
  const d = new Date(mtime);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 노트(front matter video_id 또는 노트 폴더 안 파일명 [id]), 볼트 sidecar, 플러그인 폴더 사본의 합집합.
 * 마지막 저장 시각 내림차순.
 */
export async function listVideoData(store: VideoDataStore, dirs: VideoDataDirs): Promise<VideoDataItem[]> {
  const byId = new Map<string, { notes: string[]; sidecars: string[] }>();
  const slot = (id: string) => {
    let s = byId.get(id);
    if (!s) byId.set(id, (s = { notes: [], sidecars: [] }));
    return s;
  };

  for (const n of await store.notes()) {
    const id = n.videoId ? String(n.videoId) : inDir(n.path, dirs.notesDir) ? videoIdFromNoteName(n.path) : null;
    if (id) slot(id).notes.push(n.path);
  }
  for (const dir of [dirs.sessionsDir, dirs.legacyDir]) {
    for (const p of await store.listFiles(dir)) {
      if (!inDir(p, dir)) continue;
      const id = baseName(p).match(JSON_ID_RE)?.[1];
      if (id && baseName(p) === `${id}.json`) slot(id).sidecars.push(p);
    }
  }

  const items: VideoDataItem[] = [];
  for (const [videoId, s] of byId) {
    const paths: string[] = [];
    let size = 0;
    let mtime = 0;
    for (const p of [...s.notes, ...s.sidecars]) {
      const st = await store.stat(p);
      if (!st) continue;
      paths.push(p);
      size += st.size;
      mtime = Math.max(mtime, st.mtime);
    }
    if (paths.length === 0) continue;
    let title: string | null = null;
    for (const p of s.notes) title ??= titleFromNoteName(p);
    if (!title) {
      for (const p of s.sidecars) {
        if (!paths.includes(p)) continue;
        try {
          const t = JSON.parse(await store.read(p))?.title;
          if (typeof t === "string" && t.trim()) {
            title = t.trim();
            break;
          }
        } catch {
          // 다음 사본
        }
      }
    }
    items.push({ videoId, title: title ?? videoId, paths, size, mtime });
  }
  items.sort((a, b) => b.mtime - a.mtime || a.videoId.localeCompare(b.videoId));
  return items;
}

/** 그 영상의 파일을 휴지통으로. 이미 없는 파일은 건너뛴다. 옮긴 경로를 돌려준다. */
export async function deleteVideoData(store: VideoDataStore, item: Pick<VideoDataItem, "paths">): Promise<string[]> {
  const done: string[] = [];
  for (const p of item.paths) {
    if (!(await store.stat(p))) continue;
    await store.trash(p);
    done.push(p);
  }
  return done;
}
