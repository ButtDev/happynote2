import { send as requestUrl } from "../features/network"; // SPEC_041: 시간 제한·재시도
import type { RawTranscriptCue } from "../types/transcript";
import {
  captionCandidateUrls,
  extractInitialPlayerResponse,
  orderCaptionTracks,
  parseCaptionPayload,
} from "./captionPayload.ts";
import { KnownFailure } from "./notices.ts";
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
    let playerErr: unknown = null;

    try {
      const androidData = await this.fetchPlayerResponseViaInnertubeAndroid(videoId);
      if (androidData) {
        playerResponses.push({ sourceLabel: "android-innertube", data: androidData });
      }
    } catch (e) {
      // Ignore and try watch page
      playerErr = e;
    }

    try {
      const watchData = await this.fetchPlayerResponseViaWatchPage(videoId);
      if (watchData) {
        playerResponses.push({ sourceLabel: "watch-page", data: watchData });
      }
    } catch (e) {
      // Ignore
      playerErr = e;
    }

    if (playerResponses.length === 0) {
      // SPEC_042: 네트워크 실패(오프라인·시간 초과)는 그대로 — 알림이 원인을 고른다
      if ((playerErr as { name?: string } | null)?.name === "HttpFailure") throw playerErr;
      throw new KnownFailure("유튜브 페이지를 읽지 못했어요");
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

      // Sort tracks: preferred lang -> manual before auto (captionPayload.orderCaptionTracks)
      const sortedTracks = orderCaptionTracks(tracklist, preferredLang);

      for (const track of sortedTracks) {
        if (!track.baseUrl) continue;

        const candidateUrls = captionCandidateUrls(track.baseUrl);

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
      throw new KnownFailure("이 영상에는 자막이 없어요");
    }

    throw (
      lastError ||
      new KnownFailure("자막 문장을 찾지 못했어요")
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
    return extractInitialPlayerResponse(pageResp.text);
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
