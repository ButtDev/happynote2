/**
 * SPEC_036: 유튜브 원음에서 문장 구간을 잘라 WAV(base64)로.
 * Android innertube player → 오디오 전용 itag 140(AAC m4a, DASH 조각) → sidx 색인으로 시각을 덮는 조각만 `&range=` 받기
 * → 디코더(웹뷰 OfflineAudioContext, 주입)로 풀고 자르기 → 모노 22,050Hz 16비트 WAV.
 * obsidian import 없음(요청 함수·디코더 주입) — Test 23.
 */

export const CLIP_PAD_BEFORE = 0.25;
export const CLIP_PAD_AFTER = 0.35;
export const CLIP_MAX_SEC = 20;
export const CLIP_SAMPLE_RATE = 22050;
const PLAYER_CACHE_MS = 60 * 60 * 1000;

export interface AudioFormat {
  url: string;
  itag: number;
  initEnd: number;
  indexStart: number;
  indexEnd: number;
}

export interface SidxFragment {
  start: number;
  end: number;
  byteStart: number;
  byteEnd: number;
}

export interface Sidx {
  timescale: number;
  fragments: SidxFragment[];
}

const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

function toFormat(f: any): AudioFormat | null {
  const initEnd = num(f?.initRange?.end);
  const indexStart = num(f?.indexRange?.start);
  const indexEnd = num(f?.indexRange?.end);
  if (typeof f?.url !== "string" || !f.url || ![initEnd, indexStart, indexEnd].every(Number.isFinite)) return null;
  return { url: f.url, itag: num(f.itag), initEnd, indexStart, indexEnd };
}

/** url 있는 itag 140 → url 있는 audio/mp4 중 bitrate 최고 → null(webm·서명 암호는 안 씀). */
export function pickAudioFormat(adaptiveFormats: unknown): AudioFormat | null {
  const list = Array.isArray(adaptiveFormats) ? adaptiveFormats : [];
  const f140 = list.find((f: any) => num(f?.itag) === 140 && typeof f?.url === "string" && f.url);
  const a = f140 ? toFormat(f140) : null;
  if (a) return a;
  const mp4 = list
    .filter((f: any) => typeof f?.mimeType === "string" && f.mimeType.startsWith("audio/mp4") && typeof f?.url === "string" && f.url)
    .sort((x: any, y: any) => (num(y.bitrate) || 0) - (num(x.bitrate) || 0));
  for (const f of mp4) {
    const r = toFormat(f);
    if (r) return r;
  }
  return null;
}

/** bytes[sidxOffset]부터 sidx 상자. 조각 바이트 위치는 파일 안 절대 위치. 아니면 null. */
export function parseSidx(bytes: Uint8Array, sidxOffset: number): Sidx | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = sidxOffset;
  if (p + 12 > bytes.length) return null;
  const size = dv.getUint32(p);
  const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
  if (type !== "sidx" || size < 32 || p + size > bytes.length) return null;
  const version = bytes[p + 8];
  let q = p + 12 + 4; // reference_ID
  const timescale = dv.getUint32(q);
  q += 4;
  let ept: number;
  let firstOffset: number;
  if (version === 0) {
    ept = dv.getUint32(q);
    firstOffset = dv.getUint32(q + 4);
    q += 8;
  } else {
    ept = dv.getUint32(q) * 2 ** 32 + dv.getUint32(q + 4);
    firstOffset = dv.getUint32(q + 8) * 2 ** 32 + dv.getUint32(q + 12);
    q += 16;
  }
  q += 2; // reserved
  const count = dv.getUint16(q);
  q += 2;
  if (!timescale || q + count * 12 > p + size) return null;
  const fragments: SidxFragment[] = [];
  let byte = p + size + firstOffset;
  let t = ept;
  for (let i = 0; i < count; i++) {
    const refSize = dv.getUint32(q) & 0x7fffffff;
    const dur = dv.getUint32(q + 4);
    fragments.push({ start: t / timescale, end: (t + dur) / timescale, byteStart: byte, byteEnd: byte + refSize - 1 });
    byte += refSize;
    t += dur;
    q += 12;
  }
  return { timescale, fragments };
}

/** 문장 시각 → 자를 창 [a, b]. 앞 0.25초·뒤 0.35초 여유, 20초 상한, end ≤ start면 start + 3초. */
export function clipWindow(start: number, end: number): [number, number] {
  const s = Number.isFinite(start) ? Math.max(0, start) : 0;
  let e = Number.isFinite(end) ? end : s;
  if (e <= s) e = s + 3;
  const a = Math.max(0, s - CLIP_PAD_BEFORE);
  let b = e + CLIP_PAD_AFTER;
  if (b - a > CLIP_MAX_SEC) b = a + CLIP_MAX_SEC;
  return [round3(a), round3(b)];
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** 창과 겹치는 연속 조각(첫·끝 번호, 바이트 범위, 첫 조각 시작 시각). 겹침 없으면 null. */
export function fragmentsForRange(
  sidx: Sidx,
  a: number,
  b: number
): { first: number; last: number; byteStart: number; byteEnd: number; timeStart: number } | null {
  const fr = sidx.fragments;
  let first = -1;
  let last = -1;
  for (let i = 0; i < fr.length; i++) {
    if (fr[i].end > a && fr[i].start < b) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return null;
  return { first, last, byteStart: fr[first].byteStart, byteEnd: fr[last].byteEnd, timeStart: fr[first].start };
}

/** RIFF/WAVE PCM 1채널 16비트. 샘플은 −1~1로 자른 뒤 32767을 곱한다. */
export function encodeWav(samples: Float32Array, sampleRate: number = CLIP_SAMPLE_RATE): Uint8Array {
  const dataLen = samples.length * 2;
  const out = new Uint8Array(44 + dataLen);
  const dv = new DataView(out.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  };
  str(0, "RIFF");
  dv.setUint32(4, 36 + dataLen, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // 1채널
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, "data");
  dv.setUint32(40, dataLen, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] || 0));
    dv.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return out;
}

export function bytesToBase64(u8: Uint8Array): string {
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode(...u8.subarray(i, i + CH));
  return btoa(bin);
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export interface ClipRequest {
  url: string;
  method?: string;
  contentType?: string;
  headers?: Record<string, string>;
  body?: string;
}
export interface ClipResponse {
  status: number;
  text?: string;
  arrayBuffer?: ArrayBuffer;
}
export interface AudioClipperDeps {
  request: (r: ClipRequest) => Promise<ClipResponse>;
  /** m4a 바이트 → [from, to]초를 잘라 모노 rate Hz 샘플 */
  decode: (bytes: ArrayBuffer, from: number, to: number, rate: number) => Promise<Float32Array>;
  now?: () => number;
}

const ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";

export function withRange(url: string, a: number, b: number): string {
  return `${url}${url.includes("?") ? "&" : "?"}range=${a}-${b}`;
}

interface StreamInfo {
  at: number;
  fmt: AudioFormat;
  init: Uint8Array;
  sidx: Sidx;
}

/** (videoId, start, end) → WAV base64, 무엇이든 실패하면 null. player 응답·색인은 영상별 1시간 캐시. */
export function createAudioClipper(deps: AudioClipperDeps): (videoId: string, start: number, end: number) => Promise<string | null> {
  const cache = new Map<string, StreamInfo>();
  const now = deps.now ?? (() => Date.now());
  const bytesOf = async (url: string): Promise<Uint8Array | null> => {
    const r = await deps.request({ url });
    if (r.status < 200 || r.status >= 300 || !r.arrayBuffer) return null;
    return new Uint8Array(r.arrayBuffer);
  };
  const stream = async (videoId: string): Promise<StreamInfo | null> => {
    const hit = cache.get(videoId);
    if (hit && now() - hit.at < PLAYER_CACHE_MS) return hit;
    const r = await deps.request({
      url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      method: "POST",
      contentType: "application/json",
      headers: { "User-Agent": ANDROID_UA },
      body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en", gl: "US" } }, videoId }),
    });
    if (r.status !== 200 || !r.text) return null;
    const fmt = pickAudioFormat(JSON.parse(r.text)?.streamingData?.adaptiveFormats);
    if (!fmt) return null;
    const head = await bytesOf(withRange(fmt.url, 0, fmt.indexEnd));
    if (!head || head.length < fmt.indexEnd + 1) return null;
    const sidx = parseSidx(head, fmt.indexStart);
    if (!sidx) return null;
    const info = { at: now(), fmt, init: head.slice(0, fmt.initEnd + 1), sidx };
    cache.set(videoId, info);
    return info;
  };
  return async (videoId, start, end) => {
    try {
      const info = await stream(videoId);
      if (!info) return null;
      const [a, b] = clipWindow(start, end);
      const range = fragmentsForRange(info.sidx, a, b);
      if (!range) return null;
      const frag = await bytesOf(withRange(info.fmt.url, range.byteStart, range.byteEnd));
      if (!frag) {
        cache.delete(videoId); // URL 만료일 수 있음 — 다음엔 새로
        return null;
      }
      const all = concatBytes(info.init, frag);
      const samples = await deps.decode(all.buffer as ArrayBuffer, a - range.timeStart, b - range.timeStart, CLIP_SAMPLE_RATE);
      if (!samples || samples.length === 0) return null;
      return bytesToBase64(encodeWav(samples, CLIP_SAMPLE_RATE));
    } catch {
      return null;
    }
  };
}
