import { send as requestUrl } from "../features/network"; // SPEC_041: 시간 제한·재시도
import type { RawTranscriptCue } from "../types/transcript";
import { parseCaptionPayload } from "./captionPayload.ts";
import { isMobileApp, requireDesktopModule } from "../utils/platform.ts";

export interface FetchedVideoTranscript {
  videoId: string;
  title: string;
  channelName: string;
  cues: RawTranscriptCue[];
  source: "innertube" | "yt-dlp";
}

/**
 * Extracts YouTube video metadata and English transcript cues.
 * Strategy 1: Built-in zero-dependency YouTube Watch Page / Innertube caption parser (via Obsidian requestUrl).
 * Strategy 2: Local `yt-dlp` fallback for auto-generated subtitles when available.
 */
export class TranscriptService {
  constructor(private getYtDlpPath: () => string) {}

  public async fetchTranscript(
    videoId: string,
    preferredLang = "en"
  ): Promise<FetchedVideoTranscript> {
    try {
      return await this.fetchViaBuiltInExtractor(videoId, preferredLang);
    } catch (primaryErr) {
      if (isMobileApp()) {
        throw primaryErr;
      }
      try {
        return await this.fetchViaYtDlpFallback(videoId, preferredLang);
      } catch {
        throw primaryErr;
      }
    }
  }

  private async fetchViaBuiltInExtractor(
    videoId: string,
    preferredLang: string
  ): Promise<FetchedVideoTranscript> {
    // Try Android Innertube player first (doesn't require PO-token on caption baseUrls),
    // then fall back to Watch Page ytInitialPlayerResponse.
    const playerResponses: Array<{ sourceLabel: string; data: Record<string, any> }> = [];

    try {
      const androidData = await this.fetchPlayerResponseViaInnertubeAndroid(videoId);
      if (androidData) {
        playerResponses.push({ sourceLabel: "android-innertube", data: androidData });
      }
    } catch {
      // Ignore and try watch page
    }

    try {
      const watchData = await this.fetchPlayerResponseViaWatchPage(videoId);
      if (watchData) {
        playerResponses.push({ sourceLabel: "watch-page", data: watchData });
      }
    } catch {
      // Ignore
    }

    if (playerResponses.length === 0) {
      throw new Error("유튜브 페이지에서 플레이어 데이터를 추출하지 못했습니다.");
    }

    let lastError: Error | null = null;
    let foundAnyTracklist = false;

    for (const { data: playerResponse } of playerResponses) {
      const videoDetails = playerResponse.videoDetails || {};
      const title: string = videoDetails.title || `YouTube Video (${videoId})`;
      const channelName: string = videoDetails.author || "YouTube";

      const tracklist =
        playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!Array.isArray(tracklist) || tracklist.length === 0) {
        continue;
      }
      foundAnyTracklist = true;

      // Sort tracks: manual preferred lang -> auto preferred lang -> any English -> others
      const sortedTracks = [...tracklist].sort((a, b) => {
        const aLang = (a.languageCode || "").toLowerCase();
        const bLang = (b.languageCode || "").toLowerCase();
        const aPref = aLang.startsWith(preferredLang.toLowerCase());
        const bPref = bLang.startsWith(preferredLang.toLowerCase());
        const aManual = a.kind !== "asr";
        const bManual = b.kind !== "asr";

        if (aPref && !bPref) return -1;
        if (!aPref && bPref) return 1;
        if (aManual && !bManual) return -1;
        if (!aManual && bManual) return 1;
        return 0;
      });

      for (const track of sortedTracks) {
        if (!track.baseUrl) continue;

        const candidateUrls: string[] = [
          track.baseUrl,
          track.baseUrl.includes("fmt=") ? track.baseUrl : `${track.baseUrl}&fmt=json3`,
          track.baseUrl.includes("fmt=") ? track.baseUrl : `${track.baseUrl}&fmt=srv1`,
          track.baseUrl.includes("fmt=") ? track.baseUrl : `${track.baseUrl}&fmt=vtt`,
        ];

        for (const targetUrl of candidateUrls) {
          try {
            const trackResp = await requestUrl({
              url: targetUrl,
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
            });

            if (trackResp.status === 200 && trackResp.text) {
              const cues = this.parseTrackPayload(trackResp.text);
              if (cues.length > 0) {
                return {
                  videoId,
                  title,
                  channelName,
                  cues,
                  source: "innertube",
                };
              }
            }
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
          }
        }
      }
    }

    if (!foundAnyTracklist) {
      throw new Error("이 유튜브 영상에는 제공되는 자막(Captions)이 없습니다.");
    }

    throw (
      lastError ||
      new Error(
        "자막 트랙을 다운로드했으나 파싱 가능한 자막 문장이 발견되지 않았습니다 (0 cues)."
      )
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchPlayerResponseViaInnertubeAndroid(videoId: string): Promise<any | null> {
    const resp = await requestUrl({
      url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "20.10.38",
            hl: "en",
            gl: "US",
          },
        },
        videoId,
      }),
    });
    if (resp.status !== 200 || !resp.text) return null;
    return JSON.parse(resp.text);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchPlayerResponseViaWatchPage(videoId: string): Promise<any | null> {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
    const pageResp = await requestUrl({
      url: watchUrl,
      method: "GET",
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    return this.extractInitialPlayerResponse(pageResp.text);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractInitialPlayerResponse(html: string): any | null {
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
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const rawJson = html.slice(jsonStart, i + 1);
          try {
            return JSON.parse(rawJson);
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  public parseTrackPayload(rawText: string): RawTranscriptCue[] {
    return parseCaptionPayload(rawText);
  }

  private async fetchViaYtDlpFallback(
    videoId: string,
    preferredLang: string
  ): Promise<FetchedVideoTranscript> {
    if (isMobileApp()) {
      throw new Error("yt-dlp fallback is only available on desktop.");
    }

    const cp = requireDesktopModule<typeof import("child_process")>("child_process");
    const util = requireDesktopModule<typeof import("util")>("util");
    const fs = requireDesktopModule<typeof import("fs/promises")>("fs/promises");
    const path = requireDesktopModule<typeof import("path")>("path");
    const os = requireDesktopModule<typeof import("os")>("os");
    const execFileAsync = util.promisify(cp.execFile);

    const rawBin = (this.getYtDlpPath() || "yt-dlp").trim();
    const ytDlpBin =
      typeof process !== "undefined" &&
      process.platform === "win32" &&
      !/\.(exe|cmd|bat)$/i.test(rawBin)
        ? `${rawBin}.exe`
        : rawBin;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ear-coach-"));
    const outTemplate = path.join(tmpDir, "%(id)s.%(ext)s");
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
      const { stdout } = await execFileAsync(ytDlpBin, [
        "--dump-single-json",
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        `${preferredLang}.*,${preferredLang}`,
        "--sub-format",
        "json3/vtt/srv1",
        "-o",
        outTemplate,
        videoUrl,
      ]);

      const meta = JSON.parse(stdout);
      const files = await fs.readdir(tmpDir);
      const subFile = files.find((f) => f.endsWith(".json3") || f.endsWith(".vtt"));
      if (!subFile) {
        throw new Error("yt-dlp did not produce a subtitle file.");
      }

      const rawSub = await fs.readFile(path.join(tmpDir, subFile), "utf8");
      const cues = this.parseTrackPayload(rawSub);

      return {
        videoId,
        title: meta.title || `YouTube Video (${videoId})`,
        channelName: meta.uploader || "YouTube",
        cues,
        source: "yt-dlp",
      };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
