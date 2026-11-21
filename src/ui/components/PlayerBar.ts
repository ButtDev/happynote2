import { TranscriptSegment } from "../../types/transcript";
import { isMobileApp } from "../../utils/platform.ts";
import { buildYouTubeEmbedParams, buildYouTubeEmbedUrl, formatSecondsToTimestamp } from "../../utils/youtubeUrlParser";
import { decideLoopTick, loopButtonText, nextLoopMode, type LoopMode } from "../../utils/loopControl.ts";

export interface PlayerBarCallbacks {
  onTimeUpdate: (currentTimeSec: number) => void;
  onLoopToggle: (
    isLooping: boolean,
    segment: TranscriptSegment | null,
    previousSegment?: TranscriptSegment | null
  ) => void;
  /** SPEC_023: 지금 재생 시각의 문장(반복 버튼으로 켤 때 대상) */
  getSegmentAt?: (timeSec: number) => TranscriptSegment | null;
  /** SPEC_023: 지금 목록(필터 적용)에서 다음 문장 */
  getNextSegment?: (segment: TranscriptSegment) => TranscriptSegment | null;
  /** SPEC_023: 반복 횟수·쉼 설정 */
  getLoopOptions?: () => { count: number; gapSec: number };
  /** SPEC_023: 카드 목록 자동 따라가기 */
  isFollowOn?: () => boolean;
  onFollowToggle?: (on: boolean) => void;
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/**
 * High-performance YouTube controller with A-B sentence infinite loop.
 * Features dual-mode time tracking: native YouTube IFrame API + wall-clock hybrid fallback
 * to guarantee 100% reliable sentence looping even if YouTube cross-origin messaging is restricted.
 */
export class PlayerBar {
  private iframeEl: HTMLIFrameElement | null = null;
  private ytPlayer: any = null;
  private playerMountEl: HTMLElement | null = null;
  private statusLabelEl: HTMLElement | null = null;
  private videoBoxEl: HTMLElement | null = null;
  private overlayBtnEl: HTMLButtonElement | null = null;
  private ytOverlayOn = false; // mobile: YouTube native controls/overlay hidden by default (SPEC_009)
  private pendingAutoplay = true;
  private loopBtnEl: HTMLButtonElement | null = null;
  private currentVideoId = "";
  private containerId = "";
  private isMounted = false;
  private isEmbedLoaded = false;
  private mountTimeoutId: number | null = null;
  private pendingStartSec: number | null = null;
  private thumbnailEl: HTMLElement | null = null;
  private currentTimeSec = 0;
  private isPlaying = false;
  private playbackRate = 1.0;
  private activeLoopSegment: TranscriptSegment | null = null;
  private loopMode: LoopMode = "off";
  private loopPlaysDone = 0;
  private loopResumeAtMs: number | null = null;
  private followBtnEl: HTMLButtonElement | null = null;
  private loopPaddingSec = 0.25;
  private boundMessageListener: (ev: MessageEvent) => void;
  private pollIntervalId: number | null = null;
  private lastSeekWallTime = 0;
  private lastSeekVideoTime = 0;
  private hasReportedYtTime = false;
  private seekLockUntil = 0;
  private lockedSeekTime = 0;

  constructor(
    private containerEl: HTMLElement,
    private callbacks: PlayerBarCallbacks,
    initialRate = 1.0,
    loopPadding = 0.25
  ) {
    this.playbackRate = initialRate;
    this.loopPaddingSec = loopPadding;
    this.boundMessageListener = this.handlePostMessage.bind(this);
    window.addEventListener("message", this.boundMessageListener);
    this.ensureYouTubeIframeApiScript();
  }

  private ensureYouTubeIframeApiScript(): void {
    if (window.YT && window.YT.Player) return;
    if (document.getElementById("ear-coach-yt-api-script")) return;

    try {
      const tag = document.createElement("script");
      tag.id = "ear-coach-yt-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    } catch {
      // Ignore if CSP blocks
    }
  }

  public render(videoId: string): void {
    if (this.isMounted) {
      this.loadVideo(videoId);
      return;
    }

    this.currentVideoId = videoId;
    this.isMounted = true;
    this.isEmbedLoaded = false;
    this.containerEl.empty();
    this.containerEl.addClass("ear-coach-player-wrapper");

    const videoBox = this.containerEl.createDiv({ cls: "ear-coach-video-box" });
    this.videoBoxEl = videoBox;
    this.thumbnailEl = videoBox.createDiv({ cls: "ear-coach-video-thumbnail" });
    this.thumbnailEl.style.backgroundImage = `url("https://i.ytimg.com/vi/${videoId}/hqdefault.jpg")`;
    this.thumbnailEl.createDiv({
      cls: "ear-coach-thumbnail-badge",
      text: "▶ YouTube 플레이어 준비 중...",
    });

    this.containerId = `ear-coach-player-${Date.now()}`;
    this.playerMountEl = videoBox.createDiv({ attr: { id: this.containerId } });

    const controlsBar = this.containerEl.createDiv({ cls: "ear-coach-player-controls" });
    const mobile = isMobileApp();

    // Play / Pause button
    const playPauseBtn = controlsBar.createEl("button", {
      cls: "ear-coach-btn ear-coach-btn-primary",
      text: mobile ? "⏯ 재생" : "⏯ 재생/일시정지",
    });
    playPauseBtn.addEventListener("click", () => this.togglePlayPause());

    // Loop button — SPEC_023: off → 한 문장 무한 → N번씩 다음 문장 → off, 켤 때 대상은 지금 재생 위치의 문장
    this.loopBtnEl = controlsBar.createEl("button", {
      cls: "ear-coach-btn ear-coach-loop-btn",
      text: loopButtonText("off", this.loopCount(), mobile),
    });
    this.loopBtnEl.addEventListener("click", () => this.cycleLoopMode());

    // SPEC_023: 카드 목록 자동 따라가기 켜기·끄기
    const followOn = this.callbacks.isFollowOn?.() ?? true;
    this.followBtnEl = controlsBar.createEl("button", {
      cls: `ear-coach-btn ear-coach-follow-btn${followOn ? " is-active" : ""}`,
      text: mobile ? "⇅" : "⇅ 따라가기",
      attr: { "aria-pressed": String(followOn), "aria-label": "카드 목록 자동 따라가기", title: "카드 목록 자동 따라가기" },
    });
    this.followBtnEl.addEventListener("click", () => {
      const on = this.followBtnEl?.getAttribute("aria-pressed") !== "true";
      this.followBtnEl?.toggleClass("is-active", on);
      this.followBtnEl?.setAttr("aria-pressed", String(on));
      this.callbacks.onFollowToggle?.(on);
    });

    // Playback speed buttons
    const speedGroup = controlsBar.createDiv({ cls: "ear-coach-speed-group" });
    if (!mobile) {
      speedGroup.createSpan({ cls: "ear-coach-speed-label", text: "배속:" });
    }

    const speeds = [0.7, 0.85, 1.0, 1.15];
    const speedButtons: HTMLButtonElement[] = [];

    for (const spd of speeds) {
      const btn = speedGroup.createEl("button", {
        cls: `ear-coach-btn ear-coach-speed-btn ${Math.abs(this.playbackRate - spd) < 0.02 ? "is-active" : ""}`,
        text: `${spd}x`,
      });
      btn.addEventListener("click", () => {
        speedButtons.forEach((b) => b.removeClass("is-active"));
        btn.addClass("is-active");
        this.setPlaybackRate(spd);
      });
      speedButtons.push(btn);
    }

    // YouTube overlay toggle (mobile only — native controls are hidden there by default, SPEC_009)
    if (mobile) {
      this.overlayBtnEl = controlsBar.createEl("button", {
        cls: "ear-coach-btn ear-coach-overlay-btn",
        text: "YT",
        attr: { "aria-pressed": "false", "aria-label": "유튜브 오버레이 켜기/끄기", title: "유튜브 오버레이 켜기/끄기" },
      });
      this.overlayBtnEl.addEventListener("click", () => this.setYouTubeOverlay(!this.ytOverlayOn));
    }

    this.statusLabelEl = controlsBar.createDiv({
      cls: "ear-coach-player-status",
      text: mobile ? "00:00" : "⏱ 00:00",
    });

    this.startLoopEnforcementTimer();

    // Defer heavy YouTube IFrame JS boot by 300ms so initial page open + virtual list paint runs at pure 60fps
    this.mountTimeoutId = window.setTimeout(() => {
      this.mountTimeoutId = null;
      this.mountYouTubeEmbed(this.currentVideoId, this.containerId);
    }, 300);
  }

  public loadVideo(videoId: string): void {
    this.clearSegmentLoop();
    this.currentTimeSec = 0;
    this.isPlaying = false;
    this.hasReportedYtTime = false;
    this.lastSeekWallTime = 0;
    this.lastSeekVideoTime = 0;
    this.seekLockUntil = 0;
    this.pendingStartSec = null;
    this.statusLabelEl?.setText(this.statusText(0));

    if (this.thumbnailEl) {
      this.thumbnailEl.style.backgroundImage = `url("https://i.ytimg.com/vi/${videoId}/hqdefault.jpg")`;
    }

    if (this.currentVideoId === videoId) return;
    this.currentVideoId = videoId;

    if (!this.isEmbedLoaded) {
      return;
    }

    if (this.ytPlayer && typeof this.ytPlayer.cueVideoById === "function") {
      try {
        this.ytPlayer.cueVideoById(videoId);
        this.ytPlayer.setPlaybackRate(this.playbackRate);
        return;
      } catch {
        // Fallback to iframe src update
      }
    }

    if (this.iframeEl) {
      this.iframeEl.src = buildYouTubeEmbedUrl(videoId, window.location.origin || "https://www.youtube.com", isMobileApp(), this.ytOverlayOn);
    }
  }

  private mountYouTubeEmbed(videoId: string, containerId: string): void {
    if (!this.playerMountEl || this.isEmbedLoaded) return;
    this.isEmbedLoaded = true;
    const origin = window.location.origin || "https://www.youtube.com";
    const mobile = isMobileApp();

    const onPlayerInitialized = () => {
      this.thumbnailEl?.remove();
      this.thumbnailEl = null;
      this.ytPlayer?.setPlaybackRate?.(this.playbackRate);
      if (this.pendingStartSec !== null) {
        const sec = this.pendingStartSec;
        this.pendingStartSec = null;
        this.seekTo(sec);
        if (this.pendingAutoplay) this.play();
      }
      this.pendingAutoplay = true;
    };

    if (window.YT && window.YT.Player) {
      try {
        this.ytPlayer = new window.YT.Player(containerId, {
          width: "100%",
          height: "100%",
          videoId,
          playerVars: buildYouTubeEmbedParams(window.location.origin, mobile, this.ytOverlayOn),
          events: {
            onReady: () => onPlayerInitialized(),
            onStateChange: (ev: any) => {
              this.isPlaying = ev.data === 1;
            },
          },
        });
      } catch {
        this.ytPlayer = null;
      }
    }

    if (!this.ytPlayer) {
      this.iframeEl = this.playerMountEl.createEl("iframe", {
        cls: "ear-coach-youtube-iframe",
        attr: {
          src: buildYouTubeEmbedUrl(videoId, origin, mobile, this.ytOverlayOn),
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: "true",
        },
      });

      this.iframeEl.addEventListener("load", () => {
        this.sendRawMessage({ event: "listening" });
        onPlayerInitialized();
      });
    }
  }

  public getLoopSegment(): TranscriptSegment | null {
    return this.activeLoopSegment;
  }

  public isSegmentLooping(segment: TranscriptSegment): boolean {
    return this.activeLoopSegment !== null && this.activeLoopSegment.index === segment.index;
  }

  public playSegment(segment: TranscriptSegment, toggleLoop = false): void {
    if (toggleLoop && this.isSegmentLooping(segment)) {
      this.clearSegmentLoop();
      return;
    }

    const startSec = Math.max(0, segment.start - 0.12);
    if (!this.isEmbedLoaded) {
      this.pendingStartSec = startSec;
      this.pendingAutoplay = true;
      if (this.mountTimeoutId !== null) {
        window.clearTimeout(this.mountTimeoutId);
        this.mountTimeoutId = null;
      }
      this.mountYouTubeEmbed(this.currentVideoId, this.containerId);
    } else {
      this.seekTo(startSec);
      this.play();
    }

    if (toggleLoop) {
      this.setSegmentLoop(segment);
    } else {
      this.clearSegmentLoop();
    }
  }

  public setSegmentLoop(segment: TranscriptSegment): void {
    this.lastSeekWallTime = performance.now();
    this.lastSeekVideoTime = segment.start;
    this.isPlaying = true;
    this.applyLoopTarget(segment, this.loopMode === "off" ? "one" : this.loopMode);
  }

  public getLoopMode(): LoopMode {
    return this.loopMode;
  }

  /** SPEC_023: 반복 버튼 — 모드를 한 단계 돌린다. off에서 켤 때 지금 재생 위치의 문장을 대상으로, 위치는 그대로 둔다. */
  public cycleLoopMode(): void {
    const next = nextLoopMode(this.loopMode);
    if (next === "off") {
      this.clearSegmentLoop();
      return;
    }
    let target = this.activeLoopSegment;
    if (!target) {
      target = this.callbacks.getSegmentAt?.(this.getEffectiveCurrentTime()) ?? null;
      if (!target) return;
    }
    this.applyLoopTarget(target, next);
  }

  private applyLoopTarget(segment: TranscriptSegment, mode: LoopMode): void {
    const prev = this.activeLoopSegment;
    this.activeLoopSegment = segment;
    this.loopMode = mode;
    this.loopPlaysDone = 0;
    this.loopResumeAtMs = null;
    this.refreshLoopButton();
    this.callbacks.onLoopToggle(true, segment, prev && prev.index !== segment.index ? prev : null);
  }

  private loopCount(): number {
    return this.callbacks.getLoopOptions?.().count ?? 3;
  }

  private refreshLoopButton(): void {
    if (!this.loopBtnEl) return;
    this.loopBtnEl.toggleClass("is-loop-active", this.loopMode !== "off");
    this.loopBtnEl.setText(loopButtonText(this.loopMode, this.loopCount(), isMobileApp(), this.activeLoopSegment));
  }

  public clearSegmentLoop(): void {
    const prev = this.activeLoopSegment;
    const wasGap = this.loopResumeAtMs !== null;
    this.activeLoopSegment = null;
    this.loopMode = "off";
    this.loopPlaysDone = 0;
    this.loopResumeAtMs = null;
    this.refreshLoopButton();
    if (wasGap) this.play();
    if (!prev) return;
    this.callbacks.onLoopToggle(false, null, prev);
  }

  public seekTo(seconds: number): void {
    this.currentTimeSec = Math.max(0, seconds);
    this.lockedSeekTime = this.currentTimeSec;
    this.seekLockUntil = performance.now() + 1000;
    this.lastSeekWallTime = performance.now();
    this.lastSeekVideoTime = this.currentTimeSec;

    if (this.ytPlayer && typeof this.ytPlayer.seekTo === "function") {
      this.ytPlayer.seekTo(this.currentTimeSec, true);
    } else {
      this.sendCommand("seekTo", [this.currentTimeSec, true]);
    }
  }

  public play(): void {
    this.isPlaying = true;
    this.lastSeekWallTime = performance.now();

    if (this.ytPlayer && typeof this.ytPlayer.playVideo === "function") {
      this.ytPlayer.playVideo();
    } else {
      this.sendCommand("playVideo", []);
    }
  }

  public pause(): void {
    this.isPlaying = false;

    if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === "function") {
      this.ytPlayer.pauseVideo();
    } else {
      this.sendCommand("pauseVideo", []);
    }
  }

  /**
   * SPEC_009: show/hide YouTube's own controls & overlay on mobile.
   * `controls` is a load-time player parameter, so the player is rebuilt at the current time.
   */
  public setYouTubeOverlay(on: boolean): void {
    if (this.ytOverlayOn === on) return;
    this.ytOverlayOn = on;
    this.overlayBtnEl?.toggleClass("is-active", on);
    this.overlayBtnEl?.setAttr("aria-pressed", String(on));
    this.containerEl.toggleClass("is-yt-overlay", on);
    if (!this.isEmbedLoaded || !this.videoBoxEl) return;

    const resumeAt = this.getEffectiveCurrentTime();
    const wasPlaying = this.isPlaying;
    try {
      this.ytPlayer?.destroy();
    } catch {
      // Ignore
    }
    this.ytPlayer = null;
    this.iframeEl = null;
    this.videoBoxEl.querySelector(`#${this.containerId}`)?.remove();
    this.playerMountEl = this.videoBoxEl.createDiv({ attr: { id: this.containerId } });
    this.isEmbedLoaded = false;
    this.isPlaying = false;
    this.hasReportedYtTime = false;
    this.pendingStartSec = resumeAt > 0.5 ? resumeAt : null;
    this.pendingAutoplay = wasPlaying;
    this.mountYouTubeEmbed(this.currentVideoId, this.containerId);
  }

  public togglePlayPause(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
    this.lastSeekWallTime = performance.now();
    this.lastSeekVideoTime = this.getEffectiveCurrentTime();

    if (this.ytPlayer && typeof this.ytPlayer.setPlaybackRate === "function") {
      this.ytPlayer.setPlaybackRate(rate);
    } else {
      this.sendCommand("setPlaybackRate", [rate]);
    }
  }

  private sendCommand(func: string, args: unknown[]): void {
    const iframe = this.getIframeElement();
    if (!iframe?.contentWindow) return;
    const message = JSON.stringify({
      event: "command",
      func,
      args,
    });
    iframe.contentWindow.postMessage(message, "*");
  }

  private sendRawMessage(obj: unknown): void {
    const iframe = this.getIframeElement();
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(JSON.stringify(obj), "*");
  }

  private getIframeElement(): HTMLIFrameElement | null {
    if (this.iframeEl) return this.iframeEl;
    if (this.ytPlayer && typeof this.ytPlayer.getIframe === "function") {
      return this.ytPlayer.getIframe();
    }
    return this.containerEl.querySelector("iframe");
  }

  private handlePostMessage(ev: MessageEvent): void {
    if (!ev.data || typeof ev.data !== "string") return;
    try {
      const data = JSON.parse(ev.data);
      if (data.event === "infoDelivery" && data.info) {
        if (typeof data.info.currentTime === "number") {
          const incoming = data.info.currentTime;
          if (performance.now() < this.seekLockUntil && incoming < this.lockedSeekTime) {
            return;
          }
          this.currentTimeSec = incoming;
          this.hasReportedYtTime = true;
          this.lastSeekWallTime = performance.now();
          this.lastSeekVideoTime = incoming;
          this.onTimeTick(incoming);
        }
        if (typeof data.info.playerState === "number") {
          this.isPlaying = data.info.playerState === 1;
        }
      }
    } catch {
      // Ignore non-YouTube JSON messages
    }
  }

  private getEffectiveCurrentTime(): number {
    if (this.ytPlayer && typeof this.ytPlayer.getCurrentTime === "function") {
      try {
        const t = this.ytPlayer.getCurrentTime();
        if (typeof t === "number" && Number.isFinite(t)) {
          if (performance.now() < this.seekLockUntil && t < this.lockedSeekTime) {
            const elapsedSec = ((performance.now() - this.lastSeekWallTime) / 1000) * this.playbackRate;
            return this.lockedSeekTime + elapsedSec;
          }
          return t;
        }
      } catch {
        // Fallback
      }
    }

    if (this.hasReportedYtTime) {
      if (performance.now() < this.seekLockUntil && this.currentTimeSec < this.lockedSeekTime) {
        const elapsedSec = ((performance.now() - this.lastSeekWallTime) / 1000) * this.playbackRate;
        return this.lockedSeekTime + elapsedSec;
      }
      return this.currentTimeSec;
    }

    // Hybrid Fallback: Calculate elapsed seconds from last seek action
    if (this.isPlaying && this.lastSeekWallTime > 0) {
      const elapsedSec = ((performance.now() - this.lastSeekWallTime) / 1000) * this.playbackRate;
      return this.lastSeekVideoTime + elapsedSec;
    }

    return this.lastSeekVideoTime;
  }

  private startLoopEnforcementTimer(): void {
    if (this.pollIntervalId !== null) {
      window.clearInterval(this.pollIntervalId);
    }

    this.pollIntervalId = window.setInterval(() => {
      const current = this.getEffectiveCurrentTime();
      this.onTimeTick(current);

      const seg = this.activeLoopSegment;
      if (seg && (this.isPlaying || this.loopResumeAtMs !== null)) {
        const opts = this.callbacks.getLoopOptions?.() ?? { count: 3, gapSec: 0 };
        const action = decideLoopTick({
          mode: this.loopMode,
          nowMs: performance.now(),
          current,
          end: seg.end,
          pad: this.loopPaddingSec,
          playsDone: this.loopPlaysDone,
          count: opts.count,
          gapSec: opts.gapSec,
          resumeAtMs: this.loopResumeAtMs,
        });
        if (action.kind === "gap") {
          this.loopResumeAtMs = action.resumeAtMs;
          this.pause();
        } else if (action.kind === "repeat") {
          this.loopResumeAtMs = null;
          this.loopPlaysDone += 1;
          this.seekTo(Math.max(0, seg.start - 0.12));
          this.play();
        } else if (action.kind === "advance") {
          this.loopResumeAtMs = null;
          const nextSeg = this.callbacks.getNextSegment?.(seg) ?? null;
          if (nextSeg) {
            this.applyLoopTarget(nextSeg, this.loopMode);
            this.seekTo(Math.max(0, nextSeg.start - 0.12));
            this.play();
          } else {
            this.clearSegmentLoop();
          }
        }
      }
    }, 80);
  }

  /** 모바일은 시계 아이콘 없이 시각만(컨트롤 한 줄 자리, SPEC_024) */
  private statusText(timeSec: number): string {
    const t = formatSecondsToTimestamp(timeSec);
    return isMobileApp() ? t : `⏱ ${t}`;
  }

  private onTimeTick(timeSec: number): void {
    if (this.statusLabelEl) {
      this.statusLabelEl.setText(this.statusText(timeSec));
    }
    this.callbacks.onTimeUpdate(timeSec);
  }

  public destroy(): void {
    this.isMounted = false;
    this.isEmbedLoaded = false;
    this.pendingStartSec = null;
    this.thumbnailEl = null;
    window.removeEventListener("message", this.boundMessageListener);
    if (this.mountTimeoutId !== null) {
      window.clearTimeout(this.mountTimeoutId);
      this.mountTimeoutId = null;
    }
    if (this.pollIntervalId !== null) {
      window.clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    try {
      this.ytPlayer?.destroy();
    } catch {
      // Ignore
    }
    this.ytPlayer = null;
    this.iframeEl = null;
  }
}
