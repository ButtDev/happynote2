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
  audioUrl: string | null;
  meanings: DictionaryMeaning[];
  sourceUrl: string | null;
}

export interface DictionaryProvider {
  name: string;
  /** 없는 단어면 null. 네트워크 오류는 throw. */
  lookup(word: string): Promise<DictionaryEntry | null>;
}

export const MAX_PARTS_OF_SPEECH = 3;
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
    if (meanings.length >= MAX_PARTS_OF_SPEECH) break;
  }
  if (meanings.length === 0) return null;

  const { audioUrl } = pickPronunciation(json);
  return { word, phonetic, audioUrl, meanings, sourceUrl };
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
    if (res.status < 200 || res.status >= 300) throw new Error(`dictionaryapi.dev HTTP ${res.status}`);
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
