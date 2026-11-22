/**
 * SPEC_030: 빈칸 받아쓰기 채점. 아포스트로피(곧은·굽은)·구두점을 무시하고(모바일 키보드에선 ' 입력이 번거로움)
 * 같은 말의 구어 줄임('cause=because 등)을 정답으로 받는다. obsidian import 없음.
 */
export const DICTATION_SAME_WORDS: string[][] = [
  ["because", "cause", "cos", "cuz", "coz"],
  ["them", "em"],
  ["until", "till", "til"],
  ["okay", "ok"],
  ["going", "goin"],
  ["nothing", "nothin"],
  ["something", "somethin"],
  ["about", "bout"],
];

export function normalizeDictationWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function dictationMatches(user: string, expected: string): boolean {
  const u = normalizeDictationWord(user);
  const e = normalizeDictationWord(expected);
  if (!u || !e) return false;
  if (u === e) return true;
  return DICTATION_SAME_WORDS.some((group) => group.includes(u) && group.includes(e));
}
