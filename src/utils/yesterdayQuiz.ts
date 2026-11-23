/**
 * SPEC_050: 어제 영상 퀴즈(순수 함수, import 없음 — 시험 러너가 바로 읽음).
 * 날짜는 지역 달력 날짜 — tzOffsetMin은 Date#getTimezoneOffset() 값(KST = -540).
 */

export const QUIZ_SIZE = 3;
export const QUIZ_MIN_WORDS = 5;
export const QUIZ_MAX_WORDS = 16;
export const QUIZ_MAX_SEC = 20;
export const QUIZ_PASS_RATIO = 0.8;
export const QUIZ_LOOKBACK_DAYS = 7;
const SAME_START_SEC = 0.5;

function dayNumber(ms: number, tzOffsetMin: number): number {
  return Math.floor((ms - tzOffsetMin * 60_000) / 86_400_000);
}

export interface QuizActivity {
  positions: Record<string, { at: string }>;
  pins: readonly { videoId: string; pinnedAt: string }[];
  blanks: readonly { videoId: string; at: string }[];
  quizzes: readonly { at: string }[];
}

export interface QuizDay {
  /** 1 = 어제 */
  daysAgo: number;
  /** 그날 마지막 활동이 늦은 영상부터 */
  videoIds: string[];
}

/** 오늘 전 QUIZ_LOOKBACK_DAYS 안 가장 최근 활동 날의 영상들. 오늘 퀴즈를 했거나 없으면 null. */
export function pickQuizDay(act: QuizActivity, nowMs: number, tzOffsetMin: number): QuizDay | null {
  const today = dayNumber(nowMs, tzOffsetMin);
  if (act.quizzes.some((q) => dayNumber(Date.parse(q.at), tzOffsetMin) === today)) return null;
  const events: Array<{ id: string; ms: number }> = [];
  for (const [id, p] of Object.entries(act.positions)) events.push({ id, ms: Date.parse(p.at) });
  for (const p of act.pins) events.push({ id: p.videoId, ms: Date.parse(p.pinnedAt) });
  for (const b of act.blanks) events.push({ id: b.videoId, ms: Date.parse(b.at) });
  let bestDay = -Infinity;
  for (const e of events) {
    if (!Number.isFinite(e.ms)) continue;
    const d = dayNumber(e.ms, tzOffsetMin);
    if (d < today && d >= today - QUIZ_LOOKBACK_DAYS && d > bestDay) bestDay = d;
  }
  if (!Number.isFinite(bestDay)) return null;
  const last = new Map<string, number>();
  for (const e of events) {
    if (!Number.isFinite(e.ms) || dayNumber(e.ms, tzOffsetMin) !== bestDay) continue;
    last.set(e.id, Math.max(last.get(e.id) ?? -Infinity, e.ms));
  }
  const videoIds = [...last.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  return { daysAgo: today - bestDay, videoIds };
}

/** 줄 글자 */
export function quizBannerText(daysAgo: number, count: number): string {
  return daysAgo === 1 ? `🎧 어제 본 영상 퀴즈 ${count}문제` : `🎧 ${daysAgo}일 전 본 영상 퀴즈 ${count}문제`;
}

export interface QuizSegmentLike {
  index: number;
  start: number;
  end: number;
  text: string;
}

const wordCount = (t: string) => t.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

export function isQuizable(s: QuizSegmentLike): boolean {
  const n = wordCount(s.text);
  return n >= QUIZ_MIN_WORDS && n <= QUIZ_MAX_WORDS && s.end - s.start > 0 && s.end - s.start <= QUIZ_MAX_SEC;
}

/** 한 영상에서 문제 문장 번호: 틀린 빈칸 → 핀 → 나머지는 고르게. 최대 max개, 영상 순서대로. */
export function pickQuizSegments(
  segments: readonly QuizSegmentLike[],
  marks: { wrongStarts: readonly number[]; pinStarts: readonly number[] },
  max: number = QUIZ_SIZE
): number[] {
  const ok = segments.filter(isQuizable);
  const out: number[] = [];
  const add = (s: QuizSegmentLike | undefined) => {
    if (s && out.length < max && !out.includes(s.index)) out.push(s.index);
  };
  const near = (starts: readonly number[]) => starts.map((t) => ok.find((s) => Math.abs(s.start - t) < SAME_START_SEC));
  for (const s of near(marks.wrongStarts)) add(s);
  for (const s of near(marks.pinStarts)) add(s);
  const rest = ok.filter((s) => !out.includes(s.index));
  const need = max - out.length;
  for (let k = 0; k < need && rest.length > 0; k++) add(rest[Math.floor(((k + 0.5) * rest.length) / need)]);
  return out.sort((a, b) => a - b);
}

export interface GradedWord {
  text: string;
  ok: boolean;
}

export interface QuizGrade {
  words: GradedWord[];
  correct: number;
  total: number;
  pass: boolean;
}

/** 정답 낱말 중 입력과 최장 공통 부분열로 맞춘 것. same = 낱말 같음 판정(SPEC_030 dictationMatches). */
export function gradeQuizAnswer(answer: string, expected: string, same: (user: string, exp: string) => boolean): QuizGrade {
  const exp = expected.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  const usr = answer.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  const n = exp.length;
  const m = usr.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = same(usr[j], exp[i]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const okIdx = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (same(usr[j], exp[i]) && dp[i][j] === dp[i + 1][j + 1] + 1) {
      okIdx.add(i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const words = exp.map((text, i) => ({ text, ok: okIdx.has(i) }));
  const correct = okIdx.size;
  return { words, correct, total: n, pass: n > 0 && correct / n >= QUIZ_PASS_RATIO };
}
