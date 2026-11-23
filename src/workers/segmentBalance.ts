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
  //    SPEC_049: same for a phrasal verb cut from its particle and a split spoken pair ("you | know").
  for (let i = 0; i + 1 < chunks.length; i++) {
    const cur = chunks[i];
    const next = chunks[i + 1];
    while (
      cur.length > 0 &&
      next.length < opt.maxWords &&
      badCutKind(words[cur[cur.length - 1]].text, words[next[0]].text) !== null && // SPEC_049: also "pick | up", "you | know"
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
      const p = c[j] + 1 === c[j + 1] ? cutScore(words, c[j]) : pause(c[j]); // SPEC_049: avoid bad cuts
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

/* ---- SPEC_049: where a card is cut ---- */

/** Particles that complete a phrasal verb ("pick | up" is a bad cut). */
export const PHRASAL_PARTICLES = new Set(["up", "down", "out", "off", "on", "in", "back", "away", "over"]);

/** Verbs that commonly take a particle (base forms; inflections are derived). */
export const PHRASAL_VERBS = new Set([
  "pick", "give", "take", "get", "come", "go", "look", "turn", "put", "find", "figure", "make", "run", "break",
  "bring", "carry", "check", "end", "fill", "hang", "hold", "keep", "let", "log", "move", "pass", "point", "pull",
  "push", "show", "shut", "sit", "stand", "start", "throw", "wake", "work", "call", "cut", "sort", "write", "grow",
  "sign", "settle", "wear", "back", "calm", "clean", "close", "cool", "drop", "fall", "finish", "freak", "hand", "head",
  "hurry", "kick", "knock", "lay", "line", "lock", "mess", "miss", "open", "pay", "play", "print", "sell", "shake",
  "slow", "speed", "step", "stay", "switch", "talk", "think", "tie", "try", "use", "wash", "wind", "wipe", "zoom",
  "blow", "burn", "catch", "cheer", "chill", "clear", "count", "dig", "dress", "drag", "eat", "grab", "hook", "jump",
  "light", "mix", "pile", "pop", "rip", "roll", "scroll", "sum", "tune", "warm", "walk", "bounce", "plug", "act",
  "stick", "boot", "fire", "bear", "build",
]);

/** Irregular forms of PHRASAL_VERBS. */
export const PHRASAL_IRREGULAR: Record<string, string> = { got: "get", gotten: "get", gave: "give", given: "give", took: "take", taken: "take", came: "come", went: "go", gone: "go", goes: "go", ran: "run", broke: "break", broken: "break", brought: "bring", held: "hold", kept: "keep", threw: "throw", thrown: "throw", woke: "wake", wore: "wear", worn: "wear", grew: "grow", grown: "grow", wrote: "write", written: "write", found: "find", made: "make", sat: "sit", stood: "stand", shown: "show", fell: "fall", ate: "eat", dug: "dig", laid: "lay", paid: "pay", sold: "sell", shook: "shake", thought: "think", caught: "catch", built: "build", lit: "light", blew: "blow", burnt: "burn", stuck: "stick", led: "lead", bore: "bear", carried: "carry", tried: "try", hurried: "hurry" };

/** Spoken chunks that should not be split between their two words ("you | know"). */
export const FILLER_PAIRS: Array<[string, string]> = [["you", "know"], ["i", "mean"], ["kind", "of"], ["sort", "of"], ["lot", "of"]];

/** ASR overflow split: a cut right before one of these words reads naturally. */
export const CLAUSE_START_WORDS = new Set([
  "and", "but", "so", "because", "which", "who", "whom", "whose", "that", "when", "where", "while",
  "if", "although", "though", "what", "why", "how", "or", "then",
]);

/** Punctuated captions: a long sentence without commas may be cut right before one of these. */
export const PUNCT_CLAUSE_WORDS = new Set(["and", "but", "because", "which", "who", "that", "when", "where", "so"]);

/** Seconds subtracted from a pause when cutting there would be a bad cut. */
export const BAD_CUT_PENALTY_SEC = 0.5;
/** Seconds added to a pause when the next word starts a clause. */
export const CLAUSE_START_BONUS_SEC = 0.15;

/** Base form if the word is a phrasal verb form ("picked" → "pick", "got" → "get"), else null. */
export function phrasalBase(text: string): string | null {
  const w = bareWord(text).replace(/[’‘]/g, "'");
  if (PHRASAL_VERBS.has(w)) return w;
  if (PHRASAL_IRREGULAR[w]) return PHRASAL_IRREGULAR[w];
  const rules: Array<[string, string]> = [["ing", ""], ["ing", "e"], ["ed", ""], ["ed", "e"], ["es", ""], ["s", ""], ["d", ""]];
  for (const [suf, add] of rules) {
    if (!w.endsWith(suf)) continue;
    const stem = w.slice(0, -suf.length) + add;
    if (PHRASAL_VERBS.has(stem)) return stem;
    if (suf !== "s" && /(.)\1$/.test(stem) && PHRASAL_VERBS.has(stem.slice(0, -1))) return stem.slice(0, -1);
  }
  return null;
}

/** Why cutting between these two words is bad, or null. Closing punctuation on the left makes any cut fine. */
export function badCutKind(prevText: string, nextText: string): "dangling" | "phrasal" | "filler" | null {
  if (/[.?!,;:—-]["'”’)\]]*$/.test(prevText)) return null;
  if (isDanglingTail(prevText)) return "dangling";
  const a = bareWord(prevText).replace(/[’‘]/g, "'");
  const b = bareWord(nextText).replace(/[’‘]/g, "'");
  if (PHRASAL_PARTICLES.has(b) && phrasalBase(prevText)) return "phrasal";
  if (FILLER_PAIRS.some(([x, y]) => x === a && y === b)) return "filler";
  return null;
}

/** Split score for cutting after words[j] (higher is better): pause − bad-cut penalty + clause bonus. */
export function cutScore(words: BalanceWord[], j: number): number {
  const next = words[j + 1];
  if (!next) return Infinity;
  let s = next.start - words[j].end;
  if (badCutKind(words[j].text, next.text)) s -= BAD_CUT_PENALTY_SEC;
  if (CLAUSE_START_WORDS.has(bareWord(next.text))) s += CLAUSE_START_BONUS_SEC;
  return s;
}

/**
 * A long punctuated card (> overWords words) with no comma-like mark is cut right before a clause word
 * (PUNCT_CLAUSE_WORDS) when both sides keep at least minSide words. Picks the cut nearest the middle.
 * Returns [head, tail] texts or null.
 */
export function splitLongPlainSentence(text: string, overWords: number, minSide: number): [string, string] | null {
  if (/[,;:—]|--/.test(text)) return null;
  const tokens = text.trim().split(/\s+/);
  const total = wordCount(text);
  if (total <= overWords) return null;
  let best = -1;
  let bestDist = Infinity;
  let before = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0 && PUNCT_CLAUSE_WORDS.has(bareWord(tokens[i])) && before >= minSide && total - before >= minSide && !/[.?!]["'”’)\]]*$/.test(tokens[i - 1])) {
      const dist = Math.abs(before - total / 2);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (/[\p{L}\p{N}]/u.test(tokens[i])) before++;
  }
  if (best < 0) return null;
  return [tokens.slice(0, best).join(" "), tokens.slice(best).join(" ")];
}
