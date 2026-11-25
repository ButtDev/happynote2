import type { RawCueWord, RawTranscriptCue } from "../types/transcript.ts";

/**
 * Parses YouTube caption payloads (json3, srv1 <text>, srv3 <p>/<s>, WebVTT/SRT) into raw cues.
 * No Obsidian import so it can be unit-tested with node (SPEC_018).
 */
export function parseCaptionPayload(rawText: string): RawTranscriptCue[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // 1. Try JSON3 format
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed.events)) {
        const cues: RawTranscriptCue[] = [];
        for (const ev of parsed.events) {
          if (!Array.isArray(ev.segs)) continue;
          const text = ev.segs
            .map((s: { utf8?: string }) => s.utf8 || "")
            .join("")
            .replace(/\r?\n/g, " ")
            .trim();
          if (!text) continue;
          const start = (ev.tStartMs || 0) / 1000;
          const duration = (ev.dDurationMs || 2000) / 1000;
          const cue: RawTranscriptCue = {
            start: Number(start.toFixed(3)),
            duration: Number(duration.toFixed(3)),
            text: decodeHtmlEntities(text),
          };
          const words: RawCueWord[] = [];
          for (const seg of ev.segs as Array<{ utf8?: string; tOffsetMs?: number }>) {
            const w = decodeHtmlEntities((seg.utf8 || "").replace(/\r?\n/g, " ").trim());
            if (!w) continue;
            words.push({
              start: Number((((ev.tStartMs || 0) + (seg.tOffsetMs || 0)) / 1000).toFixed(3)),
              text: w,
            });
          }
          if (words.length >= 2) cue.words = words;
          cues.push(cue);
        }
        if (cues.length > 0) return cues;
      }
    } catch {
      // Fall through
    }
  }

  // 2. Try XML Format 1 (<text start="1.23" dur="3.45">...</text>) - seconds
  const cuesText: RawTranscriptCue[] = [];
  const regexText = /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/gi;
  let matchText: RegExpExecArray | null;
  while ((matchText = regexText.exec(trimmed)) !== null) {
    const start = parseFloat(matchText[1]);
    const duration = matchText[2] ? parseFloat(matchText[2]) : 2.0;
    const text = decodeHtmlEntities(
      matchText[3].replace(/<[^>]+>/g, "").trim()
    );
    if (text && Number.isFinite(start)) {
      cuesText.push({
        start: Number(start.toFixed(3)),
        duration: Number(duration.toFixed(3)),
        text,
      });
    }
  }
  if (cuesText.length > 0) return cuesText;

  // 3. Try XML Format 2 & 3 (<p t="1234" d="2345">...</p>) - milliseconds
  const cuesP: RawTranscriptCue[] = [];
  const regexP = /<p\s+[^>]*?t="(\d+)"(?:\s+[^>]*?d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/gi;
  let matchP: RegExpExecArray | null;
  while ((matchP = regexP.exec(trimmed)) !== null) {
    const tMs = parseInt(matchP[1], 10);
    const dMs = matchP[2] ? parseInt(matchP[2], 10) : 2000;
    const rawBody = matchP[3].replace(/<[^>]+>/g, "").replace(/\r?\n/g, " ").trim();
    const text = decodeHtmlEntities(rawBody);
    if (text && Number.isFinite(tMs)) {
      const cue: RawTranscriptCue = {
        start: Number((tMs / 1000).toFixed(3)),
        duration: Number((dMs / 1000).toFixed(3)),
        text,
      };
      const words = parseSrv3Words(matchP[3], tMs);
      if (words.length >= 2) cue.words = words;
      cuesP.push(cue);
    }
  }
  if (cuesP.length > 0) return cuesP;

  // 4. Try WebVTT / SRT format (00:00:01.000 --> 00:00:04.000)
  const vttCues: RawTranscriptCue[] = [];
  const vttBlockRegex =
    /(?:(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3}))\s*-->\s*(?:(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{3}))[^\r\n]*\r?\n([\s\S]*?)(?=\r?\n\r?\n|$)/g;

  let vttMatch: RegExpExecArray | null;
  while ((vttMatch = vttBlockRegex.exec(trimmed)) !== null) {
    const h1 = vttMatch[1] ? parseInt(vttMatch[1].replace(":", ""), 10) : 0;
    const m1 = parseInt(vttMatch[2], 10);
    const s1 = parseInt(vttMatch[3], 10);
    const ms1 = parseInt(vttMatch[4], 10);
    const startTime = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000;

    const h2 = vttMatch[5] ? parseInt(vttMatch[5].replace(":", ""), 10) : 0;
    const m2 = parseInt(vttMatch[6], 10);
    const s2 = parseInt(vttMatch[7], 10);
    const ms2 = parseInt(vttMatch[8], 10);
    const endTime = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000;

    const text = decodeHtmlEntities(
      vttMatch[9].replace(/<[^>]+>/g, "").replace(/\r?\n/g, " ").trim()
    );
    if (text) {
      vttCues.push({
        start: Number(startTime.toFixed(3)),
        duration: Number(Math.max(0.5, endTime - startTime).toFixed(3)),
        text,
      });
    }
  }
  if (vttCues.length > 0) return vttCues;

  return [];
}

/** srv3 ASR word spans: <s t="offsetMs">word</s> inside <p t="startMs">. */
function parseSrv3Words(body: string, pStartMs: number): RawCueWord[] {
  const words: RawCueWord[] = [];
  const regexS = /<s\b([^>]*)>([\s\S]*?)<\/s>/gi;
  let m: RegExpExecArray | null;
  while ((m = regexS.exec(body)) !== null) {
    const offsetMatch = m[1].match(/\bt="(\d+)"/);
    const offsetMs = offsetMatch ? parseInt(offsetMatch[1], 10) : 0;
    const w = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, "").replace(/\r?\n/g, " ").trim());
    if (!w) continue;
    words.push({ start: Number(((pStartMs + offsetMs) / 1000).toFixed(3)), text: w });
  }
  return words;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (m, dec) => codePoint(m, parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => codePoint(m, parseInt(hex, 16)));
}

/** 이모지처럼 0xFFFF 위 글자도 한 글자로(fromCharCode는 반쪽만 냄). 없는 코드면 원문 그대로. */
function codePoint(original: string, n: number): string {
  if (n === 0xa0) return " ";
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : original;
}

/** Caption track entry from a YouTube player response (only the fields we read). */
export interface CaptionTrackLike {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
}

/**
 * Order caption tracks: preferred language first, then manual (non-asr) before auto.
 * Stable — tracks that tie keep YouTube's order.
 */
export function orderCaptionTracks<T extends CaptionTrackLike>(tracks: T[], preferredLang: string): T[] {
  const pref = preferredLang.toLowerCase();
  return [...tracks].sort((a, b) => {
    const aPref = (a.languageCode || "").toLowerCase().startsWith(pref);
    const bPref = (b.languageCode || "").toLowerCase().startsWith(pref);
    const aManual = a.kind !== "asr";
    const bManual = b.kind !== "asr";
    if (aPref && !bPref) return -1;
    if (!aPref && bPref) return 1;
    if (aManual && !bManual) return -1;
    if (!aManual && bManual) return 1;
    return 0;
  });
}

/** Caption URLs to try for one track: as given, then json3 / srv1 / vtt when no fmt= is set. */
export function captionCandidateUrls(baseUrl: string): string[] {
  if (baseUrl.includes("fmt=")) return [baseUrl];
  return [baseUrl, `${baseUrl}&fmt=json3`, `${baseUrl}&fmt=srv1`, `${baseUrl}&fmt=vtt`];
}

/**
 * Pull `ytInitialPlayerResponse = {...}` out of a watch page by brace matching
 * (strings and escapes respected). null when missing or not valid JSON.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractInitialPlayerResponse(html: string): any | null {
  const marker = "ytInitialPlayerResponse = ";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) return null;
  const jsonStart = html.indexOf("{", startIdx);
  if (jsonStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
