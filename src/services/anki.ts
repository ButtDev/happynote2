import { trapLabelList } from "../utils/trapLabels.ts";

/**
 * SPEC_015: 사전 창 → AnkiDroid 카드 저장 (AnkiConnect Android, http://127.0.0.1:8765).
 * 이 파일은 obsidian을 import하지 않는다(요청 함수는 주입) — Node 시험에서 바로 돈다.
 */

export type AnkiRole = "word" | "ipa" | "audio" | "meaning" | "sentence" | "picture" | "source";

/** 앞면(문장 쪽)·뒷면(단어 쪽) 역할. 한 필드에 여러 역할이 오면 이 순서대로 잇는다. */
export const ANKI_FRONT_ROLES: AnkiRole[] = ["sentence", "picture", "meaning"];
export const ANKI_BACK_ROLES: AnkiRole[] = ["word", "ipa", "audio", "source"];
export const ANKI_ROLES: AnkiRole[] = [...ANKI_FRONT_ROLES, ...ANKI_BACK_ROLES];

export const ANKI_MESSAGES = {
  button: "➕ Anki",
  saving: "Anki에 저장 중…",
  added: "Anki에 저장했습니다",
  addedNoPicture: "Anki에 저장했습니다 (그림 없음)",
  duplicate: "이미 Anki에 있는 카드입니다",
  connection: "AnkiConnect Android에 연결하지 못했습니다 — 앱에서 서비스를 켜 주세요",
  noSettings: "설정에서 Anki 덱·노트 타입을 골라 주세요",
} as const;

export interface AnkiSettingsLike {
  ankiDeck: string;
  ankiNoteType: string;
  ankiFieldMap: Partial<Record<AnkiRole, string>>;
  ankiTags: string;
}

export interface AnkiNoteInput {
  /** 카드의 단어(또는 구) — 사전 표제어 */
  word: string;
  phonetic: string | null;
  audioUrl: string | null;
  /** 품사별 첫 뜻 */
  meanings: { partOfSpeech: string; definition: string }[];
  /** 자막 문장 */
  sentence: string;
  /** 사람이 누른 글자(구가 문장에 원형으로 없을 때 빈칸 시작점) */
  tapped?: string;
  videoId?: string | null;
  videoTitle?: string | null;
  startSec?: number | null;
  /** SPEC_017: storeMediaFile로 넣은 장면 그림 파일 이름(없으면 그림 없음) */
  pictureFilename?: string | null;
}

export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  options: { allowDuplicate: boolean; duplicateScope: "deck" };
  audio?: AnkiMedia[];
}

/** addNote audio — url(앱이 내려받음) 또는 data(base64, 우리가 받아 넣음) */
export interface AnkiMedia {
  url?: string;
  data?: string;
  filename: string;
  fields: string[];
}

/** 주소의 바이트를 받는다(실패는 throw). */
export type FetchBytes = (url: string) => Promise<ArrayBuffer>;

export function bytesToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/**
 * SPEC_015 회차 2: AnkiConnect Android는 upload.wikimedia.org 주소를 못 받는다(FileNotFoundException).
 * 발음 url을 우리가 받아 data(base64)로 바꾼다. 받지 못하거나 비어 있으면 발음 없이(audio 뺌).
 */
export async function inlineAudio(note: AnkiNote, fetchBytes: FetchBytes): Promise<AnkiNote> {
  if (!note.audio || note.audio.length === 0) return note;
  const out: AnkiMedia[] = [];
  for (const a of note.audio) {
    if (a.data || !a.url) {
      out.push(a);
      continue;
    }
    try {
      const buf = await fetchBytes(a.url);
      if (buf && buf.byteLength > 0) out.push({ data: bytesToBase64(buf), filename: a.filename, fields: a.fields });
    } catch {
      // 발음 없이 저장
    }
  }
  const next: AnkiNote = { ...note };
  if (out.length > 0) next.audio = out;
  else delete next.audio;
  return next;
}

export const CLOZE_BLANK = "____";
const WORD_CHARS = "A-Za-z0-9'’";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wordsOf(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

/**
 * 문장에서 target(낱말·구)을 빈칸으로. 대소문자 무시, 낱말 경계, 모든 출현.
 * target이 문장에 없고 tapped가 있으면 tapped부터 target 낱말 수만큼을 빈칸으로(looking forward to ← look forward to).
 * 둘 다 없으면 문장 그대로.
 */
export function clozeSentence(sentence: string, target: string, tapped?: string): string {
  const words = wordsOf(target ?? "");
  if (!sentence || words.length === 0) return sentence ?? "";
  const pat = words.map(escapeRegExp).join("\\s+");
  const exact = new RegExp(`(?<![${WORD_CHARS}])${pat}(?![${WORD_CHARS}])`, "gi");
  if (exact.test(sentence)) return sentence.replace(exact, CLOZE_BLANK);

  const tap = (tapped ?? "").replace(/^[^A-Za-z0-9'’]+|[^A-Za-z0-9'’]+$/g, "");
  if (!tap) return sentence;
  const rest = `(?:\\s+[${WORD_CHARS}]+){${words.length - 1}}`;
  const fromTap = new RegExp(`(?<![${WORD_CHARS}])${escapeRegExp(tap)}${rest}(?![${WORD_CHARS}])`, "i");
  return fromTap.test(sentence) ? sentence.replace(fromTap, CLOZE_BLANK) : sentence;
}

export function formatMmSs(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function audioFilename(word: string, url: string): string {
  const ext = (url.split("?")[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? "mp3").toLowerCase();
  const slug = word.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "word";
  return `ear-coach-${slug}.${ext}`;
}

/** SPEC_017: 장면 그림 파일 이름 */
export function snapshotFilename(videoId: string, sec: number): string {
  const id = String(videoId ?? "").replace(/[^A-Za-z0-9_-]/g, "-") || "video";
  return `ear-coach-${id}-${Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0))}.jpg`;
}

/**
 * SPEC_017: 장면 그림을 Anki 미디어에 넣고 실제 이름을 돌려준다.
 * 데이터가 없으면 호출 없이 null, storeMediaFile 오류면 null(그림 없이 저장).
 */
export async function storeSnapshot(
  client: AnkiInvoker,
  getData: () => Promise<string | null>,
  filename: string
): Promise<string | null> {
  let data: string | null = null;
  try {
    data = await getData();
  } catch {
    data = null;
  }
  if (!data) return null;
  try {
    const r = await client.invoke("storeMediaFile", { filename, data });
    return typeof r === "string" && r ? r : filename;
  } catch {
    return null;
  }
}

/** SPEC_025: 카드에 쓸 뜻 하나 — 고른 뜻(품사·뜻 번호), 없거나 범위 밖이면 첫 품사의 첫 뜻. 뜻이 없으면 빈 배열. */
export function pickCardMeaning(
  entry: { meanings: { partOfSpeech: string; definitions: { definition: string }[] }[] },
  chosen: { pos: number; def: number } | null
): { partOfSpeech: string; definition: string }[] {
  const at = (p: number, d: number) => {
    const m = entry.meanings[p];
    const def = m?.definitions[d]?.definition;
    return m && def ? [{ partOfSpeech: m.partOfSpeech, definition: def }] : null;
  };
  if (chosen) {
    const got = at(chosen.pos, chosen.def);
    if (got) return got;
  }
  for (let p = 0; p < entry.meanings.length; p++) {
    const got = at(p, 0);
    if (got) return got;
  }
  return [];
}

/** 역할별 HTML 값(audio는 빈 값 — AnkiConnect가 [sound:]를 붙인다, picture는 SPEC_017 <img>). */
export function ankiRoleValues(input: AnkiNoteInput): Record<AnkiRole, string> {
  const meaning = input.meanings
    .map((m) => `<i>${escapeHtml(m.partOfSpeech)}</i> ${escapeHtml(m.definition)}`)
    .join("<br>");
  let source = "";
  if (input.videoId) {
    const t = Math.max(0, Math.floor(input.startSec ?? 0));
    source = `<a href="https://youtu.be/${encodeURIComponent(input.videoId)}?t=${t}">${escapeHtml(input.videoTitle ?? "")} ${formatMmSs(t)}</a>`;
  }
  return {
    word: escapeHtml(input.word),
    ipa: escapeHtml(input.phonetic ?? ""),
    audio: "",
    meaning,
    sentence: escapeHtml(clozeSentence(input.sentence ?? "", input.word, input.tapped)),
    picture: input.pictureFilename ? `<img src="${escapeHtml(input.pictureFilename)}">` : "",
    source,
  };
}

/** addNote용 노트(순수). 대응이 빈 역할은 넣지 않는다. 같은 필드의 역할은 ANKI_ROLES 순서로 <br>. */
export function buildAnkiNote(input: AnkiNoteInput, settings: AnkiSettingsLike): AnkiNote {
  const values = ankiRoleValues(input);
  const fields: Record<string, string> = {};
  for (const role of ANKI_ROLES) {
    const name = (settings.ankiFieldMap?.[role] ?? "").trim();
    if (!name) continue;
    const v = values[role];
    if (!(name in fields)) fields[name] = "";
    if (v) fields[name] = fields[name] ? `${fields[name]}<br>${v}` : v;
  }
  const note: AnkiNote = {
    deckName: settings.ankiDeck,
    modelName: settings.ankiNoteType,
    fields,
    tags: (settings.ankiTags ?? "").split(/\s+/).filter(Boolean),
    options: { allowDuplicate: false, duplicateScope: "deck" },
  };
  const audioField = (settings.ankiFieldMap?.audio ?? "").trim();
  if (input.audioUrl && audioField) {
    note.audio = [{ url: input.audioUrl, filename: audioFilename(input.word, input.audioUrl), fields: [audioField] }];
  }
  return note;
}

/**
 * 고른 노트 타입의 필드 이름에 맞춰 대응을 고친다.
 * 대응 이름이 모두 필드에 있으면 그대로. 필드가 1~2개면 앞=첫 필드, 뒤=마지막 필드.
 * 3개 이상이면 없는 이름만 역할 이름과 같은 필드(대소문자 무시)로, 그것도 없으면 비운다.
 */
export function remapFieldsForModel(
  fieldNames: string[],
  map: Partial<Record<AnkiRole, string>>
): Record<AnkiRole, string> {
  const out = {} as Record<AnkiRole, string>;
  const has = new Set(fieldNames);
  const used = ANKI_ROLES.map((r) => (map[r] ?? "").trim()).filter(Boolean);
  if (fieldNames.length > 0 && used.length > 0 && used.every((n) => has.has(n))) {
    for (const r of ANKI_ROLES) out[r] = (map[r] ?? "").trim();
    return out;
  }
  if (fieldNames.length === 0) {
    for (const r of ANKI_ROLES) out[r] = "";
    return out;
  }
  if (fieldNames.length <= 2) {
    for (const r of ANKI_FRONT_ROLES) out[r] = fieldNames[0];
    for (const r of ANKI_BACK_ROLES) out[r] = fieldNames[fieldNames.length - 1];
    return out;
  }
  for (const r of ANKI_ROLES) {
    const cur = (map[r] ?? "").trim();
    out[r] = has.has(cur) ? cur : fieldNames.find((f) => f.toLowerCase() === r) ?? "";
  }
  return out;
}

export type AnkiErrorKind = "connection" | "api";

export class AnkiConnectError extends Error {
  public readonly kind: AnkiErrorKind;
  constructor(kind: AnkiErrorKind, message: string) {
    super(message);
    this.name = "AnkiConnectError";
    this.kind = kind;
  }
}

/** POST 본문(JSON 글)을 보내고 상태·JSON을 돌려준다. 네트워크 실패는 throw. */
export type AnkiRequest = (body: string) => Promise<{ status: number; json: unknown }>;

export const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
export const ANKI_CONNECT_VERSION = 6;

export interface AnkiInvoker {
  invoke(action: string, params?: Record<string, unknown>): Promise<any>;
}

export class AnkiConnectClient implements AnkiInvoker {
  private readonly request: AnkiRequest;
  constructor(request: AnkiRequest) {
    this.request = request;
  }

  async invoke(action: string, params: Record<string, unknown> = {}): Promise<any> {
    let res: { status: number; json: unknown };
    try {
      res = await this.request(JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }));
    } catch (e) {
      throw new AnkiConnectError("connection", e instanceof Error ? e.message : String(e));
    }
    if (!res || !res.status || res.status >= 500 || res.status === 404) {
      throw new AnkiConnectError("connection", `HTTP ${res?.status ?? "?"}`);
    }
    const j = res.json as { result?: unknown; error?: unknown } | null;
    if (!j || typeof j !== "object" || !("result" in j) || !("error" in j)) {
      throw new AnkiConnectError("api", `unexpected response for ${action}`);
    }
    if (j.error !== null && j.error !== undefined) throw new AnkiConnectError("api", String(j.error));
    return j.result;
  }
}

/** SPEC_016: 기본 덱(사람 결정). AnkiConnect Android는 덱을 만들 수 없어 AnkiDroid에서 한 번 만든다. */
export const ANKI_DEFAULT_DECK = "happynote2";

/** SPEC_016: 저장된 덱 이름 옮기기 — 이전 기본값 "Default"·빈 값 → happynote2, 그 밖은 그대로. */
export function migrateAnkiDeck(saved: string | undefined | null): string {
  const d = (saved ?? "").trim();
  return !d || d === "Default" ? ANKI_DEFAULT_DECK : d;
}

/** 덱·노트 타입이 없을 때 문구 (SPEC_015 회차 3, 덱 문구는 SPEC_016) */
export function ankiMissingMessage(kind: "deck" | "model", name: string): string {
  if (kind === "deck") return `Anki에 「${name}」 덱이 없습니다 — AnkiDroid에서 「${name}」 덱을 만들거나 설정에서 「덱·노트 타입 불러오기」로 골라 주세요`;
  return `Anki에 「${name}」 노트 타입이 없습니다 — 설정에서 「덱·노트 타입 불러오기」로 골라 주세요`;
}

export type AnkiTarget = { ok: true; settings: AnkiSettingsLike } | { ok: false; message: string };

/**
 * SPEC_015 회차 3: 저장 전에 덱·노트 타입이 AnkiDroid에 있는지 보고(없으면 addNote가 「Couldn't get deck ID」),
 * 노트 타입의 실제 필드 이름으로 대응을 맞춘 설정을 돌려준다(설정 자체는 바꾸지 않음).
 */
export async function resolveAnkiTarget(client: AnkiInvoker, settings: AnkiSettingsLike): Promise<AnkiTarget> {
  const decks = await client.invoke("deckNames");
  if (!Array.isArray(decks) || !decks.includes(settings.ankiDeck)) return { ok: false, message: ankiMissingMessage("deck", settings.ankiDeck) };
  const models = await client.invoke("modelNames");
  if (!Array.isArray(models) || !models.includes(settings.ankiNoteType)) return { ok: false, message: ankiMissingMessage("model", settings.ankiNoteType) };
  const fields = await client.invoke("modelFieldNames", { modelName: settings.ankiNoteType });
  const map = Array.isArray(fields) ? remapFieldsForModel(fields, settings.ankiFieldMap) : { ...settings.ankiFieldMap };
  return { ok: true, settings: { ...settings, ankiFieldMap: map } };
}

export type AnkiSaveResult = "added" | "duplicate";

/** canAddNotes로 중복을 먼저 보고, 새 카드일 때만 (prepare 뒤) addNote. */
export async function addNoteIfNew(
  client: AnkiInvoker,
  note: AnkiNote,
  prepare?: (note: AnkiNote) => Promise<AnkiNote>
): Promise<AnkiSaveResult> {
  const can = await client.invoke("canAddNotes", { notes: [note] });
  if (!Array.isArray(can) || can[0] !== true) return "duplicate";
  const ready = prepare ? await prepare(note) : note;
  await client.invoke("addNote", { note: ready });
  return "added";
}

/** 저장 결과·오류 → 사람에게 보일 문구 */
export function ankiStatusMessage(r: AnkiSaveResult | unknown): string {
  if (r === "added") return ANKI_MESSAGES.added;
  if (r === "duplicate") return ANKI_MESSAGES.duplicate;
  if (r instanceof AnkiConnectError && r.kind === "connection") return ANKI_MESSAGES.connection;
  const msg = (r instanceof Error ? r.message : String(r)).split(/\r?\n|\s+at\s/)[0].trim();
  return `Anki 저장 실패: ${msg.length > 120 ? `${msg.slice(0, 117)}…` : msg}`;
}

export function ankiSettingsReady(s: AnkiSettingsLike): boolean {
  return !!s.ankiDeck?.trim() && !!s.ankiNoteType?.trim();
}

// ── SPEC_026: 안 들림 핀 문장 → 듣기 카드 ─────────────────────────────

/** 문장 카드 노트 타입(사람이 AnkiDroid에서 한 번 만든다 — AnkiConnect Android에 createModel 없음). */
export const ANKI_SENTENCE_NOTE_TYPE = "happynote2 Listening";
/** 문장 카드 필드(이 이름 그대로 만든다). Sentence = TTS·뒷면 원문, Cloze = 앞면 빈칸 문장. */
export const ANKI_SENTENCE_FIELDS = ["Sentence", "Cloze", "Picture", "Hint", "Source"] as const;
/** AnkiDroid 노트 타입 카드 템플릿(⏳ 안내·설정 설명에 그대로 보여 줌). */
export const ANKI_SENTENCE_FRONT_TEMPLATE = "{{tts en_US:Sentence}}<br>{{Picture}}<br>{{Cloze}}<br>{{Hint}}";
export const ANKI_SENTENCE_BACK_TEMPLATE = "{{FrontSide}}<hr id=answer>{{Sentence}}<br>{{Source}}";

export interface SentenceNoteInput {
  text: string;
  words: string[];
  /** 받아쓰기 시도(낱말 번호 → 쓴 글자) */
  attempts?: Record<number, string> | null;
  phoneticKr?: string | null;
  traps?: readonly string[] | null;
  videoId: string | null;
  videoTitle: string | null;
  startSec: number;
  pictureFilename?: string | null;
}

export interface SentenceSettingsLike {
  ankiDeck: string;
  ankiSentenceNoteType: string;
  ankiTags: string;
}

const normWord = (w: string) => w.trim().toLowerCase().replace(/[^a-z0-9']/g, "");

/** 받아쓰기에서 틀린 낱말 번호(빈 시도·맞은 것 제외, 오름차순) — 받아쓰기 칸과 같은 비교. */
export function sentenceBlankIndices(words: string[], attempts: Record<number, string> | null | undefined): number[] {
  const out: number[] = [];
  for (const [k, v] of Object.entries(attempts ?? {})) {
    const i = Number(k);
    const want = words[i];
    if (!Number.isInteger(i) || want === undefined) continue;
    const got = normWord(String(v ?? ""));
    if (!got || !normWord(want)) continue;
    if (got !== normWord(want)) out.push(i);
  }
  return out.sort((a, b) => a - b);
}

/** 틀린 낱말을 ____로(앞뒤 문장부호는 남김). 틀린 낱말이 없으면 빈 글자 — 앞면에 원문을 보이지 않는다. */
export function sentenceCloze(words: string[], blanks: number[]): string {
  if (blanks.length === 0) return "";
  const set = new Set(blanks);
  return words
    .map((w, i) => {
      if (!set.has(i)) return w;
      const m = w.match(/^([^A-Za-z0-9']*)(.*?)([^A-Za-z0-9']*)$/);
      return m ? `${m[1]}${CLOZE_BLANK}${m[3]}` : CLOZE_BLANK;
    })
    .join(" ");
}

function sourceLink(videoId: string | null, videoTitle: string | null, startSec: number | undefined): string {
  if (!videoId) return "";
  const t = Math.max(0, Math.floor(startSec ?? 0));
  return `<a href="https://youtu.be/${encodeURIComponent(videoId)}?t=${t}">${escapeHtml(videoTitle ?? "")} ${formatMmSs(t)}</a>`;
}

/** addNote용 문장 듣기 카드(순수). 앞면 = TTS 소리·장면·빈칸·소리 힌트·함정, 뒷면 = 원문·출처. */
export function buildSentenceNote(input: SentenceNoteInput, settings: SentenceSettingsLike): AnkiNote {
  const blanks = sentenceBlankIndices(input.words, input.attempts);
  const hintParts = [input.phoneticKr?.trim() ?? "", trapLabelList(input.traps).join(" · ")].filter(Boolean);
  const fields: Record<string, string> = {
    Sentence: escapeHtml(input.text.trim()),
    Cloze: escapeHtml(sentenceCloze(input.words, blanks)),
    Picture: input.pictureFilename ? `<img src="${escapeHtml(input.pictureFilename)}">` : "",
    Hint: hintParts.map(escapeHtml).join("<br>"),
    Source: sourceLink(input.videoId, input.videoTitle, input.startSec),
  };
  const tags = [...settings.ankiTags.split(/\s+/).filter(Boolean), "sentence"];
  return {
    deckName: settings.ankiDeck,
    modelName: settings.ankiSentenceNoteType,
    fields,
    tags: [...new Set(tags)],
    options: { allowDuplicate: false, duplicateScope: "deck" },
  };
}

/** 문장 카드 노트 타입 없음·필드 모자람 안내 */
export function sentenceModelMessage(name: string, missing: string[] | null): string {
  const how = `AnkiDroid에서 노트 타입 「${name}」을 만들고 필드 ${ANKI_SENTENCE_FIELDS.join("·")}를 넣어 주세요`;
  if (missing === null) return `Anki에 「${name}」 노트 타입이 없습니다 — ${how}`;
  return `「${name}」 노트 타입에 필드 ${missing.join("·")}가 없습니다 — ${how}`;
}

/** 저장 전 확인: 덱 → 노트 타입 → 필드 5개. */
export async function resolveSentenceTarget(client: AnkiInvoker, settings: SentenceSettingsLike): Promise<{ ok: true } | { ok: false; message: string }> {
  const decks = await client.invoke("deckNames");
  if (!Array.isArray(decks) || !decks.includes(settings.ankiDeck)) return { ok: false, message: ankiMissingMessage("deck", settings.ankiDeck) };
  const models = await client.invoke("modelNames");
  if (!Array.isArray(models) || !models.includes(settings.ankiSentenceNoteType)) return { ok: false, message: sentenceModelMessage(settings.ankiSentenceNoteType, null) };
  const fields = await client.invoke("modelFieldNames", { modelName: settings.ankiSentenceNoteType });
  const have = Array.isArray(fields) ? fields.map(String) : [];
  const missing = ANKI_SENTENCE_FIELDS.filter((f) => !have.includes(f));
  if (missing.length > 0) return { ok: false, message: sentenceModelMessage(settings.ankiSentenceNoteType, missing) };
  return { ok: true };
}
