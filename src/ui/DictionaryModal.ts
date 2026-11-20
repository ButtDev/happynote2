import { App, Modal } from "obsidian";
import type { DictionaryEntry, DictionaryProvider } from "../services/dictionary";
import { normalizeLookupWord } from "../services/dictionary";

/**
 * SPEC_013: 자막 단어 사전 창 — 단어·IPA·품사별 뜻·예문·발음 듣기.
 */
export class DictionaryModal extends Modal {
  private readonly word: string;
  private readonly provider: DictionaryProvider;
  private audio: HTMLAudioElement | null = null;

  constructor(app: App, rawWord: string, provider: DictionaryProvider) {
    super(app);
    this.word = normalizeLookupWord(rawWord) || rawWord.trim();
    this.provider = provider;
  }

  public onOpen(): void {
    this.modalEl.addClass("ear-coach-dictionary-modal");
    const { contentEl } = this;
    contentEl.empty();
    const head = contentEl.createDiv({ cls: "ear-coach-dict-head" });
    head.createEl("h3", { cls: "ear-coach-dict-word", text: this.word });
    const body = contentEl.createDiv({ cls: "ear-coach-dict-body" });
    body.createDiv({ cls: "ear-coach-dict-status", text: "사전을 찾는 중…" });

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

  private renderEntry(head: HTMLElement, body: HTMLElement, entry: DictionaryEntry): void {
    if (entry.phonetic) head.createSpan({ cls: "ear-coach-dict-ipa", text: entry.phonetic });
    if (entry.audioUrl) {
      const url = entry.audioUrl;
      const btn = head.createEl("button", { cls: "ear-coach-dict-audio", text: "🔊 발음" });
      btn.addEventListener("click", () => {
        this.audio?.pause();
        this.audio = new Audio(url);
        void this.audio.play().catch(() => {});
      });
    }
    for (const m of entry.meanings) {
      const sec = body.createDiv({ cls: "ear-coach-dict-meaning" });
      sec.createDiv({ cls: "ear-coach-dict-pos", text: m.partOfSpeech });
      const ol = sec.createEl("ol", { cls: "ear-coach-dict-defs" });
      for (const d of m.definitions) {
        const li = ol.createEl("li", { cls: "ear-coach-dict-def" });
        li.createSpan({ text: d.definition });
        if (d.example) li.createDiv({ cls: "ear-coach-dict-example", text: `“${d.example}”` });
      }
    }
    body.createDiv({ cls: "ear-coach-dict-source", text: this.provider.name });
  }

  public onClose(): void {
    this.audio?.pause();
    this.audio = null;
    this.contentEl.empty();
  }
}
