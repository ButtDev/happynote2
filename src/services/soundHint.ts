/**
 * SPEC_031: 미국 발음 기준 한글 소리 힌트.
 * 낱말 소리 = CMUdict(ARPAbet·강세) → 이어 말하기 규칙 → 한글·IPA.
 * obsidian import 없음, 사전은 주입(Map 등). 데이터 로딩은 `cmudictLite.ts`.
 */

export interface PronDict {
  get(word: string): string[] | undefined;
}

/** 음소 하나. s = 강세(0/1/2), 자음은 -1. w = 덩어리 안 낱말 번호. */
export interface Ph {
  p: string;
  s: number;
  w: number;
  /** 첫 음소인가(낱말 안) */
  first?: boolean;
  tense?: boolean;
  flap?: boolean;
  /** 기능어 약한 꼴에서 왔는가 */
  weak?: boolean;
}

export interface SoundHint {
  hangul: string;
  ipa: string;
}

const VOWELS = new Set(["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"]);

/** 기능어 약한 꼴(덩어리가 두 낱말 이상일 때) */
export const WEAK_FORMS: Record<string, string> = {
  a: "AH0",
  the: "DH AH0",
  to: "T AH0",
  and: "AH0 N",
  of: "AH0 V",
  for: "F ER0",
  you: "Y UW0",
  your: "Y ER0",
  can: "K AH0 N",
  at: "AH0 T",
  them: "DH AH0 M",
  him: "IH0 M",
  her: "ER0",
  have: "HH AH0 V",
  was: "W AH0 Z",
  are: "ER0",
};

/** `src/data/cmudict-lite.txt` 파싱(머리말 `#map 기호=글자`). */
export function parseCmudictLite(text: string): Map<string, string[]> {
  const dec = new Map<string, string>();
  const out = new Map<string, string[]>();
  for (const line of text.split("\n")) {
    if (line.startsWith("#map ")) {
      for (const pair of line.slice(5).split(" ")) {
        const eq = pair.indexOf("=");
        if (eq > 0) dec.set(pair.slice(eq + 1), pair.slice(0, eq));
      }
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    const sp = line.indexOf(" ");
    if (sp <= 0) continue;
    const word = line.slice(0, sp);
    const codes = Array.from(line.slice(sp + 1));
    const phones = codes.map((c) => dec.get(c));
    if (phones.some((p) => !p)) continue;
    out.set(word, phones as string[]);
  }
  return out;
}

export function normalizeHintWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^[^a-z']+|[^a-z']+$/g, "")
    .replace(/^'+|'+$/g, "");
}

function toPh(arpa: string, w: number, i: number): Ph {
  const m = arpa.match(/^([A-Z]+)([012])?$/);
  const p = m ? m[1] : arpa;
  return { p, s: VOWELS.has(p) ? Number(m?.[2] ?? 0) : -1, w, first: i === 0 };
}

/** 낱말들 → 음소열(사전에 없는 낱말이 있으면 null) */
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under100(n: number): string[] {
  if (n < 20) return [ONES[n]];
  return n % 10 === 0 ? [TENS[Math.floor(n / 10)]] : [TENS[Math.floor(n / 10)], ONES[n % 10]];
}

function under1000(n: number): string[] {
  if (n < 100) return under100(n);
  const rest = n % 100;
  return [ONES[Math.floor(n / 100)], "hundred", ...(rest ? under100(rest) : [])];
}

/** 숫자 → 영어 낱말(0~9999, 1100~1999·2010~2099는 연도 읽기). 그 밖은 null. */
export function numberToWords(digits: string): string[] | null {
  if (!/^\d{1,4}$/.test(digits)) return null;
  const n = Number(digits);
  if (n < 1000) return under1000(n);
  if ((n >= 1100 && n <= 1999) || (n >= 2010 && n <= 2099)) {
    const lo = n % 100;
    return [...under100(Math.floor(n / 100)), ...(lo === 0 ? ["hundred"] : lo < 10 ? ["oh", ONES[lo]] : under100(lo))];
  }
  const rest = n % 1000;
  return [...under100(Math.floor(n / 1000)), "thousand", ...(rest ? under1000(rest) : [])];
}

/** 낱말 펼치기: 하이픈으로 나누고 숫자는 영어 낱말로 (30-minute → thirty minute). 못 읽는 숫자(21st·12345)가 있으면 null. */
export function expandHintWord(w: string): string[] | null {
  const out: string[] = [];
  for (const part of w.split(/[-–—]+/)) {
    if (!/\d/.test(part)) {
      out.push(normalizeHintWord(part));
      continue;
    }
    const m = part.match(/^[^A-Za-z0-9]*(\d{1,3}(?:,\d{3})*|\d+)[^A-Za-z0-9]*$/);
    const words = m ? numberToWords(m[1].replace(/,/g, "")) : null;
    if (!words) return null;
    out.push(...words);
  }
  return out;
}

/** SPEC_035: 축약 — 덩어리 안 두 낱말 → 한 낱말 소리 */
export const CONTRACTIONS: Record<string, string> = {
  "going to": "G AH1 N AH0",
  "want to": "W AA1 N AH0",
  "got to": "G AA1 T AH0",
  "have to": "HH AE1 F T AH0",
  "has to": "HH AE1 S T AH0",
  "kind of": "K AY1 N D AH0",
  "sort of": "S AO1 R T AH0",
  "out of": "AW1 T AH0",
  "let me": "L EH1 M IY0",
  "give me": "G IH1 M IY0",
  "don't know": "D AH0 N OW1",
};
/** 「… to」 축약을 막는 다음 낱말(to가 전치사) */
const TO_BLOCKERS = new Set(["the", "a", "an", "my", "your", "his", "her", "our", "their", "this", "that", "these", "those"]);

/** 낱말 하나(사전 찾기용 글자) 또는 축약(ARPAbet 직접) */
export type HintToken = { word: string; arpa?: string };

/** 펼친 낱말 + 축약 적용(SPEC_035). 못 읽는 숫자가 있으면 null. */
export function hintLookupWords(words: string[]): HintToken[] | null {
  const expanded: string[] = [];
  for (const w of words) {
    const e = expandHintWord(w);
    if (!e) return null;
    expanded.push(...e);
  }
  const norm = expanded.filter(Boolean);
  const out: HintToken[] = [];
  for (let i = 0; i < norm.length; i++) {
    const pair = i + 1 < norm.length ? `${norm[i]} ${norm[i + 1]}` : "";
    const arpa = CONTRACTIONS[pair];
    const blocked = norm[i + 1] === "to" && TO_BLOCKERS.has(norm[i + 2] ?? "");
    if (arpa && !blocked) {
      out.push({ word: pair, arpa });
      i++;
      continue;
    }
    out.push({ word: norm[i] });
  }
  return out;
}

/** 사전에 없는 낱말(기능어 약한 꼴·축약 제외). 못 읽는 숫자가 있으면 null. */
export function missingHintWords(words: string[], dict: PronDict): string[] | null {
  const toks = hintLookupWords(words);
  if (!toks) return null;
  const multi = toks.length > 1;
  return [...new Set(toks.filter((t) => !t.arpa && !(multi && WEAK_FORMS[t.word]) && !dict.get(t.word)).map((t) => t.word))];
}

export function wordsToPhonemes(words: string[], dict: PronDict): Ph[] | null {
  // 숫자가 빠지던 것(30-minute → minute) — 숫자는 영어로 읽고, 못 읽으면 계산 포기(AI 값으로)
  const toks = hintLookupWords(words);
  if (!toks || toks.length === 0) return null;
  const out: Ph[] = [];
  for (let w = 0; w < toks.length; w++) {
    const { word, arpa: fixed } = toks[w];
    const weak = toks.length > 1 && !fixed ? WEAK_FORMS[word] : undefined;
    const arpa = fixed ? fixed.split(" ") : weak ? weak.split(" ") : dict.get(word);
    if (!arpa || arpa.length === 0) return null;
    arpa.forEach((a, i) => out.push({ ...toPh(a, w, i), ...(weak ? { weak: true } : {}) }));
  }
  return out;
}

// ── IPA → ARPAbet (SPEC_035: 사전에 없는 낱말) ─────────────
const IPA2: Record<string, string> = {
  "tʃ": "CH", "dʒ": "JH", "eɪ": "EY", "aɪ": "AY", "ɔɪ": "OY", "aʊ": "AW", "oʊ": "OW", "əʊ": "OW",
  "ɪə": "IH R", "eə": "EH R", "ʊə": "UH R", "ɜɹ": "ER", "ɜr": "ER", "əɹ": "ER", "ər": "ER",
};
const IPA1: Record<string, string> = {
  "ɝ": "ER", "ɚ": "ER", "ɜ": "ER", "ə": "AH", "ʌ": "AH", "ɐ": "AH", "æ": "AE", "a": "AA", "ɑ": "AA", "ɒ": "AA", "ɔ": "AO",
  "ɛ": "EH", "e": "EH", "ɪ": "IH", "ᵻ": "IH", "ɨ": "IH", "i": "IY", "ʊ": "UH", "u": "UW", "o": "OW",
  "p": "P", "b": "B", "t": "T", "d": "D", "k": "K", "ɡ": "G", "g": "G", "f": "F", "v": "V", "θ": "TH", "ð": "DH",
  "s": "S", "z": "Z", "ʃ": "SH", "ʒ": "ZH", "h": "HH", "m": "M", "n": "N", "ŋ": "NG", "l": "L", "ɫ": "L",
  "ɹ": "R", "r": "R", "ɾ": "T", "j": "Y", "w": "W", "ʔ": "T",
};

/** dictionaryapi IPA 글자 → ARPAbet(강세 숫자). 모르는 기호가 있으면 null. */
export function ipaToArpabet(ipa: string | null | undefined): string[] | null {
  if (!ipa) return null;
  let s = ipa.split(/[,;]/)[0];
  s = s.replace(/\(([ɹr])\)/g, "$1").replace(/\([^)]*\)/g, "");
  s = s.replace(/[\/\[\]\s.ːˑ‿\u0303\u0306]/g, "").replace(/'/g, "ˈ");
  const out: string[] = [];
  let stress = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "ˈ") { stress = 1; i++; continue; }
    if (ch === "ˌ") { stress = 2; i++; continue; }
    if (ch === "\u0329") {
      // 음절 자음(l̩ n̩) → 앞에 약모음
      const c = out.pop();
      out.push("AH0");
      if (c) out.push(c);
      i++;
      continue;
    }
    const two = s.slice(i, i + 2);
    const sym = IPA2[two] ?? IPA1[ch];
    if (!sym) return null;
    i += IPA2[two] ? 2 : 1;
    for (const p of sym.split(" ")) {
      if (VOWELS.has(p)) {
        out.push(`${p}${stress}`);
        stress = 0;
      } else out.push(p);
    }
  }
  if (out.length === 0) return null;
  if (!out.some((p) => /[12]$/.test(p))) {
    const k = out.findIndex((p) => /0$/.test(p));
    if (k >= 0) out[k] = out[k].replace(/0$/, "1");
  }
  return out;
}

const GEMINATE_MERGE = new Set(["P", "B", "T", "D", "K", "G", "S"]);
const isV = (x: Ph | undefined) => !!x && x.s >= 0;
const isC = (x: Ph | undefined) => !!x && x.s < 0;

/** 이어 말하기 규칙(새 배열). 규칙 번호는 SPEC_031 3절. */
export function applyConnectedSpeech(input: Ph[]): Ph[] {
  let ph = input.map((x) => ({ ...x }));
  // 2. t 탈락: 자음 사이 T·D (뒤가 R·W·Y면 남김 — street)
  ph = ph.filter((x, i) => {
    if (x.p !== "T" && x.p !== "D") return true;
    const a = ph[i - 1];
    const b = ph[i + 1];
    return !(isC(a) && isC(b) && !["R", "W", "Y"].includes(b!.p) && !(a!.p === "S" && x.first));
  });
  // 2b. N 뒤 T + 강세 없는 모음(같은 낱말, 또는 약한 기능어 to) → T 빠짐 (winter → 위너, want to → 와너)
  ph = ph.filter((x, i) => {
    const a = ph[i - 1];
    const b = ph[i + 1];
    const sameWord = a?.w === x.w && b?.w === x.w;
    return !(x.p === "T" && a?.p === "N" && isV(b) && b!.s !== 1 && (sameWord || (x.weak && x.first)));
  });
  // 2c. 낱말 경계의 같은 자음 둘 → 하나 (it tastes → 이테이스) — 파열음·S만, 비음·L·R은 둘 다 (nineteen ninety, SPEC_035)
  ph = ph.filter((x, i) => {
    const b = ph[i + 1];
    return !(isC(x) && b && b.p === x.p && b.w !== x.w && GEMINATE_MERGE.has(x.p));
  });
  // 2d. 낱말 끝 T·D + 다음 낱말 Y → CH·JH (did you → 디쥬)
  for (let i = 0; i + 1 < ph.length; i++) {
    const x = ph[i];
    const b = ph[i + 1];
    if ((x.p === "T" || x.p === "D") && b.p === "Y" && b.w !== x.w) x.p = x.p === "T" ? "CH" : "JH";
  }
  for (let i = 0; i < ph.length; i++) {
    const x = ph[i];
    const a = ph[i - 1];
    const b = ph[i + 1];
    // 1. 플랩: 모음(또는 모음 뒤 R) + T·D + 강세 없는 모음(낱말 경계를 넘으면 강세 무관)
    if ((x.p === "T" || x.p === "D") && isV(b)) {
      const afterVowel = isV(a) || (a?.p === "R" && isV(ph[i - 2]));
      const unstressed = b!.s !== 1 || b!.w !== x.w;
      const wordInitialStressed = x.first && b!.s === 1;
      if (afterVowel && unstressed && !wordInitialStressed) x.flap = true;
    }
    // 3. 된소리: S 뒤 P·T·K(같은 낱말)
    if (["P", "T", "K"].includes(x.p) && a?.p === "S" && a.w === x.w) x.tense = true;
    // 3b. 첫소리 아닌 P·K + (L·R 거쳐) 강세 없는 모음, 앞이 모음·울림소리
    if ((x.p === "P" || x.p === "K") && !x.first && !x.tense) {
      const v = isV(b) ? b : ["L", "R"].includes(b?.p ?? "") && isV(ph[i + 2]) ? ph[i + 2] : undefined;
      const sonorantBefore = isV(a) || ["M", "N", "NG", "L", "R"].includes(a?.p ?? "");
      // SPEC_035: 낱말 끝 -ing(IH0 NG) 앞은 된소리 아님 (walking → 워킹)
      const ingNext = !!v && v === b && b!.p === "IH" && ph[i + 2]?.p === "NG" && ph[i + 2].w === x.w && ph[i + 3]?.w !== x.w;
      if (v && v.s === 0 && sonorantBefore && !ingNext) x.tense = true;
    }
    // 0. 낱말 첫 S + 모음 → ㅆ
    if (x.p === "S" && x.first && isV(b)) x.tense = true;
  }
  return ph;
}

// ── 한글 ──────────────────────────────────────────────
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ"];

interface Syl {
  on: string; // 초성 자모(ㅇ = 없음)
  v: string; // 중성
  coda: string; // 종성("" 없음)
  w: number;
}

const ONSET: Record<string, string> = {
  P: "ㅍ", B: "ㅂ", T: "ㅌ", D: "ㄷ", K: "ㅋ", G: "ㄱ", F: "ㅍ", V: "ㅂ", TH: "ㅆ", DH: "ㄷ",
  S: "ㅅ", Z: "ㅈ", SH: "ㅅ", ZH: "ㅈ", CH: "ㅊ", JH: "ㅈ", M: "ㅁ", N: "ㄴ", NG: "ㅇ", L: "ㄹ", R: "ㄹ", HH: "ㅎ",
};
const TENSE: Record<string, string> = { P: "ㅃ", T: "ㄸ", K: "ㄲ", S: "ㅆ" };
const CODA: Record<string, string> = { P: "ㅂ", B: "ㅂ", T: "ㅅ", D: "ㅅ", K: "ㄱ", G: "ㄱ", M: "ㅁ", N: "ㄴ", NG: "ㅇ", L: "ㄹ", R: "ㄹ" };
/** 받침이 되지 못하는 자음 홀로 → 으 음절 */
const ALONE: Record<string, [string, string]> = {
  S: ["ㅅ", "ㅡ"], Z: ["ㅈ", "ㅡ"], F: ["ㅍ", "ㅡ"], V: ["ㅂ", "ㅡ"], TH: ["ㅆ", "ㅡ"], DH: ["ㄷ", "ㅡ"],
  SH: ["ㅅ", "ㅟ"], ZH: ["ㅈ", "ㅣ"], CH: ["ㅊ", "ㅣ"], JH: ["ㅈ", "ㅣ"], HH: ["ㅎ", "ㅡ"],
  P: ["ㅍ", "ㅡ"], B: ["ㅂ", "ㅡ"], T: ["ㅌ", "ㅡ"], D: ["ㄷ", "ㅡ"], K: ["ㅋ", "ㅡ"], G: ["ㄱ", "ㅡ"],
  M: ["ㅁ", "ㅡ"], N: ["ㄴ", "ㅡ"], NG: ["ㅇ", "ㅡ"], L: ["ㅇ", "ㅓ"], R: ["ㄹ", "ㅡ"],
};
/** 모음 → 음절 모음들(첫째가 첫소리를 받음) */
const VOWEL_JAMO: Record<string, string[]> = {
  AA: ["ㅏ"], AE: ["ㅐ"], AH: ["ㅓ"], AO: ["ㅓ"], AW: ["ㅏ", "ㅜ"], AY: ["ㅏ", "ㅣ"], EH: ["ㅔ"], ER: ["ㅓ"],
  EY: ["ㅔ", "ㅣ"], IH: ["ㅣ"], IY: ["ㅣ"], OW: ["ㅗ"], OY: ["ㅗ", "ㅣ"], UH: ["ㅜ"], UW: ["ㅜ"],
};
const Y_GLIDE: Record<string, string> = { "ㅏ": "ㅑ", "ㅐ": "ㅒ", "ㅓ": "ㅕ", "ㅔ": "ㅖ", "ㅗ": "ㅛ", "ㅜ": "ㅠ", "ㅡ": "ㅠ" };
const W_GLIDE: Record<string, string> = { "ㅏ": "ㅘ", "ㅐ": "ㅙ", "ㅓ": "ㅝ", "ㅔ": "ㅞ", "ㅣ": "ㅟ", "ㅗ": "ㅝ" };
/** R 첫소리의 입술 둥글림(뤄·뤠·뤼·롸) */
const R_COLOR: Record<string, string> = { "ㅏ": "ㅘ", "ㅐ": "ㅞ", "ㅓ": "ㅝ", "ㅔ": "ㅞ", "ㅣ": "ㅟ" };
const STOPS = new Set(["P", "B", "T", "D", "K", "G"]);

function onsetJamo(c: Ph): string {
  if (c.flap) return "ㄹ";
  if (c.tense && TENSE[c.p]) return TENSE[c.p];
  return ONSET[c.p] ?? "ㅇ";
}

function compose(s: Syl): string {
  const ci = CHO.indexOf(s.on);
  const vi = JUNG.indexOf(s.v);
  const ji = JONG.indexOf(s.coda);
  if (ci < 0 || vi < 0 || ji < 0) return s.on + s.v + s.coda;
  return String.fromCharCode(0xac00 + (ci * 21 + vi) * 28 + ji);
}

/** 겹받침으로 올리기(ㄹ+ㅁ → ㄻ 등) — 낱말 끝에서만 */
const DOUBLE_CODA: Record<string, string> = { "ㄹㅁ": "ㄻ", "ㄹㄱ": "ㄺ", "ㄹㅂ": "ㄼ" };

export function phonemesToHangul(ph: Ph[]): string {
  const syls: Syl[] = [];
  let onset: { j: string; c: Ph | null; plainR?: boolean } | null = null;
  let glide: "Y" | "W" | null = null;
  const last = () => syls[syls.length - 1];
  const alone = (c: Ph) => {
    const [on, v] = ALONE[c.p] ?? ["ㅇ", "ㅡ"];
    syls.push({ on: c.tense && TENSE[c.p] ? TENSE[c.p] : on, v, coda: c.p === "L" ? "ㄹ" : "", w: c.w });
  };
  const flushOnset = () => {
    if (onset?.c) alone(onset.c);
    onset = null;
  };
  for (let i = 0; i < ph.length; i++) {
    const x = ph[i];
    const next = ph[i + 1];
    if (isV(x)) {
      const seq = [...VOWEL_JAMO[x.p]];
      const on = onset as { j: string; c: Ph | null; plainR?: boolean } | null;
      // 강세 앞 열린 음절의 약모음 + 파열음 첫소리 → ㅡ (banana → 브내너)
      if (x.p === "AH" && x.s === 0 && on?.c && STOPS.has(on.c.p) && !on.c.flap && isC(next) && isV(ph[i + 2]) && ph[i + 2].s === 1 && ph[i + 2].w === x.w) seq[0] = "ㅡ";
      let v0 = seq[0];
      const op = on?.c?.p;
      if (glide === "Y") v0 = Y_GLIDE[v0] ?? v0;
      else if (glide === "W") v0 = W_GLIDE[v0] ?? v0;
      else if (op === "R" && !on?.plainR) v0 = R_COLOR[v0] ?? v0;
      // SPEC_035: SH + 강세 없는 ㅣ → 시(finishing → 퓌니싱). F·V + ㅣ → 퓌·뷔는 유지(사람이 준 블로그 표기 커어퓌·뷔엗나암)
      else if (op === "SH") v0 = v0 === "ㅣ" ? (x.s === 0 ? "ㅣ" : "ㅟ") : Y_GLIDE[v0] ?? v0;
      else if ((op === "F" || op === "V") && v0 === "ㅣ") v0 = "ㅟ";
      else if ((op === "CH" || op === "JH") && (x.p === "AA" || x.p === "AO" || x.p === "AY")) v0 = W_GLIDE[v0] ?? v0;
      seq[0] = v0;
      seq.forEach((v, k) => syls.push({ on: k === 0 ? on?.j ?? "ㅇ" : "ㅇ", v, coda: "", w: x.w }));
      onset = null;
      glide = null;
      if (x.p === "ER") {
        last().coda = "ㄹ";
        if (isV(next)) onset = { j: "ㄹ", c: null, plainR: true };
      }
      continue;
    }
    // 자음
    if ((x.p === "Y" || x.p === "W") && isV(next)) {
      glide = x.p;
      continue;
    }
    if ((x.p === "Y" || x.p === "W") && !isV(next)) continue;
    // T+S / D+Z → 츠·즈 (모음 앞이면 받침 ㅅ + ㅉ)
    if ((x.p === "T" || x.p === "D") && !x.flap && (next?.p === "S" || next?.p === "Z") && next.w === x.w) {
      if (isV(ph[i + 2])) {
        flushOnset();
        const l = last();
        if (l && !l.coda) l.coda = "ㅅ";
        onset = { j: x.p === "T" ? "ㅉ" : "ㅈ", c: null };
      } else {
        flushOnset();
        syls.push({ on: x.p === "T" ? "ㅊ" : "ㅈ", v: "ㅡ", coda: "", w: x.w });
      }
      i++;
      continue;
    }
    // 반모음(Y·W)을 거친 연음은 같은 낱말 안에서만 (and went → 언 웬트), 단 2d의 CH·JH는 이어짐 (did you → 디쥬)
    const prevocalic = isV(next) || ((next?.p === "Y" || next?.p === "W") && isV(ph[i + 2]) && (next.w === x.w || x.p === "CH" || x.p === "JH"));
    if (prevocalic) {
      flushOnset();
      if (x.p === "NG") {
        const l = last();
        if (l && !l.coda) l.coda = "ㅇ";
        onset = { j: "ㅇ", c: null };
        continue;
      }
      // 모음 사이 L → ㄹㄹ
      if (x.p === "L") {
        const l = last();
        if (l && !l.coda && isV(ph[i - 1]) && ph[i - 1].w === x.w) l.coda = "ㄹ";
      }
      onset = { j: onsetJamo(x), c: x };
      continue;
    }
    // 앞에 받침 못 된 첫소리 후보가 남아 있으면 먼저 으 음절로
    flushOnset();
    const l = last();
    // R 뒤 플랩 → R 받침 생략 (quarter → 쿼럴)
    if (x.p === "R" && next?.flap) continue;
    // 파열음 + L·R + 모음 → 끌·프 (exactly → 익재끌리)
    if (STOPS.has(x.p) && (next?.p === "L" || next?.p === "R") && isV(ph[i + 2])) {
      syls.push({ on: onsetJamo(x), v: "ㅡ", coda: next.p === "L" ? "ㄹ" : "", w: x.w });
      continue;
    }
    const coda = CODA[x.p];
    if (coda && l && !l.coda) {
      l.coda = coda;
      continue;
    }
    const wordEnd = !next || next.w !== x.w;
    if (coda && l && wordEnd && DOUBLE_CODA[l.coda + coda]) {
      l.coda = DOUBLE_CODA[l.coda + coda];
      continue;
    }
    alone(x);
  }
  flushOnset();
  let out = "";
  syls.forEach((s, k) => {
    if (k > 0 && s.w !== syls[k - 1].w) out += " ";
    out += compose(s);
  });
  return out;
}

// ── IPA ───────────────────────────────────────────────
const IPA: Record<string, string> = {
  AA: "ɑ", AE: "æ", AO: "ɔ", AW: "aʊ", AY: "aɪ", EH: "ɛ", EY: "eɪ", IH: "ɪ", IY: "i", OW: "oʊ", OY: "ɔɪ", UH: "ʊ", UW: "u",
  B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f", G: "ɡ", HH: "h", JH: "dʒ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ",
  P: "p", R: "ɹ", S: "s", SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};

function symOf(x: Ph): string {
  if (x.flap) return "ɾ";
  if (x.p === "AH") return x.s === 0 ? "ə" : "ʌ";
  if (x.p === "ER") return x.s === 0 ? "ɚ" : "ɝ";
  return IPA[x.p] ?? x.p.toLowerCase();
}

export function phonemesToIpa(ph: Ph[]): string {
  let out = "";
  for (let i = 0; i < ph.length; i++) {
    const x = ph[i];
    if (i > 0 && x.w !== ph[i - 1].w) out += " ";
    const sym = symOf(x);
    if (x.s === 1) {
      // 강세 표시는 음절 첫소리 앞: 자음 하나(+ 이어지는 Y·W·R·L), 낱말 첫 자음군이면 전부
      let k = i;
      const sameC = (j: number) => j >= 0 && isC(ph[j]) && ph[j].w === x.w;
      if (sameC(k - 1)) {
        k--;
        if (["Y", "W", "R", "L"].includes(ph[k].p) && sameC(k - 1)) k--;
        let j = k;
        while (sameC(j - 1)) j--;
        if (j >= 0 && (j === 0 || ph[j - 1].w !== x.w)) k = j;
      }
      const tail = ph.slice(k, i).map(symOf).join("");
      out = out.slice(0, out.length - tail.length) + "ˈ" + tail + sym;
      continue;
    }
    out += sym;
  }
  return out;
}

export function soundHintForWords(words: string[], dict: PronDict): SoundHint | null {
  const ph = wordsToPhonemes(words, dict);
  if (!ph) return null;
  const cs = applyConnectedSpeech(ph);
  const hangul = phonemesToHangul(cs);
  if (!hangul) return null;
  return { hangul, ipa: phonemesToIpa(cs) };
}

export interface HintSegmentLike {
  words: string[];
  analysis?: { chunkWordIndices?: number[]; dictationBlankIndices?: number[]; trapExplanation?: string } | null;
}

const CHUNK_STOP_WORDS = new Set([
  "a", "an", "the", "to", "and", "of", "for", "you", "your", "can", "at", "them", "him", "her", "have", "was", "are",
  "with", "that", "this", "from", "into", "they", "were", "been", "what", "when", "there", "their", "then", "than",
]);

// 앞뒤 문장부호·따옴표('going to') 뺌, 낱말 안 아포스트로피(I'm)는 남김
const normChunkWord = (w: string) => w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

/** AI 설명 속 영어 구를 문장 낱말에서 찾은 번호(연속). 없으면 []. SPEC_032 3절. */
export function explanationChunk(words: string[], explanation: string | null | undefined): number[] {
  if (!explanation) return [];
  const sent = words.map(normChunkWord);
  const runs = (explanation.match(/[A-Za-z']+(?: +[A-Za-z']+)*/g) ?? []).map((r) => r.split(/ +/).map(normChunkWord).filter(Boolean));
  for (const run of runs) {
    let best: number[] = [];
    for (let a = 0; a < run.length; a++) {
      for (let st = 0; st < sent.length; st++) {
        let k = 0;
        while (k < 6 && a + k < run.length && st + k < sent.length && run[a + k] === sent[st + k]) k++;
        if (k >= 2 && k > best.length) best = Array.from({ length: k }, (_, j) => st + j);
      }
    }
    if (best.length > 0) return best;
  }
  for (const run of runs) {
    if (run.length !== 1) continue;
    const w = run[0];
    if (w.length < 4 || CHUNK_STOP_WORDS.has(w)) continue;
    const i = sent.indexOf(w);
    if (i >= 0) return [i];
  }
  return [];
}

/** 힌트를 계산할 낱말 번호(연속, 오름차순). SPEC_031 3절. */
export function pickHintChunk(seg: HintSegmentLike): number[] {
  const n = seg.words.length;
  const range = (a: number, b: number) => {
    const lo = Math.max(0, a);
    const hi = Math.min(n - 1, b);
    return hi >= lo ? Array.from({ length: hi - lo + 1 }, (_, k) => lo + k) : [];
  };
  const valid = (xs: number[] | undefined) => (xs ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < n);
  const chunk = valid(seg.analysis?.chunkWordIndices);
  if (chunk.length > 0) return range(Math.min(...chunk), Math.max(...chunk));
  const fromText = explanationChunk(seg.words, seg.analysis?.trapExplanation);
  if (fromText.length > 0) return fromText;
  if (n <= 8) return range(0, n - 1);
  const blanks = valid(seg.analysis?.dictationBlankIndices);
  if (blanks.length > 0) return range(Math.min(...blanks) - 1, Math.max(...blanks) + 1);
  return range(0, 5);
}

export function soundHintForSegment(seg: HintSegmentLike, dict: PronDict): (SoundHint & { text: string }) | null {
  const idx = pickHintChunk(seg);
  if (idx.length === 0) return null;
  const words = idx.map((i) => seg.words[i]);
  const hint = soundHintForWords(words, dict);
  return hint ? { ...hint, text: words.join(" ") } : null;
}

/** 자모 근접도: 1 − 편집거리/긴 쪽 길이 (SPEC_031 시험용) */
export function hangulSimilarity(a: string, b: string): number {
  const ja = toJamo(a);
  const jb = toJamo(b);
  const m = Math.max(ja.length, jb.length);
  if (m === 0) return 1;
  const d: number[] = Array.from({ length: jb.length + 1 }, (_, k) => k);
  for (let i = 1; i <= ja.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= jb.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (ja[i - 1] === jb[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - d[jb.length] / m;
}

function toJamo(s: string): string[] {
  const out: string[] = [];
  for (const ch of s.replace(/\s+/g, "")) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) {
      out.push(ch);
      continue;
    }
    out.push(CHO[Math.floor(c / 588)], JUNG[Math.floor((c % 588) / 28)]);
    const j = JONG[c % 28];
    if (j) out.push(j);
  }
  return out;
}
