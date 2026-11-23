/**
 * SPEC_050: learning.json → 어제(또는 최근 날) 본 영상 → 노트의 세션 → 퀴즈 문제, 툴바 맨 위 줄.
 * 세션은 노트·사이드카에서만 읽는다(유튜브 복구는 하지 않음 — 화면 열기를 늦추지 않게).
 */
import type EarCoachPlugin from "../main";
import { pickQuizDay, pickQuizSegments, quizBannerText, QUIZ_SIZE } from "../utils/yesterdayQuiz";
import { QuizItem, QuizModal } from "../ui/quizModal";
import { renderWarmupBanner } from "../ui/warmupBanner";
import { diagnostics } from "../services/diagnostics";

export interface QuizOffer {
  text: string;
  items: QuizItem[];
  closed: boolean;
}

export async function yesterdayQuizOffer(plugin: EarCoachPlugin): Promise<QuizOffer | null> {
  try {
    const learning = plugin.learning;
    if (!learning?.activity || !plugin.noteGenerator?.findExistingNoteByVideoId) return null;
    const act = await learning.activity();
    const day = pickQuizDay(act, Date.now(), new Date().getTimezoneOffset());
    if (!day) return null;
    const wrong = await learning.wrongBlanks();
    const items: QuizItem[] = [];
    for (const id of day.videoIds) {
      if (items.length >= QUIZ_SIZE) break;
      const file = plugin.noteGenerator.findExistingNoteByVideoId(id);
      if (!file) continue;
      const session = await plugin.noteGenerator.loadSessionFromNote(file, plugin.workerManager);
      if (!session) continue;
      const marks = {
        wrongStarts: wrong.filter((b) => b.videoId === id).map((b) => b.start),
        pinStarts: act.pins.filter((p) => p.videoId === id).map((p) => p.start),
      };
      for (const i of pickQuizSegments(session.segments, marks, QUIZ_SIZE - items.length)) {
        const seg = session.segments[i];
        items.push({ videoId: id, title: session.title, seg: { start: seg.start, end: seg.end, text: seg.text } });
      }
    }
    return items.length > 0 ? { text: quizBannerText(day.daysAgo, items.length), items, closed: false } : null;
  } catch (err) {
    diagnostics.record("어제 영상 퀴즈", err);
    return null;
  }
}

/** 툴바 맨 위 줄(오늘의 문장 줄과 같은 자리). 끝내거나 닫으면 이 화면에선 다시 안 뜸 */
export function renderQuizBanner(toolbar: HTMLElement, offer: QuizOffer, plugin: EarCoachPlugin, rerender: () => void): void {
  const hide = () => {
    offer.closed = true;
    rerender();
  };
  renderWarmupBanner(toolbar, offer.text, "퀴즈 닫기", () => {
    new QuizModal(plugin.app, offer.items, {
      clip: (id, a, b) => (plugin.audioClip ? plugin.audioClip(id, a, b) : Promise.resolve(null)),
      record: (id, total, correct) => plugin.learning.recordQuiz(id, total, correct),
      onDone: hide,
    }).open();
  }, hide);
}
