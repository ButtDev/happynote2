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
export function wordsToPhonemes(words: string[], dict: PronDict): Ph[] | null {
  const norm = words.map(normalizeHintWord).filter(Boolean);
  if (norm.length === 0) return null;
  const out: Ph[] = [];
  for (let w = 0; w < norm.length; w++) {
    const word = norm[w];
    const weak = norm.length > 1 ? WEAK_FORMS[word] : undefined;
    const arpa = weak ? weak.split(" ") : dict.get(word);
    if (!arpa || arpa.length === 0) return null;
    arpa.forEach((a, i) => out.push({ ...toPh(a, w, i), ...(weak ? { weak: true } : {}) }));
  }
  return out;
}

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
  // 2c. 낱말 경계의 같은 자음 둘 → 하나 (it tastes → 이테이스)
  ph = ph.filter((x, i) => {
    const b = ph[i + 1];
    return !(isC(x) && b && b.p === x.p && b.w !== x.w);
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
      if (v && v.s === 0 && sonorantBefore) x.tense = true;
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
      if (x.p === "AH" && x.s === 0 && on?.c && STOPS.has(on.c.p) && isC(next) && isV(ph[i + 2]) && ph[i + 2].s === 1 && ph[i + 2].w === x.w) seq[0] = "ㅡ";
      let v0 = seq[0];
      const op = on?.c?.p;
      if (glide === "Y") v0 = Y_GLIDE[v0] ?? v0;
      else if (glide === "W") v0 = W_GLIDE[v0] ?? v0;
      else if (op === "R" && !on?.plainR) v0 = R_COLOR[v0] ?? v0;
      else if (op === "SH") v0 = v0 === "ㅣ" ? "ㅟ" : Y_GLIDE[v0] ?? v0;
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
    if ((x.p === "T" || x.p === "D") && !x.flap && (next?.p === "S" || next?.p === "Z")) {
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
  analysis?: { chunkWordIndices?: number[]; dictationBlankIndices?: number[] } | null;
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
