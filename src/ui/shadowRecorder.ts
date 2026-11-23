/**
 * SPEC_045: 쉐도잉 녹음·비교. 마이크는 하나라 녹음은 한 번에 한 문장만.
 * 녹음은 메모리에만(문장마다 마지막 1개) — 볼트·Anki에 저장하지 않는다.
 * getUserMedia·MediaRecorder·Audio는 주입받는다(기본값은 부를 때 전역에서 읽음 — 화면 검사 가짜가 끼어들 수 있게).
 */
import { Notice } from "obsidian";
import { failureNotice, KnownFailure } from "../services/notices";
import { diagnostics } from "../services/diagnostics";
import { pickRecorderMime, shadowFailureReason, SHADOW_COMPARE_GAP_SEC } from "../utils/shadowing";

interface RecorderLike {
  state?: string;
  ondataavailable: ((ev: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
}

interface AudioLike {
  onended: (() => void) | null;
  play(): Promise<void> | void;
  pause(): void;
}

export interface ShadowDeps {
  /** MediaRecorder가 있는가(없으면 마이크를 열지 않고 실패) */
  hasRecorder: () => boolean;
  getUserMedia: () => Promise<MediaStream>;
  isTypeSupported: (mime: string) => boolean;
  createRecorder: (stream: MediaStream, mime: string) => RecorderLike;
  createAudio: (url: string) => AudioLike;
  objectUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
  notify: (text: string) => void;
}

/** 쉐도잉 대상 문장(TranscriptSegment의 필요한 부분) */
export interface ShadowTarget {
  duration: number;
}

export interface ShadowStatus {
  recording: boolean;
  remainingSec: number;
  comparing: boolean;
  hasRecording: boolean;
}

/** 메모리에 둘 녹음 수(넘으면 오래된 것부터 버림) */
const SHADOW_KEEP = 20;
const TICK_MS = 250;

function unsupported(): Error {
  const e = new Error("MediaRecorder/getUserMedia unavailable");
  e.name = "ShadowUnsupported";
  return e;
}

export function defaultShadowDeps(): ShadowDeps {
  return {
    hasRecorder: () => typeof (globalThis as any).MediaRecorder === "function",
    getUserMedia: () => {
      const md = (globalThis as any).navigator?.mediaDevices;
      if (!md?.getUserMedia) return Promise.reject(unsupported());
      return md.getUserMedia({ audio: true });
    },
    isTypeSupported: (mime) => {
      const MR = (globalThis as any).MediaRecorder;
      return typeof MR?.isTypeSupported === "function" ? !!MR.isTypeSupported(mime) : false;
    },
    createRecorder: (stream, mime) => {
      const MR = (globalThis as any).MediaRecorder;
      return mime ? new MR(stream, { mimeType: mime }) : new MR(stream);
    },
    createAudio: (url) => new (globalThis as any).Audio(url),
    objectUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
    notify: (text) => new Notice(text),
  };
}

interface ActiveRecording {
  target: ShadowTarget;
  stream: MediaStream | null;
  recorder: RecorderLike | null;
  chunks: Blob[];
  endsAt: number;
  stopTimer: number | null;
  tickTimer: number | null;
}

interface ActiveCompare {
  target: ShadowTarget;
  timer: number | null;
  audio: AudioLike | null;
  stopOriginal?: () => void;
}

export class ShadowRecorder {
  private active: ActiveRecording | null = null;
  private comparing: ActiveCompare | null = null;
  private recordings = new Map<ShadowTarget, string>();
  private listeners = new Set<() => void>();

  constructor(private deps: ShadowDeps = defaultShadowDeps()) {}

  public status(target: ShadowTarget): ShadowStatus {
    const recording = this.active?.target === target;
    return {
      recording,
      remainingSec: recording ? Math.max(0, (this.active!.endsAt - Date.now()) / 1000) : 0,
      comparing: this.comparing?.target === target,
      hasRecording: this.recordings.has(target),
    };
  }

  /** 상태가 바뀌면(녹음 시작·초 줄어듦·멈춤·비교) 부른다. 돌려준 함수로 끊는다. */
  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  /** 녹음 시작 — limitSec 뒤 자동으로 멈춤. isAlive가 false가 되면(카드가 화면에서 빠짐) 마이크를 닫는다. */
  public async start(target: ShadowTarget, limitSec: number, isAlive: () => boolean = () => true): Promise<void> {
    if (this.active) this.stop();
    if (this.comparing) this.stopCompare();
    const rec: ActiveRecording = { target, stream: null, recorder: null, chunks: [], endsAt: Date.now() + limitSec * 1000, stopTimer: null, tickTimer: null };
    this.active = rec;
    this.emit();
    try {
      if (!this.deps.hasRecorder()) throw unsupported();
      const stream = await this.deps.getUserMedia();
      if (this.active !== rec) {
        stopTracks(stream);
        return;
      }
      rec.stream = stream;
      const recorder = this.deps.createRecorder(stream, pickRecorderMime(this.deps.isTypeSupported));
      rec.recorder = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) rec.chunks.push(ev.data);
      };
      recorder.onstop = () => this.finish(rec);
      recorder.start();
      rec.endsAt = Date.now() + limitSec * 1000;
      rec.stopTimer = window.setTimeout(() => this.stop(), limitSec * 1000);
      rec.tickTimer = window.setInterval(() => {
        if (!isAlive()) this.stop();
        else this.emit();
      }, TICK_MS);
      this.emit();
    } catch (err) {
      diagnostics.record("shadow.record", err);
      const reason = shadowFailureReason(err);
      this.deps.notify(failureNotice("녹음", reason ? new KnownFailure(reason) : err));
      if (rec.stream) stopTracks(rec.stream);
      this.clearTimers(rec);
      if (this.active === rec) this.active = null;
      this.emit();
    }
  }

  /** 녹음 멈춤(녹음한 것은 남김) */
  public stop(): void {
    const rec = this.active;
    if (!rec) return;
    this.active = null;
    this.clearTimers(rec);
    if (rec.stream) stopTracks(rec.stream);
    const r = rec.recorder;
    if (r && r.state !== "inactive") {
      try {
        r.stop(); // onstop → finish
      } catch (err) {
        diagnostics.record("shadow.record", err);
        this.finish(rec);
      }
    }
    this.emit();
  }

  private finish(rec: ActiveRecording): void {
    if (this.active === rec) this.active = null;
    this.clearTimers(rec);
    if (rec.chunks.length > 0) {
      const blob = new Blob(rec.chunks, { type: (rec.chunks[0] as Blob).type || "audio/webm" });
      const old = this.recordings.get(rec.target);
      if (old) this.deps.revokeUrl(old);
      this.recordings.delete(rec.target);
      this.recordings.set(rec.target, this.deps.objectUrl(blob));
      while (this.recordings.size > SHADOW_KEEP) {
        const [k, url] = this.recordings.entries().next().value as [ShadowTarget, string];
        this.deps.revokeUrl(url);
        this.recordings.delete(k);
      }
    }
    this.emit();
  }

  private clearTimers(rec: ActiveRecording): void {
    if (rec.stopTimer !== null) window.clearTimeout(rec.stopTimer);
    if (rec.tickTimer !== null) window.clearInterval(rec.tickTimer);
    rec.stopTimer = rec.tickTimer = null;
  }

  /** 비교: 원음(그 문장) → 문장 길이 + 0.3초 뒤 내 녹음. 비교 중 다시 부르면 둘 다 멈춤. */
  public compare(target: ShadowTarget, playOriginal: () => void, stopOriginal?: () => void): void {
    if (this.comparing) {
      const same = this.comparing.target === target;
      this.stopCompare();
      if (same) return;
    }
    const url = this.recordings.get(target);
    if (!url) return;
    if (this.active) this.stop();
    const cmp: ActiveCompare = { target, timer: null, audio: null, stopOriginal };
    this.comparing = cmp;
    playOriginal();
    const gapMs = (Math.max(0, Number(target.duration) || 0) + SHADOW_COMPARE_GAP_SEC) * 1000;
    cmp.timer = window.setTimeout(() => {
      cmp.timer = null;
      if (this.comparing !== cmp) return;
      cmp.stopOriginal?.();
      const audio = this.deps.createAudio(url);
      cmp.audio = audio;
      audio.onended = () => {
        if (this.comparing === cmp) {
          this.comparing = null;
          this.emit();
        }
      };
      Promise.resolve()
        .then(() => audio.play())
        .catch((err) => {
          diagnostics.record("shadow.play", err);
          this.deps.notify(failureNotice("내 녹음 재생", err));
          if (this.comparing === cmp) this.comparing = null;
          this.emit();
        });
    }, gapMs);
    this.emit();
  }

  public stopCompare(): void {
    const cmp = this.comparing;
    if (!cmp) return;
    this.comparing = null;
    if (cmp.timer !== null) window.clearTimeout(cmp.timer);
    cmp.audio?.pause();
    cmp.stopOriginal?.();
    this.emit();
  }
}

function stopTracks(stream: MediaStream): void {
  try {
    for (const t of stream.getTracks()) t.stop();
  } catch {
    /* 이미 닫힘 */
  }
}

let shared: ShadowRecorder | null = null;
/** 앱 전체에서 하나(마이크 하나) */
export function sharedShadowRecorder(): ShadowRecorder {
  return (shared ??= new ShadowRecorder());
}
