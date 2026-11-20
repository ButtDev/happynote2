/**
 * SPEC_017: 스토리보드 시트에서 장면 칸을 잘라 JPEG base64로.
 * 시트는 requestUrl로 받은 바이트라 캔버스가 오염되지 않는다(교차 출처 iframe과 다름).
 */
import type { FetchBytes } from "../services/anki";
import type { StoryboardFrame, StoryboardInfo } from "../services/storyboard";
import { storyboardFrame } from "../services/storyboard";

export const SNAPSHOT_JPEG_QUALITY = 0.9;

/** 시트 바이트 + 칸 → JPEG base64(접두어 없음). 칸이 시트 밖이면 null. */
export async function cropFrameToJpegBase64(bytes: ArrayBuffer, frame: StoryboardFrame): Promise<string | null> {
  const bmp = await createImageBitmap(new Blob([bytes]));
  try {
    if (frame.x + frame.width > bmp.width || frame.y + frame.height > bmp.height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
    const url = canvas.toDataURL("image/jpeg", SNAPSHOT_JPEG_QUALITY);
    const i = url.indexOf(",");
    return url.startsWith("data:image/jpeg") && i > 0 ? url.slice(i + 1) : null;
  } finally {
    bmp.close?.();
  }
}

/** 영상·시각 → 장면 그림(JPEG base64). 무엇이든 실패하면 null(그림 없이 저장). */
export async function captureSnapshot(
  storyboard: (videoId: string) => Promise<StoryboardInfo | null>,
  fetchBytes: FetchBytes,
  videoId: string,
  sec: number
): Promise<string | null> {
  try {
    const info = await storyboard(videoId);
    if (!info) return null;
    const frame = storyboardFrame(info.spec, sec, info.durationSec);
    if (!frame) return null;
    const bytes = await fetchBytes(frame.url);
    if (!bytes || bytes.byteLength === 0) return null;
    return await cropFrameToJpegBase64(bytes, frame);
  } catch {
    return null;
  }
}
