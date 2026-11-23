/**
 * SPEC_049: card quality metrics, shared by Test 31 (tests/runTests.ts) and scripts/segment-report.ts.
 * The word lists come from tests/fixtures/segment-length/cases.json (`cut`), not from the code under test.
 */

export interface MetricCard {
  start: number;
  end: number;
  text: string;
}

export interface CutLists {
  particles: string[];
  phrasalVerbs: string[];
  irregularVerbs: Record<string, string>;
  fillerPairs: [string, string][];
  danglingTails: string[];
}

export interface CardMetrics {
  cards: number;
  maxWords: number;
  short: number;
  long: number;
  dangling: number;
  letterless: number;
  underSec: number;
  overSec: number;
  phrasal: number;
  filler: number;
  properNum: number;
  badCut: number;
}

export const wordCount = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const bare = (t: string) => t.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "").replace(/[’‘]/g, "'").toLowerCase();
const endsWithMark = (t: string) => /[.?!,;:—-]["'”’)\]]*$/.test(t);

/** Base form of a phrasal verb candidate, or null ("picked" → "pick", "got" → "get"). */
export function phrasalBase(word: string, lists: CutLists): string | null {
  const w = bare(word);
  const verbs = new Set(lists.phrasalVerbs);
  if (verbs.has(w)) return w;
  if (lists.irregularVerbs[w]) return lists.irregularVerbs[w];
  for (const [suf, add] of [["ing", ""], ["ing", "e"], ["ed", ""], ["ed", "e"], ["es", ""], ["s", ""], ["d", ""]] as const) {
    if (!w.endsWith(suf)) continue;
    let stem = w.slice(0, -suf.length) + add;
    if (verbs.has(stem)) return stem;
    if (suf !== "s" && /(.)\1$/.test(stem) && verbs.has(stem.slice(0, -1))) return stem.slice(0, -1); // picked / stopped / setting
  }
  return null;
}

export type CutKind = "dangling" | "phrasal" | "filler" | "properNum" | null;

/** Classifies the cut between a card's last token and the next card's first token. */
export function classifyCut(prevLast: string, nextFirst: string, lists: CutLists, manual: boolean): CutKind {
  if (endsWithMark(prevLast)) return null;
  const a = bare(prevLast);
  const b = bare(nextFirst);
  if (!a || !b) return null;
  if (lists.danglingTails.includes(a)) return "dangling";
  if (lists.particles.includes(b) && phrasalBase(a, lists)) return "phrasal";
  if (lists.fillerPairs.some(([x, y]) => x === a && y === b)) return "filler";
  if (/^\d/.test(a) && /^\d/.test(b)) return "properNum";
  const cap = (t: string) => /^["'“‘(]?\p{Lu}/u.test(t) && bare(t) !== "i" && !/^i'/.test(bare(t));
  if (manual && cap(prevLast) && cap(nextFirst)) return "properNum";
  return null;
}

export function cardMetrics(cards: MetricCard[], opt: { shortWords: number; longWords: number; minCardSec: number; maxCardSec: number; manual: boolean; lists: CutLists }): CardMetrics {
  const n = cards.length || 1;
  const wc = cards.map((c) => wordCount(c.text));
  const dur = cards.map((c) => c.end - c.start);
  const kinds = { dangling: 0, phrasal: 0, filler: 0, properNum: 0 };
  for (let i = 0; i + 1 < cards.length; i++) {
    const last = cards[i].text.trim().split(/\s+/).pop() ?? "";
    const first = cards[i + 1].text.trim().split(/\s+/)[0] ?? "";
    const k = classifyCut(last, first, opt.lists, opt.manual);
    if (k) kinds[k]++;
  }
  const r = (x: number) => Number((x / n).toFixed(3));
  return {
    cards: cards.length,
    maxWords: Math.max(0, ...wc),
    short: r(wc.filter((x) => x <= opt.shortWords).length),
    long: r(wc.filter((x) => x > opt.longWords).length),
    dangling: r(kinds.dangling),
    letterless: cards.filter((c) => !/[\p{L}\p{N}]/u.test(c.text)).length,
    underSec: r(dur.filter((d) => d < opt.minCardSec).length),
    overSec: r(dur.filter((d) => d > opt.maxCardSec).length),
    phrasal: r(kinds.phrasal),
    filler: r(kinds.filler),
    properNum: r(kinds.properNum),
    badCut: r(kinds.dangling + kinds.phrasal + kinds.filler + kinds.properNum),
  };
}
