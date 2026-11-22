/**
 * SPEC_021: Mobile AI translation & phonetic analysis via Gemini (generateContent) or an
 * OpenAI-compatible endpoint (Groq by default). No obsidian import — the HTTP function and
 * sleep are injected so the logic is testable in Node.
 */
import { failureCause } from "./notices.ts";
import type { ListeningTrapType, SegmentPhoneticAnalysis, TranscriptSegment } from "../types/transcript";

export type AiProvider = "gemini" | "openai";

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  /** openai only */
  baseUrl?: string;
}

export interface AiHttpRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export interface AiHttpResponse {
  status: number;
  json: unknown;
}

export type AiErrorKind = "auth" | "quota" | "busy" | "format" | "network";

export interface AiError {
  kind: AiErrorKind;
  message: string;
}

export interface AiItem extends SegmentPhoneticAnalysis {
  segmentIndex: number;
  /** SPEC_022: 구두점 없는 카드에서 낱말이 같다고 확인된 복원 문장 */
  restoredText?: string;
}

export interface AiRunDeps {
  fetch: (req: AiHttpRequest) => Promise<AiHttpResponse>;
  sleep: (ms: number) => Promise<void>;
  onBatch?: (done: number, total: number) => void | Promise<void>;
  title?: string;
}

export interface AiRunResult {
  analyzed: number;
  total: number;
  stoppedBy?: AiError;
}

export const AI_BATCH_SEGMENTS = 20;
export const AI_REQUEST_GAP_MS = 4000;
export const AI_RETRY_WAIT_MS = 30000;
/** 서버 과부하(502·503·504, "high demand") 때 같은 묶음을 다시 보내기 전 기다림 — 길이만큼 다시 시도 */
export const AI_BUSY_WAITS_MS = [10000, 20000];
const BUSY_STATUSES = [502, 503, 504];
export const AI_PENDING_PREFIX = "(AI 정밀 해석 대기 중";

const TRAPS: ListeningTrapType[] = ["LINKING", "FLAP_T", "WEAK_FORM", "ELISION", "SLANG", "SPEED_SPIKE"];

export function needsAiAnalysis(seg: TranscriptSegment): boolean {
  const t = seg.analysis?.translationKr;
  return !seg.analysis || !t || !t.trim() || t.startsWith(AI_PENDING_PREFIX);
}

type PromptSegment = Pick<TranscriptSegment, "index" | "text" | "wpm">;

export function buildAnalysisPrompt(title: string, segments: PromptSegment[]): string {
  return [
    "You are an expert American/British English phonetics and listening coach for Korean learners.",
    `Analyze the following YouTube transcript segments from "${title}".`,
    "Focus on WHY a Korean learner might fail to hear each sentence (linking, Flap T, weak forms, consonant elision, fast speech, slang).",
    "For each segment, provide:",
    "1. traps: Array of applicable trap categories (LINKING, FLAP_T, WEAK_FORM, ELISION, SLANG, SPEED_SPIKE).",
    "2. phoneticKr: Realistic Korean phonetic approximation of the linked/reduced chunk as heard in American speech, not from spelling (e.g. 'did you eat -> [디쥬잇]', 'bought a -> [바러]', 'exactly -> [익재끌리]').",
    "3. trapExplanation: Concise Korean explanation of the sound change. Quote English words in English as written (e.g. 'did a lot of'); never write Korean phonetic spellings in this field.",
    "4. skeletonWordIndices: 0-based word indices of stressed content words.",
    "5. dictationBlankIndices: 0-based word indices (2-3 words max) of the trickiest linked/reduced words for micro-dictation. They must be inside chunkWordIndices (the same sound change that phoneticKr and trapExplanation describe).",
    "6. rhythmGuide: Sentence with stressed words capitalized/bolded and '/' for natural pauses.",
    "7. translationKr: Natural Korean meaning.",
    '8. restoredText: the SAME words in the SAME order, only fixing capitalization (proper nouns, sentence starts, "I") and adding punctuation (. , ? !). Never add, remove, merge, split or respell words. Use "" if the segment already has punctuation.',
    "9. chunkWordIndices: 0-based word indices (contiguous, 2-6 words) of the linked/reduced chunk that phoneticKr describes.",
    "",
    'Return ONE JSON object only, with keys "summaryKr" (string), "keyListeningPoints" (string array) and "items" (array, one per segment, each with "segmentIndex" equal to the segment\'s "index" plus the 9 fields above).',
    "",
    "Segments JSON:",
    JSON.stringify(segments.map((s) => ({ index: s.index, text: s.text, wpm: s.wpm }))),
  ].join("\n");
}

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  required: ["summaryKr", "keyListeningPoints", "items"],
  properties: {
    summaryKr: { type: "STRING" },
    keyListeningPoints: { type: "ARRAY", items: { type: "STRING" } },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: [
          "segmentIndex",
          "traps",
          "phoneticKr",
          "trapExplanation",
          "skeletonWordIndices",
          "dictationBlankIndices",
          "rhythmGuide",
          "translationKr",
        ],
        properties: {
          segmentIndex: { type: "INTEGER" },
          traps: { type: "ARRAY", items: { type: "STRING", enum: TRAPS } },
          phoneticKr: { type: "STRING" },
          trapExplanation: { type: "STRING" },
          skeletonWordIndices: { type: "ARRAY", items: { type: "INTEGER" } },
          dictationBlankIndices: { type: "ARRAY", items: { type: "INTEGER" } },
          rhythmGuide: { type: "STRING" },
          translationKr: { type: "STRING" },
          restoredText: { type: "STRING" },
          chunkWordIndices: { type: "ARRAY", items: { type: "INTEGER" } },
        },
      },
    },
  },
};

export function buildAiRequest(config: AiConfig, prompt: string): AiHttpRequest {
  if (config.provider === "gemini") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      }),
    };
  }
  const base = (config.baseUrl || "").trim().replace(/\/+$/, "");
  return {
    url: `${base}/chat/completions`,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You reply with a single valid JSON object and nothing else." },
        { role: "user", content: prompt },
      ],
    }),
  };
}

function errorMessage(json: unknown): string {
  const j = json as { error?: { message?: unknown } | string } | null;
  if (j && typeof j.error === "string") return j.error;
  if (j && j.error && typeof j.error === "object" && typeof j.error.message === "string") return j.error.message;
  return "";
}

function responseText(provider: AiProvider, json: unknown): string | null {
  const j = json as Record<string, any> | null;
  if (!j) return null;
  if (provider === "gemini") {
    const parts = j.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    return parts.map((p: { text?: unknown }) => (typeof p?.text === "string" ? p.text : "")).join("");
  }
  const content = j.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

function stripFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1] : t;
}

const intList = (v: unknown, max: number): number[] =>
  Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < max) : [];

/** Validates raw model items against the segments that were actually sent. */
/** SPEC_022: 구두점(. , ! ? ; :)이 하나도 없는 2낱말 이상 카드만 대소문자·구두점 복원 대상 */
export function needsTextRestore(seg: Pick<TranscriptSegment, "text" | "words">): boolean {
  return !/[.,!?;:]/.test(seg.text) && seg.words.length >= 2;
}

const bareWord = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");

/** SPEC_022: 낱말 수·낱말(소문자, 앞뒤 문장부호 무시)이 모두 같을 때만 복원 문장을 받아들임 */
export function acceptRestoredText(words: string[], restored: unknown): string | null {
  if (typeof restored !== "string") return null;
  const text = restored.trim();
  if (!text) return null;
  const got = text.split(/\s+/);
  if (got.length !== words.length) return null;
  for (let i = 0; i < got.length; i++) {
    const g = bareWord(got[i]);
    if (!g || g !== bareWord(words[i])) return null;
  }
  return text;
}

/** 받아쓰기 빈칸을 설명 덩어리 안으로: 겹치는 것만 남기고, 겹치는 게 없으면 덩어리 앞 3낱말. 덩어리가 없으면 그대로. */
export function alignBlanksToChunk(blanks: number[], chunk: number[]): number[] {
  if (chunk.length === 0) return blanks;
  const lo = Math.min(...chunk);
  const hi = Math.max(...chunk);
  const inside = blanks.filter((i) => i >= lo && i <= hi);
  if (inside.length > 0) return inside;
  return Array.from({ length: Math.min(3, hi - lo + 1) }, (_, k) => lo + k);
}

export function sanitizeItems(rawItems: unknown[], segments: TranscriptSegment[]): AiItem[] {
  const byIndex = new Map(segments.map((s) => [s.index, s]));
  const out: AiItem[] = [];
  for (const raw of rawItems) {
    const r = raw as Record<string, unknown> | null;
    if (!r || typeof r !== "object") continue;
    const seg = byIndex.get(r.segmentIndex as number);
    if (!seg) continue;
    const translationKr = typeof r.translationKr === "string" ? r.translationKr.trim() : "";
    if (!translationKr) continue;
    const traps = Array.isArray(r.traps)
      ? (r.traps.filter((t) => TRAPS.includes(t as ListeningTrapType)) as ListeningTrapType[])
      : [];
    const n = seg.words.length;
    const restoredText = needsTextRestore(seg) ? acceptRestoredText(seg.words, r.restoredText) : null;
    const chunk = Array.isArray(r.chunkWordIndices) ? intList(r.chunkWordIndices, n) : [];
    out.push({
      segmentIndex: seg.index,
      traps: traps.length > 0 ? Array.from(new Set(traps)) : ["LINKING"],
      phoneticKr: typeof r.phoneticKr === "string" ? r.phoneticKr : "",
      trapExplanation: typeof r.trapExplanation === "string" ? r.trapExplanation : "",
      skeletonWordIndices: intList(r.skeletonWordIndices, n),
      // 출제 낱말이 설명 포인트와 동떨어지지 않게(사람 11-22)
      dictationBlankIndices: alignBlanksToChunk(intList(r.dictationBlankIndices, n), chunk),
      ...(chunk.length > 0 ? { chunkWordIndices: chunk } : {}),
      rhythmGuide: typeof r.rhythmGuide === "string" && r.rhythmGuide ? r.rhythmGuide : seg.text,
      translationKr,
      ...(restoredText ? { restoredText } : {}),
    });
  }
  return out;
}

export function parseAiResponse(
  provider: AiProvider,
  status: number,
  json: unknown,
  segments: TranscriptSegment[]
): { items: AiItem[] } | { error: AiError } {
  const detail = errorMessage(json);
  if (status === 401 || status === 403) return { error: { kind: "auth", message: detail || `HTTP ${status}` } };
  if (status === 429) return { error: { kind: "quota", message: detail || "HTTP 429" } };
  if (BUSY_STATUSES.includes(status)) return { error: { kind: "busy", message: detail || `HTTP ${status}` } };
  if (status !== 200) return { error: { kind: "network", message: detail || `HTTP ${status}` } };
  const text = responseText(provider, json);
  if (text === null || !text.trim()) return { error: { kind: "format", message: "empty AI response" } };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(text));
  } catch {
    return { error: { kind: "format", message: "AI response is not JSON" } };
  }
  const items = (parsed as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return { error: { kind: "format", message: "AI response has no items array" } };
  return { items: sanitizeItems(items, segments) };
}

/**
 * Analyzes pending segments in batches of AI_BATCH_SEGMENTS, writing results into seg.analysis
 * as they arrive. Stops on auth/network errors, on a second quota error, a second format error,
 * or when the server is still busy after AI_BUSY_WAITS_MS retries.
 */
export async function runAiAnalysis(
  segments: TranscriptSegment[],
  config: AiConfig,
  deps: AiRunDeps
): Promise<AiRunResult> {
  const pending = segments.filter(needsAiAnalysis);
  const total = pending.length;
  let analyzed = 0;
  let done = 0;
  for (let start = 0; start < pending.length; start += AI_BATCH_SEGMENTS) {
    const batch = pending.slice(start, start + AI_BATCH_SEGMENTS);
    if (start > 0) await deps.sleep(AI_REQUEST_GAP_MS);
    const req = buildAiRequest(config, buildAnalysisPrompt(deps.title ?? "", batch));
    let result: { items: AiItem[] } | { error: AiError } | null = null;
    let busyRetries = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: AiHttpResponse;
      try {
        res = await deps.fetch(req);
      } catch (err) {
        return { analyzed, total, stoppedBy: { kind: "network", message: err instanceof Error ? err.message : String(err) } };
      }
      result = parseAiResponse(config.provider, res.status, res.json, batch);
      if ("items" in result) break;
      if (result.error.kind === "busy" && busyRetries < AI_BUSY_WAITS_MS.length) {
        await deps.sleep(AI_BUSY_WAITS_MS[busyRetries++]);
        attempt--;
        continue;
      }
      if (result.error.kind === "quota" && attempt === 0) {
        await deps.sleep(AI_RETRY_WAIT_MS);
        continue;
      }
      if (result.error.kind === "format" && attempt === 0) continue;
      return { analyzed, total, stoppedBy: result.error };
    }
    if (!result || !("items" in result)) {
      return { analyzed, total, stoppedBy: result && "error" in result ? result.error : { kind: "format", message: "no result" } };
    }
    const byIndex = new Map(batch.map((s) => [s.index, s]));
    for (const item of result.items) {
      const seg = byIndex.get(item.segmentIndex);
      if (!seg) continue;
      seg.analysis = {
        traps: item.traps,
        phoneticKr: item.phoneticKr,
        trapExplanation: item.trapExplanation,
        skeletonWordIndices: item.skeletonWordIndices,
        dictationBlankIndices: item.dictationBlankIndices,
        ...(item.chunkWordIndices ? { chunkWordIndices: item.chunkWordIndices } : {}),
        rhythmGuide: item.rhythmGuide,
        translationKr: item.translationKr,
      };
      if (item.restoredText) {
        seg.text = item.restoredText;
        seg.words = item.restoredText.split(/\s+/);
      }
      analyzed++;
    }
    done += batch.length;
    await deps.onBatch?.(done, total);
  }
  return { analyzed, total };
}

/** SPEC_021: 알림 문구 (글자 그대로) */
export const AI_MESSAGES = {
  start: (n: number) => `🤖 AI 번역·분석 시작 (대기 ${n}장)`,
  done: (n: number) => `✅ AI 번역·분석 완료 (${n}장)`,
  quota: (n: number, m: number) => `⏸️ AI 무료 한도에 걸려 멈췄어요 (${n}/${m}장). 나중에 노트를 다시 열면 이어서 해요.`,
  busy: (n: number, m: number) => `⏳ AI 서버가 붐벼서 멈췄어요 (${n}/${m}장). 나중에 노트를 다시 열면 이어서 해요.`,
  auth: "❌ AI 키가 거부됐어요 — 설정에서 키를 확인해 주세요",
  /** SPEC_042: 원인 한 줄(failureCause) */
  failed: (cause: string) => `❌ AI 번역을 못 했어요 — ${cause}`,
};

export function aiResultMessage(result: AiRunResult): string {
  const err = result.stoppedBy;
  if (!err) return AI_MESSAGES.done(result.analyzed);
  if (err.kind === "quota") return AI_MESSAGES.quota(result.analyzed, result.total);
  if (err.kind === "auth") return AI_MESSAGES.auth;
  if (err.kind === "busy") return AI_MESSAGES.busy(result.analyzed, result.total);
  return AI_MESSAGES.failed(failureCause(err));
}

/** SPEC_021: 설정 화면 🔌 연결 확인 — 짧은 문장 하나로 요청하고 알림 문구를 돌려줌 */
export async function testAiConnection(
  config: AiConfig | null,
  fetch: (req: AiHttpRequest) => Promise<AiHttpResponse>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<string> {
  if (!config) return "API 키를 먼저 넣어 주세요";
  const text = "I'm looking forward to it.";
  const seg = {
    id: "test", index: 0, start: 0, end: 2, duration: 2, text, words: text.split(" "),
    wpm: 150, isSpeedSpike: false, isPinned: false, unlockStep: 0,
  } as TranscriptSegment;
  try {
    const req = buildAiRequest(config, buildAnalysisPrompt("connection test", [seg]));
    let res = await fetch(req);
    let parsed = parseAiResponse(config.provider, res.status, res.json, [seg]);
    for (const wait of AI_BUSY_WAITS_MS) {
      if (!("error" in parsed) || parsed.error.kind !== "busy") break;
      await sleep(wait);
      res = await fetch(req);
      parsed = parseAiResponse(config.provider, res.status, res.json, [seg]);
    }
    if ("error" in parsed) {
      if (parsed.error.kind === "busy") return `⏳ AI 서버가 붐벼요 (다시 시도 ${AI_BUSY_WAITS_MS.length}회 실패): ${parsed.error.message}`;
      if (parsed.error.kind === "auth") return AI_MESSAGES.auth;
      if (parsed.error.kind === "quota") return `⏸️ AI 무료 한도에 걸렸어요: ${parsed.error.message}`;
      return `❌ AI 연결 실패: ${parsed.error.message}`;
    }
    const first = parsed.items[0];
    return first ? `✅ AI 연결 성공 — ${text} → ${first.translationKr}` : "❌ AI 연결 실패: 응답에 해석이 없어요";
  } catch (err) {
    return `❌ AI 연결 실패: ${err instanceof Error ? err.message : String(err)}`;
  }
}
