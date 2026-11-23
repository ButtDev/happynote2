/**
 * SPEC_046: 이어 보기 — 재생 위치를 learning.json(SPEC_040 setPosition)에 남기고,
 * 같은 영상을 다시 열면(특정 시각 지정 없이) 그 위치로 옮겨 두고 그 문장 카드로 스크롤 + 알림.
 * 재생은 하지 않는다. EarCoachView는 open·tick·flush 세 곳만 부른다.
 */
import { Notice } from "obsidian";
import type { ListeningSessionData } from "../types/transcript";
import { resumePoint, shouldSavePosition } from "../utils/resume";
import { formatSecondsToTimestamp } from "../utils/youtubeUrlParser";
import { diagnostics } from "../services/diagnostics";

interface ResumePlayer {
  seekTo(sec: number): void;
  isPlayingNow(): boolean;
}
interface ResumeLearning {
  position(videoId: string): Promise<{ seconds: number } | null>;
  setPosition(videoId: string, seconds: number): Promise<void>;
}

export function resumeNoticeText(sec: number): string {
  return `⏩ 지난번 ${formatSecondsToTimestamp(sec)}부터 이어요`;
}

/** 그 시각에 걸친(없으면 그 앞 마지막) 문장의 index */
export function segmentIndexAt(session: ListeningSessionData, sec: number): number | null {
  let hit: number | null = null;
  for (const s of session.segments ?? []) {
    if (s.start <= sec) hit = s.index;
    else break;
  }
  return hit ?? session.segments?.[0]?.index ?? null;
}

export class ResumePosition {
  private videoId: string | null = null;
  private lastSavedSec: number | null = null;
  private lastTickSec: number | null = null;
  private wasPlaying = false;
  private playedSinceOpen = false;

  constructor(
    private getSession: () => ListeningSessionData | null,
    private getPlayer: () => ResumePlayer | null,
    private scrollToSegment: (segmentIndex: number) => void,
    private getLearning: () => ResumeLearning
  ) {}

  /** 영상 열기: 이전 영상 위치를 한 번 남기고, 시각 지정이 없으면 지난 위치로 복원 */
  open(session: ListeningSessionData, focusTimestampSec?: number): void {
    this.flush();
    this.videoId = session.videoId;
    this.lastSavedSec = null;
    this.lastTickSec = null;
    this.wasPlaying = false;
    this.playedSinceOpen = false;
    if (focusTimestampSec === undefined) void this.restore(session);
  }

  /** 재생 시각 갱신(80ms마다): 재생 중이면 10초마다, 재생 → 멈춤이면 무조건 한 번 */
  tick(sec: number): void {
    if (!this.videoId || !Number.isFinite(sec)) return;
    const playing = !!this.getPlayer()?.isPlayingNow();
    this.lastTickSec = sec;
    if (playing) {
      this.playedSinceOpen = true;
      if (shouldSavePosition(this.lastSavedSec, sec)) this.save(sec);
    } else if (this.wasPlaying) {
      this.save(sec);
    }
    this.wasPlaying = playing;
  }

  /** 뷰 닫기·다른 영상 열기: 지금 위치를 한 번 남김(열고 나서 움직인 게 없으면 안 씀) */
  flush(): void {
    const sec = this.lastTickSec;
    if (!this.videoId || sec === null) return;
    const moved = this.lastSavedSec === null ? this.playedSinceOpen : Math.abs(sec - this.lastSavedSec) >= 0.5;
    if (moved) this.save(sec);
  }

  private save(sec: number): void {
    const id = this.videoId;
    if (!id) return;
    const rounded = Math.round(sec * 10) / 10;
    this.lastSavedSec = rounded;
    this.getLearning().setPosition(id, rounded).catch((err) => diagnostics.record("learning.setPosition", err));
  }

  private async restore(session: ListeningSessionData): Promise<void> {
    try {
      const pos = await this.getLearning().position(session.videoId);
      const segs = session.segments ?? [];
      const lastEnd = segs.length ? Math.max(...segs.map((s) => s.end)) : 0;
      const sec = resumePoint(pos, lastEnd);
      if (sec === null || this.getSession() !== session || this.playedSinceOpen) return;
      this.lastSavedSec = sec;
      this.getPlayer()?.seekTo(sec);
      const idx = segmentIndexAt(session, sec);
      if (idx !== null) this.scrollToSegment(idx);
      new Notice(resumeNoticeText(sec));
    } catch (err) {
      diagnostics.record("learning.position", err);
    }
  }
}
