import type { RawTranscriptCue, TranscriptSegment } from "../types/transcript";

/** SPEC_043: 카드 낱말과 원본 낱말 사이에 건너뛸 수 있는 원본 낱말 수(군말 등) */
export const KARAOKE_MAX_SKIP = 3;
const RANGE_PAD_SEC = 0.5;

const bareWord = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");

interface TimedToken {
  start: number;
  bare: string;
}

function timedTokens(cues: RawTranscriptCue[]): TimedToken[] {
  const out: TimedToken[] = [];
  if (!cues.some((c) => Array.isArray(c.words) && c.words.length > 0)) return out; // 수동 자막: 단어 시각 없음
  for (const cue of cues) {
    // 자동 자막은 낱말 하나뿐인 cue엔 words가 없음 → 그 낱말은 cue 시작 시각
    const single = !cue.words && cue.text.trim().split(/\s+/).length === 1;
    const list = cue.words ?? (single ? [{ start: cue.start, text: cue.text }] : []);
    for (const w of list) {
      for (const part of (w.text ?? "").split(/\s+/)) {
        const bare = bareWord(part);
        if (bare) out.push({ start: w.start, bare });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** 첫 i: tokens[i].start >= t */
function lowerBound(tokens: TimedToken[], t: number): number {
  let lo = 0;
  let hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid].start < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * SPEC_043: 합친 카드마다 낱말 시작 시각을 원본 낱말(cue.words)에서 찾아 `wordStarts`로 붙인다.
 * 모든 낱말을 찾았을 때만 붙이고, 아니면 붙이지 않는다(지운다).
 */
export function attachWordStarts(segments: TranscriptSegment[], cues: RawTranscriptCue[]): void {
  const tokens = timedTokens(cues);
  for (const seg of segments) {
    delete seg.wordStarts;
    if (tokens.length === 0 || seg.words.length === 0) continue;
    const from = seg.start - RANGE_PAD_SEC;
    const to = seg.end + RANGE_PAD_SEC;
    const starts = matchWords(seg.words, tokens, lowerBound(tokens, from), to);
    if (starts) seg.wordStarts = starts;
  }
}

function matchWords(words: string[], tokens: TimedToken[], begin: number, to: number): number[] | null {
  const starts: number[] = [];
  let k = begin;
  for (let wi = 0; wi < words.length; wi++) {
    const want = bareWord(words[wi]);
    if (!want) {
      // 구두점만 있는 낱말은 앞 낱말 시각을 이어 씀
      if (starts.length === 0) return null;
      starts.push(starts[starts.length - 1]);
      continue;
    }
    // 첫 낱말은 범위 안 어디서든, 그다음은 KARAOKE_MAX_SKIP개까지 건너뜀
    const limit = wi === 0 ? tokens.length : Math.min(tokens.length, k + KARAOKE_MAX_SKIP + 1);
    let found = -1;
    for (let j = k; j < limit && tokens[j].start <= to; j++) {
      if (tokens[j].bare === want) {
        found = j;
        break;
      }
    }
    if (found < 0) return null;
    starts.push(tokens[found].start);
    k = found + 1;
  }
  return starts;
}

/** SPEC_043: 재생 시각 t에 칠할 낱말 번호. 없으면 -1. */
export function activeWordIndex(seg: Pick<TranscriptSegment, "start" | "end" | "wordStarts">, t: number): number {
  const ws = seg.wordStarts;
  if (!ws || ws.length === 0 || t < seg.start || t >= seg.end) return -1;
  let idx = -1;
  for (let i = 0; i < ws.length; i++) {
    if (ws[i] <= t) idx = i;
    else break;
  }
  return idx;
}
