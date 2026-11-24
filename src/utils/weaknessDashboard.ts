/**
 * SPEC_055: 약점 대시보드(`My_Listening_Weakness.md`) 그리기·읽기 — import 없는 순수 모듈.
 * 기록은 파일 끝 숨은 주석 `<!-- ear-coach-weakness: [...] -->`에 두어, 앱을 다시 켠 뒤에도 이어 쌓는다.
 */

export type WeaknessTrap = "LINKING" | "FLAP_T" | "WEAK_FORM" | "ELISION" | "SLANG" | "SPEED_SPIKE";

export interface WeaknessEntry {
  videoId: string;
  videoTitle: string;
  notePath: string;
  segmentStart: number;
  segmentText: string;
  phoneticKr: string;
  userHeard?: string;
  traps: WeaknessTrap[];
  recordedAt: string;
}

export const WEAKNESS_TRAP_LABELS: Record<WeaknessTrap, string> = {
  LINKING: "🔗 자음+모음 연음 (Linking)",
  FLAP_T: "💧 미국식 플랩 T/D (Flap T)",
  WEAK_FORM: "👻 기능어 약화 (Weak Forms)",
  ELISION: "✂️ 자음 탈락 (Elision)",
  SLANG: "💬 원어민 구어체/슬랭 (Slang/Idiom)",
  SPEED_SPIKE: "🚀 고속 발화 구간 (Speed Spike)",
};

export const WEAKNESS_VISIBLE_MAX = 50;
export const WEAKNESS_STORED_MAX = 500;
const MARK = "ear-coach-weakness:";
const COMMENT_RE = /<!--\s*ear-coach-weakness:\s*([\s\S]*?)\s*-->/;

function timestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** 새 기록을 맨 앞에 — 같은 영상·0.5초 안이면 그 자리를 바꿈. 최대 WEAKNESS_STORED_MAX개 */
export function upsertWeaknessEntry(entries: WeaknessEntry[], entry: WeaknessEntry): WeaknessEntry[] {
  const idx = entries.findIndex((e) => e.videoId === entry.videoId && Math.abs(e.segmentStart - entry.segmentStart) < 0.5);
  const next = entries.slice();
  if (idx >= 0) next[idx] = entry;
  else next.unshift(entry);
  return next.slice(0, WEAKNESS_STORED_MAX);
}

/** 숨은 주석에서 기록 되살리기 — 없거나 망가졌으면 빈 목록 */
export function parseWeaknessDashboard(markdown: string): WeaknessEntry[] {
  const m = COMMENT_RE.exec(markdown ?? "");
  if (!m) return [];
  try {
    const data = JSON.parse(m[1]);
    if (!Array.isArray(data)) return [];
    return data
      .filter((e) => e && typeof e.videoId === "string" && typeof e.segmentStart === "number" && Array.isArray(e.traps))
      .slice(0, WEAKNESS_STORED_MAX);
  } catch {
    return [];
  }
}

/** 대시보드 마크다운(보이는 부분은 예전과 같음) + 끝에 숨은 기록 */
export function renderWeaknessDashboard(entries: WeaknessEntry[], nowIso: string): string {
  const counts: Record<WeaknessTrap, number> = { LINKING: 0, FLAP_T: 0, WEAK_FORM: 0, ELISION: 0, SLANG: 0, SPEED_SPIKE: 0 };
  for (const item of entries) for (const trap of item.traps) counts[trap] = (counts[trap] || 0) + 1;
  const sortedTraps = (Object.keys(counts) as WeaknessTrap[]).sort((a, b) => counts[b] - counts[a]);
  const statsRows = sortedTraps.map((t) => `| ${WEAKNESS_TRAP_LABELS[t]} | **${counts[t]}회** |`).join("\n");
  const recentRows = entries
    .slice(0, WEAKNESS_VISIBLE_MAX)
    .map((e) => {
      const trapBadges = e.traps.map((t) => `\`${t}\``).join(" ");
      const heardInfo = e.userHeard ? ` (내 귀엔: *"${e.userHeard}"*)` : "";
      return `- **[${timestamp(e.segmentStart)}]** [[${e.notePath}|${e.videoTitle}]] — ||${e.segmentText}|| $\\rightarrow$ **소리**: \`${e.phoneticKr}\`${heardInfo} ${trapBadges}`;
    })
    .join("\n");
  // 주석 안에서 `--`가 나오면 주석이 끝나므로 JSON 문자열 이스케이프로 바꿈
  const stored = JSON.stringify(entries.slice(0, WEAKNESS_STORED_MAX)).replace(/--/g, "-\\u002d").replace(/>/g, "\\u003e");
  return [
    "---",
    "tags:",
    "  - ear-coach-dashboard",
    `updated_at: "${nowIso}"`,
    "---",
    "",
    "# 📊 내 귀의 사각지대 (My Ear Blindspots)",
    "",
    "> [!important] **나만의 취약 발음 레이더**",
    "> 유튜브 리스닝 중 `📌 안 들림 핀`을 꽂거나 `1:1 agy 사운드 해부`를 요청한 문장들이 자동으로 분류·누적됩니다.",
    "",
    "## 🏆 내가 가장 자주 놓치는 소리 변화 TOP 순위",
    "",
    "| 소리 변화(음운 현상) 유형 | 누적 빈도 |",
    "| :--- | :--- |",
    statsRows,
    "",
    `## 🔁 집중 복습이 필요한 문장 리스트 (최근 ${WEAKNESS_VISIBLE_MAX}개)`,
    "",
    recentRows || "- 아직 등록된 취약 문장이 없습니다.",
    "",
    `<!-- ${MARK} ${stored} -->`,
    "",
  ].join("\n");
}
