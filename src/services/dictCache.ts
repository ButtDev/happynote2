/**
 * SPEC_047: 사전 결과 캐시 — 한 번 찾은 낱말은 파일(`<플러그인 폴더>/dict-cache.json`)에서 바로.
 * obsidian import 없음 — 파일·시계·낱말 정리 함수를 주입받는다(시험은 메모리 파일·가짜 시계로).
 * 결과 있음은 기한 없이, 없음(404 → null)은 DICT_MISS_TTL_DAYS 동안만 기억한다.
 * 네트워크 실패(던짐)는 기억하지 않는다 — 다음에 다시 시도.
 */
import type { DictionaryEntry, DictionaryProvider } from "./dictionary";

export const DICT_CACHE_SCHEMA_VERSION = 1;
export const DICT_CACHE_MAX = 1000;
export const DICT_MISS_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DictCacheRecord {
  entry: DictionaryEntry | null;
  /** 받은 시각(ISO) — 없음 기한 계산용 */
  at: string;
  /** 마지막으로 쓴 시각(ISO) — 넘칠 때 가장 오래 안 쓴 것부터 버림 */
  used: string;
}

export interface DictCacheFile {
  /** 파일이 없으면 null */
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

export interface DictCacheOptions {
  /** 누른 글자 → 키(빈 문자열이면 찾지 않음). 보통 normalizeLookupWord */
  normalize: (word: string) => string;
  now?: () => number;
  onWriteError?: (err: unknown) => void;
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const okRecord = (r: any) =>
  isObj(r) && typeof r.at === "string" && typeof r.used === "string" && (r.entry === null || (isObj(r.entry) && typeof r.entry.word === "string" && Array.isArray(r.entry.meanings)));

/** 파일 글 → 항목. 없음·깨짐 → 빈 캐시. 항목 하나가 깨졌으면 그것만 버린다. readOnly: 더 새 판이 쓴 파일. */
export function parseDictCache(text: string | null): { entries: Record<string, DictCacheRecord>; readOnly: boolean } {
  const empty = { entries: {}, readOnly: false };
  if (text == null) return empty;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return empty;
  }
  if (!isObj(raw) || typeof raw.schemaVersion !== "number" || !isObj(raw.entries)) return empty;
  const entries: Record<string, DictCacheRecord> = {};
  for (const [k, r] of Object.entries(raw.entries)) if (k && okRecord(r)) entries[k] = r as DictCacheRecord;
  return { entries, readOnly: raw.schemaVersion > DICT_CACHE_SCHEMA_VERSION };
}

export class CachedDictionaryProvider implements DictionaryProvider {
  public readonly name: string;
  private inner: DictionaryProvider;
  private file: DictCacheFile;
  private normalize: (word: string) => string;
  private now: () => number;
  private onWriteError: (err: unknown) => void;
  private entries: Record<string, DictCacheRecord> = {};
  private readOnly = false;
  private loading: Promise<void> | null = null;
  private writing: Promise<void> = Promise.resolve();
  /** 줄 서 있지만 아직 시작 안 한 쓰기 — 여러 번 찾아도 한 번으로 묶는다 */
  private queued: Promise<void> | null = null;

  constructor(inner: DictionaryProvider, file: DictCacheFile, opts: DictCacheOptions) {
    this.inner = inner;
    this.name = inner.name;
    this.file = file;
    this.normalize = opts.normalize;
    this.now = opts.now ?? (() => Date.now());
    this.onWriteError = opts.onWriteError ?? (() => {});
  }

  public async lookup(word: string): Promise<DictionaryEntry | null> {
    const key = this.normalize(word);
    if (!key) return null;
    await this.load();
    const now = this.now();
    const hit = this.entries[key];
    if (hit && (hit.entry !== null || now - Date.parse(hit.at) < DICT_MISS_TTL_DAYS * DAY_MS)) {
      hit.used = new Date(now).toISOString();
      void this.save();
      return hit.entry;
    }
    const entry = await this.inner.lookup(key); // 던지면 기억하지 않음
    const iso = new Date(this.now()).toISOString();
    this.entries[key] = { entry, at: iso, used: iso };
    this.evict();
    void this.save();
    return entry;
  }

  /** 시험·종료용: 지금까지 줄 선 쓰기가 끝날 때까지 */
  public flush(): Promise<void> {
    return this.writing;
  }

  public size(): number {
    return Object.keys(this.entries).length;
  }

  private load(): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        let text: string | null = null;
        try {
          text = await this.file.read();
        } catch {
          text = null;
        }
        const r = parseDictCache(text);
        this.entries = r.entries;
        this.readOnly = r.readOnly;
      })();
    }
    return this.loading;
  }

  private evict(): void {
    const keys = Object.keys(this.entries);
    let extra = keys.length - DICT_CACHE_MAX;
    if (extra <= 0) return;
    keys.sort((a, b) => this.entries[a].used.localeCompare(this.entries[b].used));
    for (const k of keys) {
      if (extra-- <= 0) break;
      delete this.entries[k];
    }
  }

  private save(): Promise<void> {
    if (this.readOnly) return this.writing;
    if (this.queued) return this.queued;
    const p = this.writing.then(async () => {
      this.queued = null;
      try {
        await this.file.write(JSON.stringify({ schemaVersion: DICT_CACHE_SCHEMA_VERSION, entries: this.entries }));
      } catch (err) {
        this.onWriteError(err);
      }
    });
    this.queued = p;
    this.writing = p;
    return p;
  }
}
