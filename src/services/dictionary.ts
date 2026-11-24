/**
 * SPEC_013: 사전 조회 — 교체 가능한 제공자 + dictionaryapi.dev 응답 파싱.
 * 이 파일은 obsidian을 import하지 않는다(네트워크는 주입받은 fetcher로) — Node 시험에서 바로 돈다.
 */

export interface DictionaryDefinition {
  definition: string;
  example: string | null;
}

export interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: DictionaryDefinition[];
}

export interface DictionaryEntry {
  word: string;
  phonetic: string | null;
  /** SPEC_035: 미국 발음 IPA(`-us` 오디오 짝 → `oʊ` 든 글자 → phonetic) */
  ipaUs?: string | null;
  audioUrl: string | null;
  meanings: DictionaryMeaning[];
  sourceUrl: string | null;
}

export interface DictionaryProvider {
  name: string;
  /** 없는 단어면 null. 네트워크 오류는 throw. */
  lookup(word: string): Promise<DictionaryEntry | null>;
}

/** SPEC_025: 품사는 자르지 않는다(back의 adverb처럼 뒤 품사에 문맥 뜻이 있음) — 뜻 상한만 둔다. */
export const MAX_DEFINITIONS_PER_PART = 3;

/** 자막에서 누른 글자를 사전 조회용 단어로 정리한다. 조회할 수 없으면 "". */
export function normalizeLookupWord(raw: string): string {
  let w = (raw ?? "").replace(/[‘’ʼ]/g, "'").trim().toLowerCase();
  w = w.replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
  w = w.replace(/^'+|'+$/g, "");
  w = w.replace(/'s$/, "");
  if (!w || /^[0-9]+$/.test(w)) return "";
  return w;
}

export function dictionaryApiDevUrl(word: string): string {
  return `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
}

type Json = any;

/** dictionaryapi.dev 응답(JSON 배열)을 DictionaryEntry로. 배열이 아니거나 뜻이 없으면 null. */
export function parseDictionaryApiDev(json: Json): DictionaryEntry | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const word = String(json[0]?.word ?? "").trim();
  if (!word) return null;

  let phonetic: string | null = null;
  let sourceUrl: string | null = null;
  const byPos = new Map<string, DictionaryDefinition[]>();
  const trivial = new Set([word.toLowerCase(), `to ${word.toLowerCase()}`]);

  for (const e of json) {
    if (!phonetic && typeof e?.phonetic === "string" && e.phonetic.trim()) phonetic = e.phonetic.trim();
    for (const p of Array.isArray(e?.phonetics) ? e.phonetics : []) {
      if (!phonetic && typeof p?.text === "string" && p.text.trim()) phonetic = p.text.trim();
    }
    if (!sourceUrl && Array.isArray(e?.sourceUrls) && typeof e.sourceUrls[0] === "string") sourceUrl = e.sourceUrls[0];
    for (const m of Array.isArray(e?.meanings) ? e.meanings : []) {
      const pos = String(m?.partOfSpeech ?? "").trim();
      if (!pos) continue;
      if (!byPos.has(pos)) byPos.set(pos, []);
      const list = byPos.get(pos)!;
      for (const d of Array.isArray(m?.definitions) ? m.definitions : []) {
        const def = String(d?.definition ?? "").trim();
        if (!def) continue;
        if (trivial.has(def.toLowerCase().replace(/[.!?\s]+$/, ""))) continue;
        list.push({ definition: def, example: typeof d?.example === "string" && d.example.trim() ? d.example.trim() : null });
      }
    }
  }

  const meanings: DictionaryMeaning[] = [];
  for (const [partOfSpeech, defs] of byPos) {
    if (defs.length === 0) continue;
    meanings.push({ partOfSpeech, definitions: defs.slice(0, MAX_DEFINITIONS_PER_PART) });
  }
  if (meanings.length === 0) return null;

  const { audioUrl } = pickPronunciation(json);
  return { word, phonetic, ipaUs: pickUsIpa(json) ?? phonetic, audioUrl, meanings, sourceUrl };
}

/** SPEC_035: 미국 발음 IPA 글자 — `-us.mp3` 짝 → `oʊ` 든 글자 → 첫 글자 */
export function pickUsIpa(json: Json): string | null {
  if (!Array.isArray(json)) return null;
  const texts: { text: string; audio: string }[] = [];
  for (const e of json) {
    if (typeof e?.phonetic === "string" && e.phonetic.trim()) texts.push({ text: e.phonetic.trim(), audio: "" });
    for (const p of Array.isArray(e?.phonetics) ? e.phonetics : []) {
      if (typeof p?.text === "string" && p.text.trim()) texts.push({ text: p.text.trim(), audio: typeof p?.audio === "string" ? p.audio : "" });
    }
  }
  return (texts.find((t) => /-us\.mp3$/i.test(t.audio)) ?? texts.find((t) => t.text.includes("oʊ")) ?? texts[0])?.text ?? null;
}

/**
 * 발음 하나 고르기(-us 우선, 없으면 첫 것). dictionaryapi.dev의 mp3 주소는 404가 많아(2026-11 확인)
 * 같은 녹음의 Wikimedia Commons 페이지 번호(sourceUrl `curid=`)도 돌려준다.
 */
export function pickPronunciation(json: Json): { audioUrl: string | null; commonsPageId: number | null } {
  const list: { audio: string; pageId: number | null }[] = [];
  for (const e of Array.isArray(json) ? json : []) {
    for (const p of Array.isArray(e?.phonetics) ? e.phonetics : []) {
      if (typeof p?.audio !== "string" || !p.audio.trim()) continue;
      const m = typeof p?.sourceUrl === "string" ? /[?&]curid=(\d+)/.exec(p.sourceUrl) : null;
      list.push({ audio: p.audio.trim(), pageId: m ? Number(m[1]) : null });
    }
  }
  const best = list.find((a) => /-us\.mp3$/.test(a.audio)) ?? list[0];
  return { audioUrl: best?.audio ?? null, commonsPageId: best?.pageId ?? null };
}

export function commonsAudioInfoUrl(pageId: number): string {
  return `https://commons.wikimedia.org/w/api.php?action=query&pageids=${pageId}&prop=imageinfo&iiprop=url&format=json&formatversion=2&origin=*`;
}

/** Commons imageinfo 응답 → upload.wikimedia.org 파일 주소(추적 쿼리 제거). 없으면 null. */
export function parseCommonsAudioUrl(json: Json): string | null {
  const url = json?.query?.pages?.[0]?.imageinfo?.[0]?.url;
  if (typeof url !== "string" || !/^https:\/\/upload\.wikimedia\.org\//.test(url)) return null;
  return url.replace(/\?.*$/, "");
}

/** fetcher: url → { status, json }. 모바일에선 Obsidian requestUrl로 만든다. */
export type JsonFetcher = (url: string) => Promise<{ status: number; json: Json }>;

export class DictionaryApiDevProvider implements DictionaryProvider {
  public readonly name = "dictionaryapi.dev";
  private cache = new Map<string, DictionaryEntry | null>();
  private fetcher: JsonFetcher;

  constructor(fetcher: JsonFetcher) {
    this.fetcher = fetcher;
  }

  public async lookup(word: string): Promise<DictionaryEntry | null> {
    const key = normalizeLookupWord(word);
    if (!key) return null;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const res = await this.fetcher(dictionaryApiDevUrl(key));
    if (res.status === 404) {
      this.cache.set(key, null);
      return null;
    }
    // status를 붙여 둬야 failureCause가 429·503을 「서버가 잠깐 바빠요」로 읽는다(원문은 진단 기록에만)
    if (res.status < 200 || res.status >= 300) throw Object.assign(new Error(`dictionaryapi.dev HTTP ${res.status}`), { status: res.status });
    const entry = parseDictionaryApiDev(res.json);
    if (entry?.audioUrl) {
      // 죽은 mp3 대신 같은 녹음의 Commons 원본(ogg)으로. 실패하면 원래 주소 유지.
      const { commonsPageId } = pickPronunciation(res.json);
      if (commonsPageId) {
        try {
          const c = await this.fetcher(commonsAudioInfoUrl(commonsPageId));
          const url = c.status >= 200 && c.status < 300 ? parseCommonsAudioUrl(c.json) : null;
          if (url) entry.audioUrl = url;
        } catch {
          /* 원래 주소 유지 */
        }
      }
    }
    this.cache.set(key, entry);
    return entry;
  }
}

// ---------------------------------------------------------------------------
// SPEC_014: 구동사 — 누른 낱말 + 뒤 1~2낱말을 원형으로 바꾼 구 후보
// ---------------------------------------------------------------------------

export const MAX_LEMMA_VARIANTS = 3;
export const MAX_PHRASE_CANDIDATES = 6;

const IRREGULAR_LEMMAS: Record<string, string> = {
  went: "go", gone: "go", goes: "go",
  got: "get", gotten: "get",
  took: "take", taken: "take",
  came: "come",
  gave: "give", given: "give",
  made: "make",
  ran: "run",
  brought: "bring",
  thought: "think",
  found: "find",
  told: "tell",
  said: "say",
  saw: "see", seen: "see",
  kept: "keep",
  left: "leave",
  held: "hold",
  stood: "stand",
  broke: "break", broken: "break",
  fell: "fall",
  felt: "feel",
  met: "meet",
  paid: "pay",
  sat: "sit",
  spoke: "speak",
  threw: "throw", thrown: "throw",
  wore: "wear",
  woke: "wake",
  ate: "eat", eaten: "eat",
  did: "do", done: "do", does: "do",
  had: "have", has: "have",
  was: "be", were: "be",
};

function undouble(stem: string): string | null {
  const n = stem.length;
  return n >= 2 && stem[n - 1] === stem[n - 2] && /[b-df-hj-np-tv-z]/.test(stem[n - 1]) ? stem.slice(0, -1) : null;
}

/** 낱말과 원형 후보(첫째는 정리된 낱말 그대로). 중복 없이 최대 3개. */
export function lemmaVariants(word: string): string[] {
  const w = normalizeLookupWord(word);
  if (!w) return [];
  const out: string[] = [w];
  const add = (s: string | null) => {
    if (s && s.length >= 2 && !out.includes(s)) out.push(s);
  };
  if (IRREGULAR_LEMMAS[w]) {
    add(IRREGULAR_LEMMAS[w]);
  } else if (/ing$/.test(w) && w.length - 3 >= 2) {
    const stem = w.slice(0, -3);
    add(stem);
    add(undouble(stem));
    add(stem + "e");
  } else if (/ied$/.test(w) && w.length > 4) {
    add(w.slice(0, -3) + "y");
  } else if (/ed$/.test(w) && w.length - 2 >= 2) {
    const stem = w.slice(0, -2);
    add(stem);
    add(undouble(stem));
    add(w.slice(0, -1));
  } else if (/ies$/.test(w) && w.length > 4) {
    add(w.slice(0, -3) + "y");
  } else if (/(s|x|z|ch|sh)es$/.test(w)) {
    add(w.slice(0, -2));
  } else if (/s$/.test(w) && !/ss$/.test(w) && w.length >= 4) {
    add(w.slice(0, -1));
  }
  return out.slice(0, MAX_LEMMA_VARIANTS);
}

const PHRASE_BREAK = /[.,!?;:]["'”’)\]]*$/;

/** 구 후보: 3낱말 먼저, 그다음 2낱말. 첫 낱말은 원형 후보 순서. 중복 없이 최대 6개. */
export function phraseCandidates(tapped: string, following: string[]): string[] {
  if (PHRASE_BREAK.test((tapped ?? "").trim())) return [];
  const heads = lemmaVariants(tapped);
  if (heads.length === 0) return [];
  const tail: string[] = [];
  for (const raw of (following ?? []).slice(0, 2)) {
    const n = normalizeLookupWord(raw);
    if (!n) break;
    tail.push(n);
    if (PHRASE_BREAK.test(raw.trim())) break;
  }
  const out: string[] = [];
  for (let len = tail.length; len >= 1; len--) {
    const rest = tail.slice(0, len).join(" ");
    for (const h of heads) {
      const p = `${h} ${rest}`;
      if (!out.includes(p)) out.push(p);
    }
  }
  return out.slice(0, MAX_PHRASE_CANDIDATES);
}

// ---------------------------------------------------------------------------
// SPEC_019: 누른 낱말 앞 1~2낱말에서 시작하는 구도 후보로 (forward → look forward to)
// ---------------------------------------------------------------------------

export const MAX_PHRASE_CANDIDATES_AROUND = 12;

/** 구 후보: 누른 낱말을 포함하는 3낱말·2낱말 창. 각 창의 첫 낱말만 원형 후보. 중복 없이 최대 12개. */
export function phraseCandidatesAround(tapped: string, preceding: string[], following: string[]): string[] {
  const tappedRaw = (tapped ?? "").trim();
  const t = normalizeLookupWord(tappedRaw);
  if (!t) return [];
  const tappedBreaks = PHRASE_BREAK.test(tappedRaw);
  const tail: string[] = [];
  if (!tappedBreaks) {
    for (const raw of (following ?? []).slice(0, 2)) {
      const n = normalizeLookupWord(raw);
      if (!n) break;
      tail.push(n);
      if (PHRASE_BREAK.test(raw.trim())) break;
    }
  }
  // 앞 낱말: 누른 낱말에 가까운 쪽부터(p1, p2). 문장부호로 끝나는 낱말에서 멈춤.
  const before: string[] = [];
  for (const raw of (preceding ?? []).slice(-2).reverse()) {
    if (PHRASE_BREAK.test(raw.trim())) break;
    const n = normalizeLookupWord(raw);
    if (!n) break;
    before.push(n);
  }
  const [p1, p2] = before;
  const windows: string[][] = [];
  if (tail.length >= 2) windows.push([t, tail[0], tail[1]]);
  if (p1 && tail.length >= 1) windows.push([p1, t, tail[0]]);
  if (p1 && p2) windows.push([p2, p1, t]);
  if (tail.length >= 1) windows.push([t, tail[0]]);
  if (p1) windows.push([p1, t]);
  if (p1 && p2) windows.push([p2, t]);

  const out: string[] = [];
  for (const [head, ...rest] of windows) {
    const heads = head === t ? lemmaVariants(tappedRaw) : lemmaVariants(head);
    for (const h of heads) {
      const p = [h, ...rest].join(" ");
      if (!out.includes(p)) out.push(p);
    }
  }
  return out.slice(0, MAX_PHRASE_CANDIDATES_AROUND);
}
