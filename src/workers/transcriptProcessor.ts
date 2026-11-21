import type {
  ListeningTrapType,
  RawCueWord,
  RawTranscriptCue,
  SegmentPhoneticAnalysis,
  TranscriptSegment,
  UnlockStep,
} from "../types/transcript";

export interface TranscriptProcessOptions {
  speedSpikeWpmThreshold: number;
  defaultUnlockStep: UnlockStep;
  pinnedTimestamps?: number[];
  maxWordsPerSegment?: number;
  maxDurationPerSegment?: number;
}

const FUNCTION_WORDS = new Set([
  "a", "an", "the", "to", "of", "in", "on", "for", "at", "by", "with", "from",
  "up", "about", "into", "over", "after", "is", "am", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "shall", "should", "can", "could", "may", "might", "must", "and", "but", "or",
  "so", "if", "as", "that", "than", "it", "he", "she", "we", "they", "you", "i",
  "me", "him", "her", "us", "them", "my", "your", "his", "their", "our", "this",
]);

interface PhoneticRule {
  pattern: RegExp;
  trap: ListeningTrapType;
  hintKr: string;
  explanation: string;
}

const PHONETIC_RULES: PhoneticRule[] = [
  {
    pattern: /\b(going\s+to|gonna)\b/i,
    trap: "WEAK_FORM",
    hintKr: "going to -> [거너 / 아머너]",
    explanation: "'going to'가 빠르게 약화되어 [거너(gonna)] 혹은 'I'm going to'일 때 [아머너(I'mma)]로 발음됩니다.",
  },
  {
    pattern: /\b(want\s+to|wanna)\b/i,
    trap: "ELISION",
    hintKr: "want to -> [워너]",
    explanation: "'want to'에서 't' 소리가 탈락하며 [워너(wanna)]로 연음됩니다.",
  },
  {
    pattern: /\b(got\s+to|gotta)\b/i,
    trap: "FLAP_T",
    hintKr: "got to -> [가러]",
    explanation: "'got to'의 't'가 모음 사이에서 플랩(Flap T) 현상을 일으켜 [가러(gotta)]로 들립니다.",
  },
  {
    pattern: /\b(should\s+have|could\s+have|would\s+have|should've|could've|would've)\b/i,
    trap: "WEAK_FORM",
    hintKr: "조동사+have -> [슈러브 / 쿠러브 / 우러브]",
    explanation: "조동사 뒤의 'have'는 강세를 잃어 'of[어브]'처럼 약화되고 앞 단어와 연음됩니다.",
  },
  {
    pattern: /\b(did\s+you|could\s+you|would\s+you|what\s+you|got\s+you)\b/i,
    trap: "LINKING",
    hintKr: "d/t + you -> [디쥬 / 쿠쥬 / 우쥬 / 왓츄]",
    explanation: "자음 'd/t'와 'y'가 만나 구개음화(Palatalization)되면서 [쥬/츄] 소리로 변합니다.",
  },
  {
    pattern: /\b(out\s+of|kind\s+of|sort\s+of|lot\s+of|bought\s+a|what\s+a|get\s+a|put\s+it|take\s+it|make\s+it)\b/i,
    trap: "FLAP_T",
    hintKr: "Flap T/D + 모음 연음 -> [아우러 / 카이너 / 바러 / 푸릿]",
    explanation: "단어 끝 't/d' 뒤에 모음(`a, of, it`)이 오면 우리말 'ㄹ'에 가까운 탄설음(Flap)으로 부드럽게 이어집니다.",
  },
  {
    pattern: /\b(give\s+them|tell\s+them|with\s+them|let\s+him|ask\s+her)\b/i,
    trap: "ELISION",
    hintKr: "h/th 탈락 -> [기븜 / 텔름 / 레림 / 애스커]",
    explanation: "대명사 'them, him, her'의 첫 자음 'th/h'가 탈락하고 앞 자음과 바로 연음됩니다.",
  },
];

/**
 * Decodes HTML entities and removes non-speech caption artifacts cleanly.
 */
export function cleanCaptionText(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generates instant rule-based phonetic analysis so UI cards work immediately before or without AI batch completion.
 */
export function computeFallbackAnalysis(segment: TranscriptSegment): SegmentPhoneticAnalysis {
  const traps = new Set<ListeningTrapType>();
  const hints: string[] = [];
  const explanations: string[] = [];

  if (segment.isSpeedSpike) {
    traps.add("SPEED_SPIKE");
  }

  for (const rule of PHONETIC_RULES) {
    if (rule.pattern.test(segment.text)) {
      traps.add(rule.trap);
      hints.push(rule.hintKr);
      explanations.push(rule.explanation);
    }
  }

  const skeletonWordIndices: number[] = [];
  const dictationBlankIndices: number[] = [];

  segment.words.forEach((word, idx) => {
    const clean = word.replace(/[^a-zA-Z']/g, "").toLowerCase();
    if (!clean) return;
    if (!FUNCTION_WORDS.has(clean) && clean.length >= 3) {
      skeletonWordIndices.push(idx);
    } else {
      dictationBlankIndices.push(idx);
    }
  });

  // Limit dictation blanks to 2~4 most useful linked words
  const selectedBlanks =
    dictationBlankIndices.length > 0
      ? dictationBlankIndices.slice(0, 3)
      : segment.words.length > 1
        ? [Math.min(1, segment.words.length - 1)]
        : [0];

  if (traps.size === 0) {
    traps.add("LINKING");
  }

  const rhythmParts = segment.words.map((w, idx) =>
    skeletonWordIndices.includes(idx) ? `**${w.toUpperCase()}**` : w
  );

  return {
    traps: Array.from(traps),
    phoneticKr:
      hints.length > 0
        ? hints.join(" | ")
        : "강세 단어(굵은 글씨) 사이의 기능어를 약하고 빠르게 흘려 들어보세요.",
    trapExplanation:
      explanations.length > 0
        ? explanations.join(" ")
        : "원어민은 내용어(명사·동사·형용사)만 강하게 발음하고 전치사·대명사는 뭉개어 발음합니다.",
    skeletonWordIndices,
    dictationBlankIndices: selectedBlanks,
    rhythmGuide: rhythmParts.join(" "),
    translationKr: "(AI 정밀 해석 대기 중 - 우측 [🎙️ 사운드 해부] 또는 [AI 분석]을 눌러 즉시 확인하세요)",
  };
}

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc",
  "eg", "ie", "us", "uk", "am", "pm", "inc", "ltd", "co", "no", "vol", "fig",
]);

function isSentenceEnding(text: string): boolean {
  const trimmed = text.trim();
  if (!/[.?!]["')\]»”’]*$/.test(trimmed)) return false;

  // Check if ending with period is actually a known abbreviation or single-letter initial (e.g., "Dr.", "J.")
  if (/\.\s*["')\]»”’]*$/.test(trimmed)) {
    const match = trimmed.match(/([a-zA-Z]+)\.\s*["')\]»”’]*$/);
    if (match) {
      const token = match[1].toLowerCase();
      if (ABBREVIATIONS.has(token)) return false;
      if (token.length === 1 && /^[A-Z]$/.test(match[1])) return false;
    }
    if (/(?:[A-Za-z]\.){2,}\s*["')\]»”’]*$/.test(trimmed)) {
      return false; // e.g., U.S., e.g., i.e.
    }
  }

  return true;
}

/**
 * Splits a single caption cue if it contains internal sentence boundaries
 * (e.g., "it was great. Next week we will") and interpolates timestamps proportionally.
 */
function splitCueIntoSentenceFragments(cue: RawTranscriptCue): RawTranscriptCue[] {
  const text = cleanCaptionText(cue.text);
  if (!text || /^\[.*\]$/.test(text)) return [];

  const cueStart = Math.max(0, cue.start);
  const cueDuration = Math.max(0.5, cue.duration || 2.0);

  // Split at sentence-ending punctuation followed by whitespace and likely new sentence start
  const boundaries: number[] = [];
  const boundaryRegex = /([.?!]["')\]»”’]*)\s+(?=[A-Z0-9"'(\[“‘])/g;
  let m: RegExpExecArray | null;
  while ((m = boundaryRegex.exec(text)) !== null) {
    const splitPos = m.index + m[1].length;
    const candidatePrefix = text.slice(0, splitPos);
    if (isSentenceEnding(candidatePrefix)) {
      boundaries.push(splitPos);
    }
  }

  if (boundaries.length === 0) {
    return [{ start: cueStart, duration: cueDuration, text }];
  }

  const parts: string[] = [];
  let prev = 0;
  for (const pos of boundaries) {
    const part = text.slice(prev, pos).trim();
    if (part) parts.push(part);
    prev = pos;
  }
  const tail = text.slice(prev).trim();
  if (tail) parts.push(tail);

  if (parts.length <= 1) {
    return [{ start: cueStart, duration: cueDuration, text }];
  }

  const totalChars = Math.max(1, parts.reduce((acc, p) => acc + p.length, 0));
  const result: RawTranscriptCue[] = [];
  let cursor = cueStart;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const ratio = part.length / totalChars;
    const dur =
      i === parts.length - 1
        ? Math.max(0.4, Number((cueStart + cueDuration - cursor).toFixed(3)))
        : Math.max(0.4, Number((cueDuration * ratio).toFixed(3)));
    result.push({
      start: Number(cursor.toFixed(3)),
      duration: dur,
      text: part,
    });
    cursor += dur;
  }

  return result;
}

/**
 * Normalizes raw YouTube caption cues before sentence splitting:
 * 1. Strips non-speech markers and sorts chronologically.
 * 2. Deduplicates rolling-caption word overlaps between consecutive cues.
 * 3. Clamps overlapping display durations against the next cue's start time so
 *    sentence interpolation & loop end-times stay aligned with actual speech.
 */
function normalizeRawCues(cues: RawTranscriptCue[]): RawTranscriptCue[] {
  const cleaned: RawTranscriptCue[] = [];
  for (let i = 0; i < cues.length; i++) {
    const raw = cues[i];
    const text = cleanCaptionText(raw.text);
    if (!text || /^\[.*\]$/.test(text) || /^\(.*\)$/.test(text)) continue;
    const cue: RawTranscriptCue = {
      start: Math.max(0, raw.start),
      duration: Math.max(0.35, raw.duration || 2.0),
      text,
    };
    if (Array.isArray(raw.words) && raw.words.length >= 2) cue.words = raw.words.slice();
    cleaned.push(cue);
  }

  if (cleaned.length <= 1) return cleaned;

  // Sort by start time cleanly (stable for same start)
  cleaned.sort((a, b) => a.start - b.start);

  // Deduplicate rolling caption overlap (e.g. prev ends with "how are you", next starts with "how are you doing")
  for (let i = 1; i < cleaned.length; i++) {
    // Word-timed ASR cues that do not overlap in time are not rolling captions: a repeated
    // phrase there is real speech ("do you do you"), so keep it (SPEC_018).
    const prevTimed = cleaned[i - 1].words;
    const currTimed = cleaned[i].words;
    if (prevTimed && currTimed && currTimed[0].start > prevTimed[prevTimed.length - 1].start) continue;
    const prevWords = cleaned[i - 1].text.split(/\s+/);
    const currWords = cleaned[i].text.split(/\s+/);
    const maxOverlap = Math.min(prevWords.length, currWords.length, 6);
    let overlapLen = 0;
    for (let k = maxOverlap; k >= 2; k--) {
      const prevTail = prevWords.slice(-k).join(" ").toLowerCase();
      const currHead = currWords.slice(0, k).join(" ").toLowerCase();
      if (prevTail === currHead) {
        overlapLen = k;
        break;
      }
    }
    if (overlapLen > 0) {
      const trimmedText = currWords.slice(overlapLen).join(" ").trim();
      cleaned[i].text = trimmedText;
      const cueWords = cleaned[i].words;
      if (cueWords) {
        const keep = currWords.length - overlapLen;
        cleaned[i].words = keep > 0 ? cueWords.slice(Math.max(0, cueWords.length - keep)) : undefined;
      }
    }
  }

  const nonEmpty = cleaned.filter((c) => c.text.length > 0);

  // Normalize overlapping / artificially truncated cue durations using next cue's start
  for (let i = 0; i < nonEmpty.length - 1; i++) {
    const curr = nonEmpty[i];
    const next = nonEmpty[i + 1];
    const gapToNext = next.start - curr.start;
    if (gapToNext > 0.25) {
      if (curr.start + curr.duration > next.start) {
        curr.duration = Number(gapToNext.toFixed(3));
      } else if (gapToNext <= 1.2 && curr.duration < gapToNext - 0.15) {
        curr.duration = Number(gapToNext.toFixed(3));
      }
    }
  }

  return nonEmpty;
}

/**
 * Merges fragmented raw caption cues into natural sentence-level segments and calculates WPM.
 */
export function mergeCuesIntoSegments(
  cues: RawTranscriptCue[],
  options: TranscriptProcessOptions
): TranscriptSegment[] {
  const normalizedCues = normalizeRawCues(cues);

  // 1. Pre-split cues that contain mid-cue sentence boundaries
  const fragments: RawTranscriptCue[] = [];
  let punctuatedFragmentsCount = 0;
  for (let i = 0; i < normalizedCues.length; i++) {
    const split = splitCueIntoSentenceFragments(normalizedCues[i]);
    for (const frag of split) {
      fragments.push(frag);
      if (isSentenceEnding(frag.text)) {
        punctuatedFragmentsCount++;
      }
    }
  }

  // Detect whether this transcript carries real sentence punctuation vs punctuation-free auto-captions (ASR)
  const hasSentencePunctuation =
    fragments.length > 0 && punctuatedFragmentsCount / fragments.length >= 0.1;

  // Punctuation-free ASR with word-level timings: cut at natural speech pauses (SPEC_018)
  if (!hasSentencePunctuation && hasWordTimings(normalizedCues)) {
    return mergeTimedWords(normalizedCues, options);
  }

  const maxWords =
    options.maxWordsPerSegment ?? (hasSentencePunctuation ? 55 : 26);
  const maxDuration =
    options.maxDurationPerSegment ?? (hasSentencePunctuation ? 28.0 : 12.0);
  const maxGap = hasSentencePunctuation ? 2.5 : 1.2;
  const pinnedList = options.pinnedTimestamps ?? [];

  const merged: TranscriptSegment[] = [];
  let bufferText: string[] = [];
  let bufferStart = 0;
  let bufferEnd = 0;

  const flushBuffer = (nextFragStart?: number) => {
    const fullText = bufferText.join(" ").replace(/\s+/g, " ").trim();
    bufferText = [];
    if (!fullText) return;

    // Give a small tail cushion up to next fragment start so final syllables are never clipped
    let effectiveEnd = bufferEnd;
    if (typeof nextFragStart === "number" && nextFragStart > effectiveEnd) {
      const slack = nextFragStart - effectiveEnd;
      if (slack <= 0.6) {
        effectiveEnd = Math.min(nextFragStart - 0.02, effectiveEnd + 0.15);
      }
    }

    const duration = Math.max(0.6, Number((effectiveEnd - bufferStart).toFixed(2)));
    const words = fullText.split(/\s+/).filter(Boolean);
    const wpm = Math.round((words.length / duration) * 60);
    const isSpeedSpike = wpm >= options.speedSpikeWpmThreshold;
    const index = merged.length;

    const isPinned = pinnedList.some(
      (pinSec) => pinSec >= bufferStart - 1.5 && pinSec <= effectiveEnd + 1.5
    );

    const segment: TranscriptSegment = {
      id: `seg-${index}-${Math.round(bufferStart * 10)}`,
      index,
      start: Number(bufferStart.toFixed(2)),
      end: Number(effectiveEnd.toFixed(2)),
      duration,
      text: fullText,
      words,
      wpm,
      isSpeedSpike,
      isPinned,
      unlockStep: options.defaultUnlockStep,
    };

    segment.analysis = computeFallbackAnalysis(segment);
    merged.push(segment);
  };

  for (let i = 0; i < fragments.length; i++) {
    const frag = fragments[i];
    const nextFragStart = i + 1 < fragments.length ? fragments[i + 1].start : undefined;
    const text = frag.text;
    const cueStart = Math.max(0, frag.start);
    const cueEnd = Math.max(cueStart + 0.4, cueStart + (frag.duration || 2.0));

    if (bufferText.length === 0) {
      bufferStart = cueStart;
      bufferEnd = cueEnd;
      bufferText.push(text);
    } else {
      const gap = cueStart - bufferEnd;
      const currentWords = bufferText.join(" ").split(/\s+/).length;
      const nextWords = text.split(/\s+/).length;
      const wouldExceedDuration = cueEnd - bufferStart > maxDuration;
      const wouldExceedWords = currentWords + nextWords > maxWords;

      // In punctuation-free ASR mode, only break at conjunctions when sentence is already substantial (>= 16 words)
      const shouldBreakBeforeConjunction =
        !hasSentencePunctuation &&
        currentWords >= 16 &&
        /^(and|but|so|because|when|while|although|though|however|if)\b/i.test(text);

      if (
        gap > maxGap ||
        wouldExceedDuration ||
        wouldExceedWords ||
        shouldBreakBeforeConjunction
      ) {
        flushBuffer(cueStart);
        bufferStart = cueStart;
        bufferEnd = cueEnd;
        bufferText.push(text);
      } else {
        bufferEnd = Math.max(bufferEnd, cueEnd);
        bufferText.push(text);
      }
    }

    const currentWordCount = bufferText.join(" ").split(/\s+/).length;
    if (isSentenceEnding(text)) {
      if (currentWordCount >= 2 || hasSentencePunctuation) {
        flushBuffer(nextFragStart);
      }
    } else if (!hasSentencePunctuation && /[,;]["']?$/.test(text) && currentWordCount >= 14) {
      flushBuffer(nextFragStart);
    }
  }

  if (bufferText.length > 0) {
    flushBuffer();
  }

  return merged;
}

export const ASR_PAUSE_SEC = 0.25;
export const ASR_HARD_PAUSE_SEC = 1.2;
export const ASR_MIN_WORDS = 4;
export const ASR_MAX_WORDS = 18;
const ASR_WORD_MAX_SEC = 0.6;
const ASR_SPLIT_MIN_INDEX = 5; // split after the 6th word at the earliest

const isBracketToken = (t: string) => /^\[.*\]$/.test(t) || /^\(.*\)$/.test(t);

function hasWordTimings(cues: RawTranscriptCue[]): boolean {
  const speech = cues.filter((c) => !isBracketToken(c.text));
  if (speech.length === 0) return false;
  const timed = speech.filter((c) => Array.isArray(c.words) && c.words.length >= 2).length;
  return timed / speech.length >= 0.8;
}

interface TimedWord extends RawCueWord {
  end: number;
}

function collectTimedWords(cues: RawTranscriptCue[]): TimedWord[] {
  const raw: Array<RawCueWord & { cueEnd: number }> = [];
  for (const cue of cues) {
    const cueEnd = cue.start + cue.duration;
    const list: RawCueWord[] =
      cue.words && cue.words.length > 0
        ? cue.words
        : cue.text.split(/\s+/).filter(Boolean).map((text, i, arr) => ({
            start: cue.start + (cue.duration * i) / arr.length,
            text,
          }));
    for (const w of list) {
      const text = cleanCaptionText(w.text);
      if (!text || isBracketToken(text)) continue;
      raw.push({ start: w.start, text, cueEnd });
    }
  }
  raw.sort((a, b) => a.start - b.start);
  return raw.map((w, i) => {
    const next = raw[i + 1];
    const limit = w.start + ASR_WORD_MAX_SEC;
    const end = next ? Math.min(next.start, limit) : Math.min(Math.max(w.cueEnd, w.start + 0.2), limit);
    return { start: w.start, text: w.text, end: Math.max(w.start, end) };
  });
}

function buildSegment(
  text: string,
  start: number,
  end: number,
  index: number,
  options: TranscriptProcessOptions
): TranscriptSegment {
  const pinnedList = options.pinnedTimestamps ?? [];
  const duration = Math.max(0.6, Number((end - start).toFixed(2)));
  const words = text.split(/\s+/).filter(Boolean);
  const wpm = Math.round((words.length / duration) * 60);
  const segment: TranscriptSegment = {
    id: `seg-${index}-${Math.round(start * 10)}`,
    index,
    start: Number(start.toFixed(2)),
    end: Number(end.toFixed(2)),
    duration,
    text,
    words,
    wpm,
    isSpeedSpike: wpm >= options.speedSpikeWpmThreshold,
    isPinned: pinnedList.some((pinSec) => pinSec >= start - 1.5 && pinSec <= end + 1.5),
    unlockStep: options.defaultUnlockStep,
  };
  segment.analysis = computeFallbackAnalysis(segment);
  return segment;
}

/**
 * Cuts punctuation-free ASR captions into short listening chunks at natural speech pauses
 * using word-level start times (SPEC_018).
 */
export function mergeTimedWords(
  cues: RawTranscriptCue[],
  options: TranscriptProcessOptions
): TranscriptSegment[] {
  const words = collectTimedWords(cues);
  const pauseAfter = (i: number) => (i + 1 < words.length ? words[i + 1].start - words[i].end : Infinity);

  const chunks: TimedWord[][] = [];
  let buf: number[] = [];
  for (let i = 0; i < words.length; i++) {
    buf.push(i);
    const pause = pauseAfter(i);
    if (pause >= ASR_HARD_PAUSE_SEC || (pause >= ASR_PAUSE_SEC && buf.length >= ASR_MIN_WORDS)) {
      chunks.push(buf.map((k) => words[k]));
      buf = [];
    } else if (buf.length >= ASR_MAX_WORDS) {
      let splitAt = buf.length - 1;
      let best = -Infinity;
      for (let j = ASR_SPLIT_MIN_INDEX; j <= buf.length - 2; j++) {
        const p = pauseAfter(buf[j]);
        if (p >= best) {
          best = p;
          splitAt = j;
        }
      }
      chunks.push(buf.slice(0, splitAt + 1).map((k) => words[k]));
      buf = buf.slice(splitAt + 1);
    }
  }
  if (buf.length > 0) chunks.push(buf.map((k) => words[k]));

  return chunks.map((chunk, index) => {
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const nextStart = index + 1 < chunks.length ? chunks[index + 1][0].start : Infinity;
    const end = Math.max(last.end, Math.min(last.end + 0.15, nextStart - 0.02));
    const text = chunk.map((w) => w.text).join(" ");
    return buildSegment(text, first.start, end, index, options);
  });
}
