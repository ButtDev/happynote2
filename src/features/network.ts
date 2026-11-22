/**
 * SPEC_039: 네트워크로 받는 기능(사전·Anki·AI 요청·바이트·원음 구간·장면 그림)을 한 곳에서 만든다.
 * 모두 Obsidian `requestUrl`(모바일 웹뷰 CORS 회피). main.ts는 결과를 필드로 받기만 한다.
 */
import { RequestUrlResponse, requestUrl } from "obsidian";
import { DictionaryApiDevProvider, DictionaryProvider } from "../services/dictionary";
import { ANKI_CONNECT_URL, AnkiConnectClient, AnkiInvoker } from "../services/anki";
import { StoryboardInfo, storyboardFromPlayerResponse, storyboardFromWatchHtml } from "../services/storyboard";
import { createAudioClipper } from "../services/audioClip";
import { decodeAudioClip } from "../ui/audioDecode";
import { AiHttpRequest, AiHttpResponse } from "../services/aiAnalysis";

/** 응답 본문을 JSON으로 읽되, JSON이 아니면 null */
function statusAndJson(r: RequestUrlResponse): { status: number; json: unknown } {
  let json: unknown = null;
  try {
    json = r.json;
  } catch {
    json = null;
  }
  return { status: r.status, json };
}

/** SPEC_013: 자막 단어 사전 */
export function createDictionary(): DictionaryProvider {
  return new DictionaryApiDevProvider(async (url) => statusAndJson(await requestUrl({ url, throw: false })));
}

/** SPEC_015: AnkiConnect Android (웹뷰 CORS를 피해 requestUrl) */
export function createAnki(): AnkiInvoker {
  return new AnkiConnectClient(async (body) =>
    statusAndJson(await requestUrl({ url: ANKI_CONNECT_URL, method: "POST", contentType: "application/json", body, throw: false }))
  );
}

/** SPEC_021: 모바일 AI 요청 (requestUrl) */
export async function aiFetch(req: AiHttpRequest): Promise<AiHttpResponse> {
  return statusAndJson(await requestUrl({ url: req.url, method: req.method, headers: req.headers, body: req.body, throw: false }));
}

/** SPEC_015: 발음 파일 바이트(Anki addNote data용) */
export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const r = await requestUrl({ url, throw: false });
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
  return r.arrayBuffer;
}

/** SPEC_036: 원음 구간 WAV */
export function createAudioClip() {
  return createAudioClipper({
    request: async (o) => {
      const r = await requestUrl({ ...o, throw: false });
      return {
        status: r.status,
        get text() {
          return r.text;
        },
        get arrayBuffer() {
          return r.arrayBuffer;
        },
      };
    },
    decode: decodeAudioClip,
  });
}

/** SPEC_017: 영상 스토리보드 스펙(시청 페이지 L3 320×180 → Android innertube L2), 영상별 캐시(실패는 캐시하지 않음) */
export function createStoryboard(): (videoId: string) => Promise<StoryboardInfo | null> {
  const cache = new Map<string, Promise<StoryboardInfo | null>>();
  return (videoId: string) => {
    const hit = cache.get(videoId);
    if (hit) return hit;
    const p = fetchStoryboard(videoId);
    cache.set(videoId, p);
    void p.then((v) => {
      if (!v) cache.delete(videoId);
    });
    return p;
  };
}

async function fetchStoryboard(videoId: string): Promise<StoryboardInfo | null> {
  const id = encodeURIComponent(videoId);
  try {
    const r = await requestUrl({
      url: `https://www.youtube.com/watch?v=${id}&hl=en`,
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      throw: false,
    });
    const info = r.status === 200 ? storyboardFromWatchHtml(r.text) : null;
    if (info) return info;
  } catch {
    // Android innertube로
  }
  try {
    const r = await requestUrl({
      url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      method: "POST",
      contentType: "application/json",
      headers: { "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip" },
      body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", hl: "en", gl: "US" } }, videoId }),
      throw: false,
    });
    return r.status === 200 ? storyboardFromPlayerResponse(JSON.parse(r.text)) : null;
  } catch {
    return null;
  }
}
