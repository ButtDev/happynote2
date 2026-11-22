/**
 * SPEC_031: 번들된 cmudict-lite(약 30,000 낱말)를 처음 쓸 때 한 번 파싱해 둔다.
 * esbuild `.txt` text 로더가 필요(Node 시험은 soundHint.ts에 사전을 직접 넣는다).
 */
import raw from "../data/cmudict-lite.txt";
import { parseCmudictLite, soundHintForSegment, type HintSegmentLike, type SoundHint } from "./soundHint";

let dict: Map<string, string[]> | null = null;

export function getCmudict(): Map<string, string[]> {
  if (!dict) dict = parseCmudictLite(raw);
  return dict;
}

/** 문장 → 계산한 소리 힌트(사전에 없는 낱말이 있으면 null — 기존 AI 값을 쓴다) */
export function segmentSoundHint(seg: HintSegmentLike): (SoundHint & { text: string }) | null {
  try {
    return soundHintForSegment(seg, getCmudict());
  } catch {
    return null;
  }
}
