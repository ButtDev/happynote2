/**
 * SPEC_017: 유튜브 스토리보드(탐색 미리보기 스프라이트) → 그 시점 장면 칸.
 * iframe은 교차 출처라 픽셀을 못 읽으므로 i.ytimg.com/sb/ 시트를 받아 잘라 쓴다.
 * 이 파일은 obsidian을 import하지 않는다 — Node 시험에서 바로 돈다.
 */

export interface StoryboardLevel {
  level: number;
  width: number;
  height: number;
  count: number;
  cols: number;
  rows: number;
  intervalMs: number;
  name: string;
  sigh: string;
  baseUrl: string;
}

export interface StoryboardFrame {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
}

export interface StoryboardInfo {
  spec: string;
  durationSec: number | null;
}

/** `<base>|w#h#count#cols#rows#interval#name#sigh|…` → 단 목록(level 0부터). 형식이 틀린 단은 뺀다. */
export function parseStoryboardSpec(spec: string): StoryboardLevel[] {
  const parts = (spec ?? "").split("|");
  const baseUrl = parts[0]?.trim() ?? "";
  if (!baseUrl) return [];
  const out: StoryboardLevel[] = [];
  parts.slice(1).forEach((p, level) => {
    const f = p.split("#");
    if (f.length < 8) return;
    const [width, height, count, cols, rows, intervalMs] = f.slice(0, 6).map(Number);
    if (![width, height, count, cols, rows, intervalMs].every((n) => Number.isFinite(n) && n >= 0)) return;
    if (width <= 0 || height <= 0 || count <= 0 || cols <= 0 || rows <= 0) return;
    out.push({ level, width, height, count, cols, rows, intervalMs, name: f[6], sigh: f.slice(7).join("#"), baseUrl });
  });
  return out;
}

/** sec 시점 칸(가장 큰 단). 간격 0인 단은 durationSec이 있을 때만 쓴다. 쓸 단이 없으면 null. */
export function storyboardFrame(spec: string, sec: number, durationSec?: number | null): StoryboardFrame | null {
  const levels = parseStoryboardSpec(spec);
  let best: { lv: StoryboardLevel; interval: number } | null = null;
  for (const lv of levels) {
    const interval = lv.intervalMs > 0 ? lv.intervalMs : durationSec && durationSec > 0 ? (durationSec * 1000) / lv.count : 0;
    if (interval <= 0) continue;
    if (!best || lv.level > best.lv.level) best = { lv, interval };
  }
  if (!best) return null;
  const { lv, interval } = best;
  const t = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const idx = Math.min(lv.count - 1, Math.floor((t * 1000) / interval));
  const per = lv.cols * lv.rows;
  const sheet = Math.floor(idx / per);
  const k = idx % per;
  const name = lv.name.replace(/\$M/g, String(sheet));
  let url = lv.baseUrl.replace(/\$L/g, String(lv.level)).replace(/\$N/g, name);
  if (lv.sigh) url += `${url.includes("?") ? "&" : "?"}sigh=${lv.sigh}`;
  return { url, x: (k % lv.cols) * lv.width, y: Math.floor(k / lv.cols) * lv.height, width: lv.width, height: lv.height, level: lv.level };
}

/** player response(JSON) → 스펙·길이 */
export function storyboardFromPlayerResponse(pr: any): StoryboardInfo | null {
  const spec = pr?.storyboards?.playerStoryboardSpecRenderer?.spec;
  if (typeof spec !== "string" || !spec) return null;
  const len = Number(pr?.videoDetails?.lengthSeconds);
  return { spec, durationSec: Number.isFinite(len) && len > 0 ? len : null };
}

/** 시청 페이지 HTML → 스펙·길이(전체 JSON을 풀지 않고 필요한 글만) */
export function storyboardFromWatchHtml(html: string): StoryboardInfo | null {
  const m = (html ?? "").match(/"playerStoryboardSpecRenderer":\{"spec":"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  let spec: string;
  try {
    spec = JSON.parse(`"${m[1]}"`);
  } catch {
    return null;
  }
  if (!spec) return null;
  const len = Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1]);
  return { spec, durationSec: Number.isFinite(len) && len > 0 ? len : null };
}
