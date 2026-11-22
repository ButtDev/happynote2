/**
 * SPEC_031: 번들된 cmudict-lite(약 30,000 낱말)를 처음 쓸 때 한 번 파싱해 둔다.
 * esbuild `.txt` text 로더가 필요(Node 시험은 soundHint.ts에 사전을 직접 넣는다).
 * SPEC_035: 없는 낱말은 `PronFallback`이 dictionaryapi IPA로 채운다(받아 오기는 `setPronunciationFetcher`).
 */
import raw from "../data/cmudict-lite.txt";
import { parseCmudictLite, pickHintChunk, soundHintForSegment, type HintSegmentLike, type SoundHint } from "./soundHint";
import { PronFallback, type IpaFetcher } from "./pronFallback";

let dict: PronFallback | null = null;
let fetcher: IpaFetcher | null = null;

export function getCmudict(): PronFallback {
  if (!dict) dict = new PronFallback(parseCmudictLite(raw), fetcher);
  return dict;
}

export function setPronunciationFetcher(f: IpaFetcher | null): void {
  fetcher = f;
  if (dict) dict.fetcher = f;
}

/** 문장 → 계산한 소리 힌트(사전에 없는 낱말이 있으면 null — 기존 AI 값을 쓴다) */
export function segmentSoundHint(seg: HintSegmentLike): (SoundHint & { text: string }) | null {
  try {
    return soundHintForSegment(seg, getCmudict());
  } catch {
    return null;
  }
}

/** 덩어리의 없는 낱말 IPA 받아 오기. 새로 채운 낱말이 있으면 true(다시 그릴 때). */
export async function ensureSegmentPronunciations(seg: HintSegmentLike): Promise<boolean> {
  try {
    const words = pickHintChunk(seg).map((i) => seg.words[i]);
    return await getCmudict().ensure(words);
  } catch {
    return false;
  }
}
