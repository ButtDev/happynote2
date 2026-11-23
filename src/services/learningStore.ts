/**
 * SPEC_040: 영상을 가로지르는 학습 기록(핀·빈칸·재생 위치·퀴즈)을 파일 하나에.
 * obsidian import 없음 — 파일 읽기·쓰기를 주입받는다(시험은 메모리 파일로).
 */

export const LEARNING_SCHEMA_VERSION = 1;
export const LEARNING_LIMITS = { blanks: 2000, quizzes: 500, positions: 200 } as const;
/** 같은 핀 = 같은 영상 + 시작 시각 차이 이 값 미만(초) */
export const SAME_PIN_SEC = 0.5;

export interface PinRecord {
  videoId: string;
  start: number;
  text: string;
  pinnedAt: string;
}

export interface BlankRecord {
  videoId: string;
  start: number;
  word: string;
  ok: boolean;
  at: string;
}

export interface PositionRecord {
  seconds: number;
  step?: number;
  at: string;
}

export interface QuizRecord {
  videoId: string;
  at: string;
  total: number;
  correct: number;
}

export interface LearningData {
  schemaVersion: number;
  pins: PinRecord[];
  blanks: BlankRecord[];
  positions: Record<string, PositionRecord>;
  quizzes: QuizRecord[];
}

export interface LearningFile {
  /** 파일이 없으면 null */
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

export function emptyLearningData(): LearningData {
  return { schemaVersion: LEARNING_SCHEMA_VERSION, pins: [], blanks: [], positions: {}, quizzes: [] };
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function arr<T>(v: unknown, ok: (x: any) => boolean): T[] {
  return Array.isArray(v) ? (v.filter(ok) as T[]) : [];
}

const okPin = (p: any) => isObj(p) && isStr(p.videoId) && isNum(p.start) && isStr(p.text) && isStr(p.pinnedAt);
const okBlank = (b: any) => isObj(b) && isStr(b.videoId) && isNum(b.start) && isStr(b.word) && typeof b.ok === "boolean" && isStr(b.at);
const okQuiz = (q: any) => isObj(q) && isStr(q.videoId) && isStr(q.at) && isNum(q.total) && isNum(q.correct);
const okPos = (p: any) => isObj(p) && isNum(p.seconds) && isStr(p.at) && (p.step === undefined || isNum(p.step));

/**
 * 파일 글 → 기록. 없음·깨짐 → 빈 기록. 칸 하나가 깨졌으면 그 칸(항목)만 버린다.
 * readOnly: schemaVersion이 지금보다 큼(새 판이 쓴 파일 — 덮지 않는다).
 */
export function parseLearningData(text: string | null): { data: LearningData; readOnly: boolean } {
  if (text == null) return { data: emptyLearningData(), readOnly: false };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { data: emptyLearningData(), readOnly: false };
  }
  if (!isObj(raw) || !isNum(raw.schemaVersion)) return { data: emptyLearningData(), readOnly: false };
  const positions: Record<string, PositionRecord> = {};
  if (isObj(raw.positions)) {
    for (const [id, p] of Object.entries(raw.positions)) if (okPos(p)) positions[id] = p as PositionRecord;
  }
  return {
    data: {
      schemaVersion: raw.schemaVersion,
      pins: arr<PinRecord>(raw.pins, okPin),
      blanks: arr<BlankRecord>(raw.blanks, okBlank),
      positions,
      quizzes: arr<QuizRecord>(raw.quizzes, okQuiz),
    },
    readOnly: raw.schemaVersion > LEARNING_SCHEMA_VERSION,
  };
}

function keepLast<T>(list: T[], max: number): T[] {
  return list.length > max ? list.slice(list.length - max) : list;
}

export class LearningStore {
  private data: LearningData = emptyLearningData();
  private readOnly = false;
  private loading: Promise<void> | null = null;
  private writing: Promise<void> = Promise.resolve();

  private file: LearningFile;
  private now: () => string;
  private onWriteError: (err: unknown) => void;

  constructor(file: LearningFile, now: () => string = () => new Date().toISOString(), onWriteError: (err: unknown) => void = () => {}) {
    this.file = file;
    this.now = now;
    this.onWriteError = onWriteError;
  }

  /** 처음 한 번만 읽는다(여러 번 불러도 같은 읽기를 기다림) */
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = this.file.read().then(
        (text) => {
          const r = parseLearningData(text);
          this.data = r.data;
          this.readOnly = r.readOnly;
        },
        () => {
          this.data = emptyLearningData();
        }
      );
    }
    return this.loading;
  }

  isReadOnly(): boolean {
    return this.readOnly;
  }

  /** 쓰기는 한 줄로 — 각 쓰기는 앞 쓰기가 끝난 뒤 그 시점 상태를 쓴다 */
  private save(): Promise<void> {
    if (this.readOnly) return this.writing;
    this.writing = this.writing.then(async () => {
      try {
        await this.file.write(JSON.stringify(this.data));
      } catch (err) {
        this.onWriteError(err);
      }
    });
    return this.writing;
  }

  private findPin(videoId: string, start: number): number {
    return this.data.pins.findIndex((p) => p.videoId === videoId && Math.abs(p.start - start) < SAME_PIN_SEC);
  }

  async setPin(videoId: string, start: number, text: string, on: boolean): Promise<void> {
    await this.load();
    const i = this.findPin(videoId, start);
    if (on) {
      const rec: PinRecord = { videoId, start, text, pinnedAt: this.now() };
      if (i >= 0) this.data.pins[i] = { ...this.data.pins[i], text, pinnedAt: rec.pinnedAt };
      else this.data.pins.push(rec);
    } else {
      if (i < 0) return;
      this.data.pins.splice(i, 1);
    }
    await this.save();
  }

  async recordBlank(videoId: string, start: number, word: string, ok: boolean): Promise<void> {
    await this.load();
    this.data.blanks = keepLast([...this.data.blanks, { videoId, start, word, ok, at: this.now() }], LEARNING_LIMITS.blanks);
    await this.save();
  }

  async setPosition(videoId: string, seconds: number, step?: number): Promise<void> {
    await this.load();
    const rec: PositionRecord = { seconds, at: this.now() };
    if (step !== undefined) rec.step = step;
    this.data.positions[videoId] = rec;
    const ids = Object.keys(this.data.positions);
    if (ids.length > LEARNING_LIMITS.positions) {
      ids.sort((a, b) => this.data.positions[a].at.localeCompare(this.data.positions[b].at));
      for (const id of ids.slice(0, ids.length - LEARNING_LIMITS.positions)) delete this.data.positions[id];
    }
    await this.save();
  }

  async recordQuiz(videoId: string, total: number, correct: number): Promise<void> {
    await this.load();
    this.data.quizzes = keepLast([...this.data.quizzes, { videoId, at: this.now(), total, correct }], LEARNING_LIMITS.quizzes);
    await this.save();
  }

  /** 핀, pinnedAt 새것부터 */
  async pins(): Promise<PinRecord[]> {
    await this.load();
    return [...this.data.pins].sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
  }

  /** 가장 최근 결과가 틀림인 빈칸(영상·문장·낱말별 하나), 새것부터. sinceIso 이후 것만 */
  async wrongBlanks(sinceIso?: string): Promise<BlankRecord[]> {
    await this.load();
    const last = new Map<string, BlankRecord>();
    for (const b of this.data.blanks) last.set(`${b.videoId}|${b.start.toFixed(1)}|${b.word.toLowerCase()}`, b);
    return [...last.values()]
      .filter((b) => !b.ok && (!sinceIso || b.at >= sinceIso))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  async position(videoId: string): Promise<PositionRecord | null> {
    await this.load();
    return this.data.positions[videoId] ?? null;
  }

  async quizzes(videoId?: string): Promise<QuizRecord[]> {
    await this.load();
    return this.data.quizzes.filter((q) => !videoId || q.videoId === videoId);
  }

  /** SPEC_050: 퀴즈 날 고르기용 — 위치·핀·빈칸·퀴즈 사본 */
  async activity(): Promise<Pick<LearningData, "positions" | "pins" | "blanks" | "quizzes">> {
    await this.load();
    const d = this.data;
    return { positions: { ...d.positions }, pins: [...d.pins], blanks: [...d.blanks], quizzes: [...d.quizzes] };
  }

  /** 다음 쓰기까지 기다림(시험·언로드용) */
  flush(): Promise<void> {
    return this.writing;
  }
}
