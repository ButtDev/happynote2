import { App, Modal, Notice } from "obsidian";
import type { DictionaryEntry, DictionaryProvider } from "../services/dictionary";
import { normalizeLookupWord, phraseCandidates } from "../services/dictionary";

/**
 * SPEC_013: 자막 단어 사전 창 — 단어·IPA·품사별 뜻·예문·발음 듣기.
 * SPEC_014: 누른 낱말 + 뒤 낱말로 만든 구 후보 중 사전에 있는 첫 구를 맨 위 「구동사」 칸에.
 */
export class DictionaryModal extends Modal {
  private readonly word: string;
  private readonly rawWord: string;
  private readonly following: string[];
  private readonly provider: DictionaryProvider;
  private audio: HTMLAudioElement | null = null;

  constructor(app: App, rawWord: string, provider: DictionaryProvider, following: string[] = []) {
    super(app);
    this.rawWord = rawWord;
    this.word = normalizeLookupWord(rawWord) || rawWord.trim();
    this.provider = provider;
    this.following = following;
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
    const cands = phraseCandidates(this.rawWord, this.following);
    if (cands.length === 0) return null;
    const results = await Promise.all(cands.map((c) => this.provider.lookup(c).catch(() => null)));
    return results.find((r) => !!r) ?? null;
  }

  private renderPhrase(slot: HTMLElement, entry: DictionaryEntry): void {
    const box = slot.createDiv({ cls: "ear-coach-dict-phrase" });
    const head = box.createDiv({ cls: "ear-coach-dict-head" });
    head.createSpan({ cls: "ear-coach-dict-phrase-tag", text: "구동사" });
    head.createEl("h3", { cls: "ear-coach-dict-phrase-title", text: entry.word });
    if (entry.phonetic) head.createSpan({ cls: "ear-coach-dict-ipa", text: entry.phonetic });
    if (entry.audioUrl) this.addAudioButton(head, entry.audioUrl);
    this.renderMeanings(box, entry);
  }

  private renderEntry(head: HTMLElement, body: HTMLElement, entry: DictionaryEntry): void {
    if (entry.phonetic) head.createSpan({ cls: "ear-coach-dict-ipa", text: entry.phonetic });
    if (entry.audioUrl) this.addAudioButton(head, entry.audioUrl);
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
