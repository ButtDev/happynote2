import { App, Modal, Notice } from "obsidian";
import type { DictionaryEntry, DictionaryProvider } from "../services/dictionary";
import { normalizeLookupWord, phraseCandidatesAround } from "../services/dictionary";
import type { AnkiInvoker, AnkiSettingsLike, FetchBytes } from "../services/anki";
import { ANKI_MESSAGES, addNoteIfNew, inlineAudio, resolveAnkiTarget, ankiSettingsReady, ankiStatusMessage, buildAnkiNote, snapshotFilename, storeSnapshot } from "../services/anki";

/** SPEC_015: 사전 창에서 Anki 카드를 만들 때 필요한 자막·영상 정보와 클라이언트 */
export interface DictionaryAnkiContext {
  client: AnkiInvoker;
  /** 발음 파일을 받아 data로 넣는다(AnkiConnect Android가 외부 url을 못 받음) */
  fetchBytes: FetchBytes;
  settings: () => AnkiSettingsLike;
  sentence: string;
  videoId: string | null;
  videoTitle: string | null;
  startSec: number;
  /** SPEC_017: 자막 문장 끝 시각(장면 = 문장 가운데) */
  endSec?: number | null;
  /** SPEC_017: 영상·시각 → 장면 그림 JPEG base64(없으면 null) */
  snapshot?: ((videoId: string, sec: number) => Promise<string | null>) | null;
}

/**
 * SPEC_013: 자막 단어 사전 창 — 단어·IPA·품사별 뜻·예문·발음 듣기.
 * SPEC_014: 누른 낱말 + 뒤 낱말로 만든 구 후보 중 사전에 있는 첫 구를 맨 위 구 칸에(꼬리표 없음 — 숙어도 나오므로).
 * SPEC_015: 단어 칸·구 칸마다 「➕ Anki」 → AnkiConnect Android addNote.
 */
export class DictionaryModal extends Modal {
  private readonly word: string;
  private readonly rawWord: string;
  private readonly following: string[];
  private readonly preceding: string[];
  private readonly provider: DictionaryProvider;
  private audio: HTMLAudioElement | null = null;
  private readonly anki: DictionaryAnkiContext | null;

  constructor(app: App, rawWord: string, provider: DictionaryProvider, following: string[] = [], anki: DictionaryAnkiContext | null = null, preceding: string[] = []) {
    super(app);
    this.anki = anki;
    this.rawWord = rawWord;
    this.word = normalizeLookupWord(rawWord) || rawWord.trim();
    this.provider = provider;
    this.following = following;
    this.preceding = preceding;
  }

  public onOpen(): void {
    this.modalEl.addClass("ear-coach-dictionary-modal");
    const { contentEl } = this;
    contentEl.empty();
    const phraseBox = contentEl.createDiv({ cls: "ear-coach-dict-phrase-slot" });
    const head = contentEl.createDiv({ cls: "ear-coach-dict-head" });
    head.createEl("h3", { cls: "ear-coach-dict-word", text: this.word });
    const body = contentEl.createDiv({ cls: "ear-coach-dict-body" });
    body.createDiv({ cls: "ear-coach-dict-status", text: "사전을 찾는 중…" });

    void this.lookupPhrase().then((entry) => {
      if (entry && this.contentEl.isConnected) this.renderPhrase(phraseBox, entry);
    });

    this.provider
      .lookup(this.word)
      .then((entry) => {
        body.empty();
        if (!entry) {
          body.createDiv({ cls: "ear-coach-dict-status", text: `사전에 없는 단어입니다: ${this.word}` });
          return;
        }
        this.renderEntry(head, body, entry);
      })
      .catch(() => {
        body.empty();
        body.createDiv({ cls: "ear-coach-dict-status is-error", text: "사전을 불러오지 못했습니다" });
      });
  }

  /** 후보를 동시에 조회하고, 후보 순서대로 처음 결과가 있는 구. 없거나 오류면 null. */
  private async lookupPhrase(): Promise<DictionaryEntry | null> {
    const cands = phraseCandidatesAround(this.rawWord, this.preceding, this.following);
    if (cands.length === 0) return null;
    const results = await Promise.all(cands.map((c) => this.provider.lookup(c).catch(() => null)));
    return results.find((r) => !!r) ?? null;
  }

  private renderPhrase(slot: HTMLElement, entry: DictionaryEntry): void {
    const box = slot.createDiv({ cls: "ear-coach-dict-phrase" });
    const head = box.createDiv({ cls: "ear-coach-dict-head" });
    head.createEl("h3", { cls: "ear-coach-dict-phrase-title", text: entry.word });
    if (entry.phonetic) head.createSpan({ cls: "ear-coach-dict-ipa", text: entry.phonetic });
    if (entry.audioUrl) this.addAudioButton(head, entry.audioUrl);
    this.addAnkiButton(head, box, entry);
    this.renderMeanings(box, entry);
  }

  private renderEntry(head: HTMLElement, body: HTMLElement, entry: DictionaryEntry): void {
    if (entry.phonetic) head.createSpan({ cls: "ear-coach-dict-ipa", text: entry.phonetic });
    if (entry.audioUrl) this.addAudioButton(head, entry.audioUrl);
    this.addAnkiButton(head, body, entry);
    this.renderMeanings(body, entry);
    body.createDiv({ cls: "ear-coach-dict-source", text: this.provider.name });
  }

  private addAudioButton(head: HTMLElement, url: string): void {
    const btn = head.createEl("button", { cls: "ear-coach-dict-audio", text: "🔊 발음" });
    btn.addEventListener("click", () => {
      this.audio?.pause();
      const audio = new Audio(url);
      this.audio = audio;
      let told = false;
      const fail = () => {
        if (told || this.audio !== audio) return;
        told = true;
        new Notice("발음을 재생하지 못했습니다");
      };
      audio.addEventListener("error", fail, { once: true });
      void audio.play().catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") fail();
      });
    });
  }

  private addAnkiButton(head: HTMLElement, box: HTMLElement, entry: DictionaryEntry): void {
    const ctx = this.anki;
    if (!ctx) return;
    const btn = head.createEl("button", { cls: "ear-coach-dict-anki", text: ANKI_MESSAGES.button });
    const status = box.createDiv({ cls: "ear-coach-dict-anki-status" });
    status.style.display = "none";
    const show = (text: string, cls: string) => {
      status.setText(text);
      status.className = `ear-coach-dict-anki-status ${cls}`;
      status.style.display = "";
    };
    btn.addEventListener("click", async () => {
      const settings = ctx.settings();
      if (!ankiSettingsReady(settings)) {
        show(ANKI_MESSAGES.noSettings, "is-error");
        return;
      }
      btn.disabled = true;
      show(ANKI_MESSAGES.saving, "is-pending");
      try {
        const target = await resolveAnkiTarget(ctx.client, settings);
        if (!target.ok) {
          show(target.message, "is-error");
          btn.disabled = false;
          return;
        }
        // SPEC_017: 문장 가운데 장면 → storeMediaFile → 앞면 그림(실패면 그림 없이)
        let pictureFilename: string | null = null;
        const videoId = ctx.videoId;
        const snap = ctx.snapshot;
        if (videoId && snap) {
          const end = ctx.endSec ?? null;
          const sec = end !== null && end > ctx.startSec ? (ctx.startSec + end) / 2 : ctx.startSec;
          pictureFilename = await storeSnapshot(ctx.client, () => snap(videoId, sec), snapshotFilename(videoId, sec));
        }
        const note = buildAnkiNote(
          {
            word: entry.word,
            phonetic: entry.phonetic,
            audioUrl: entry.audioUrl,
            meanings: entry.meanings.map((m) => ({ partOfSpeech: m.partOfSpeech, definition: m.definitions[0]?.definition ?? "" })),
            sentence: ctx.sentence,
            tapped: this.rawWord,
            videoId: ctx.videoId,
            videoTitle: ctx.videoTitle,
            startSec: ctx.startSec,
            pictureFilename,
          },
          target.settings
        );
        const r = await addNoteIfNew(ctx.client, note, (n) => inlineAudio(n, ctx.fetchBytes));
        show(r === "added" && !pictureFilename ? ANKI_MESSAGES.addedNoPicture : ankiStatusMessage(r), r === "added" ? "is-ok" : "is-dup");
      } catch (e) {
        show(ankiStatusMessage(e), "is-error");
        btn.disabled = false;
      }
    });
  }

  private renderMeanings(container: HTMLElement, entry: DictionaryEntry): void {
    for (const m of entry.meanings) {
      const sec = container.createDiv({ cls: "ear-coach-dict-meaning" });
      sec.createDiv({ cls: "ear-coach-dict-pos", text: m.partOfSpeech });
      const ol = sec.createEl("ol", { cls: "ear-coach-dict-defs" });
      for (const d of m.definitions) {
        const li = ol.createEl("li", { cls: "ear-coach-dict-def" });
        li.createSpan({ text: d.definition });
        if (d.example) li.createDiv({ cls: "ear-coach-dict-example", text: `“${d.example}”` });
      }
    }
  }

  public onClose(): void {
    this.audio?.pause();
    this.audio = null;
    this.contentEl.empty();
  }
}
