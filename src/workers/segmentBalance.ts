/**
 * Card length balancing (SPEC_048): no import here so the node strip-types test can load it directly.
 *  - ASR (word timings): move dangling tail words ("in a", "because") to the next card and
 *    fold too-short chunks into the nearer neighbor, never across a long silence.
 *  - Punctuated captions: fold too-short sentences ("Good morning.", "Isn't it?") and
 *    letter-less leftovers (a lone quote mark) into a neighbor.
 */

/** Words a listening card should not end with — the sentence obviously continues. */
export const DANGLING_TAIL_WORDS = new Set([
  "a", "an", "the", "to", "of", "in", "on", "at", "for", "with", "from", "by", "into", "onto",
  "and", "but", "or", "nor", "so", "because", "if", "when", "while", "than",
  "my", "your", "his", "their", "our", "its",
  "it's", "i'm", "you're", "we're", "they're", "he's", "she's",
]);

export interface BalanceWord {
  start: number;
  end: number;
  text: string;
}

export interface TimedBalanceOptions {
  minWords: number;
  maxWords: number;
  /** Two words may share a card only if their start times differ by less than this. */
  maxStartGap: number;
}

export function bareWord(text: string): string {
  return text.replace(/^[.,!?;:"'“”‘’()[\]-]+|[.,!?;:"'“”‘’()[\]-]+$/g, "").toLowerCase();
}

/** True if a card ending with this word obviously continues (no closing punctuation after it). */
export function isDanglingTail(text: string): boolean {
  if (/[.?!,;:]["'”’)\]]*$/.test(text)) return false;
  return DANGLING_TAIL_WORDS.has(bareWord(text));
}

/** Rebalances ASR chunks (arrays of word indices, in order). Words are never dropped or reordered. */
export function rebalanceTimedChunks(words: BalanceWord[], input: number[][], opt: TimedBalanceOptions): number[][] {
  const chunks = input.map((c) => c.slice()).filter((c) => c.length > 0);
  const startGap = (a: number, b: number) => words[b].start - words[a].start;
  const pause = (i: number) => (i + 1 < words.length ? words[i + 1].start - words[i].end : Infinity);

  // 1. Dangling tails move forward (whole chunk if it is only dangling words).
  for (let i = 0; i + 1 < chunks.length; i++) {
    const cur = chunks[i];
    const next = chunks[i + 1];
    while (
      cur.length > 0 &&
      next.length < opt.maxWords &&
      isDanglingTail(words[cur[cur.length - 1]].text) &&
      startGap(cur[cur.length - 1], next[0]) < opt.maxStartGap
    ) {
      next.unshift(cur.pop()!);
    }
    if (cur.length === 0) {
      chunks.splice(i, 1);
      i--;
    }
  }

  // 2. Short chunks join the nearer neighbor; an over-long join is re-split at its biggest pause.
  const splitBest = (c: number[]): [number[], number[]] | null => {
    let at = -1;
    let best = -Infinity;
    for (let j = opt.minWords - 1; j <= c.length - opt.minWords - 1; j++) {
      if (c.length - (j + 1) > opt.maxWords || j + 1 > opt.maxWords) continue;
      const p = pause(c[j]);
      if (p >= best) {
        best = p;
        at = j;
      }
    }
    return at < 0 ? null : [c.slice(0, at + 1), c.slice(at + 1)];
  };
  for (let i = 0; i < chunks.length; i++) {
    const cur = chunks[i];
    if (cur.length >= opt.minWords) continue;
    const prev = chunks[i - 1];
    const next = chunks[i + 1];
    const gPrev = prev ? startGap(prev[prev.length - 1], cur[0]) : Infinity;
    const gNext = next ? startGap(cur[cur.length - 1], next[0]) : Infinity;
    const order: Array<"prev" | "next"> = gPrev <= gNext ? ["prev", "next"] : ["next", "prev"];
    for (const side of order) {
      const gap = side === "prev" ? gPrev : gNext;
      if (gap >= opt.maxStartGap) continue;
      const joined = side === "prev" ? [...prev, ...cur] : [...cur, ...next];
      const at = side === "prev" ? i - 1 : i;
      if (joined.length <= opt.maxWords) {
        chunks.splice(at, 2, joined);
      } else {
        const parts = splitBest(joined);
        if (!parts) continue;
        chunks.splice(at, 2, parts[0], parts[1]);
      }
      i = Math.max(-1, at - 1);
      break;
    }
  }
  return chunks;
}

export interface SentenceLike {
  start: number;
  end: number;
  text: string;
}

export interface SentenceBalanceOptions {
  /** Sentences with this many words or fewer are folded into a neighbor. */
  shortWords: number;
  /** Folding never makes a card longer than this. */
  maxWords: number;
  /** Folding only across a silence shorter than this (seconds). */
  maxGap: number;
}

const wordCount = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const hasLetter = (t: string) => /[\p{L}\p{N}]/u.test(t);
const isSpeakerLabel = (t: string) => /^\s*[([]/.test(t);

/** Folds too-short punctuated sentences into a neighbor. Returns new groups; untouched items are the same objects. */
export function mergeShortSentences<T extends SentenceLike>(input: T[], opt: SentenceBalanceOptions): Array<T | SentenceLike> {
  const out: Array<T | SentenceLike> = input.slice();
  const join = (a: SentenceLike, b: SentenceLike): SentenceLike => ({
    start: Math.min(a.start, b.start),
    end: Math.max(a.end, b.end),
    text: `${a.text} ${b.text}`.replace(/\s+/g, " ").trim(),
  });
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    const prev = out[i - 1];
    const next = out[i + 1];
    if (!hasLetter(cur.text)) {
      if (prev) out.splice(i - 1, 2, join(prev, cur));
      else if (next) out.splice(i, 2, join(cur, next));
      else continue;
      i = Math.max(-1, i - 2);
      continue;
    }
    const n = wordCount(cur.text);
    // A speaker label line ("(Audience) Good.") is another voice: never joined either way.
    if (n > opt.shortWords || isSpeakerLabel(cur.text)) continue;
    const ok = (o: SentenceLike | undefined, gap: number) =>
      !!o && gap < opt.maxGap && wordCount(o.text) + n <= opt.maxWords && !isSpeakerLabel(o.text);
    const gPrev = prev ? cur.start - prev.end : Infinity;
    const gNext = next ? next.start - cur.end : Infinity;
    const okPrev = ok(prev, gPrev);
    const okNext = ok(next, gNext);
    if (!okPrev && !okNext) continue;
    // Prefer the shorter neighbor so short lines pair up; ties go to the previous sentence.
    const usePrev = okPrev && (!okNext || wordCount(prev!.text) <= wordCount(next!.text));
    if (usePrev) out.splice(i - 1, 2, join(prev!, cur));
    else out.splice(i, 2, join(cur, next!));
    i = Math.max(-1, i - 2);
  }
  return out;
}
