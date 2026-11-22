/**
 * SPEC_035: CMUdict-lite에 없는 낱말 → dictionaryapi IPA를 ARPAbet으로 바꿔 채운다.
 * obsidian import 없음, IPA 받아 오기는 주입. 세션 동안만 기억(성공·실패 모두).
 */
import { ipaToArpabet, missingHintWords, type PronDict } from "./soundHint.ts";

export type IpaFetcher = (word: string) => Promise<string | null>;

export class PronFallback implements PronDict {
  private base: PronDict;
  private extra = new Map<string, string[] | null>();
  private pending = new Map<string, Promise<void>>();
  public fetcher: IpaFetcher | null;

  constructor(base: PronDict, fetcher: IpaFetcher | null = null) {
    this.base = base;
    this.fetcher = fetcher;
  }

  get(word: string): string[] | undefined {
    return this.base.get(word) ?? this.extra.get(word) ?? undefined;
  }

  /** 아직 시도하지 않은 없는 낱말 */
  public unknownWords(words: string[]): string[] {
    return (missingHintWords(words, this) ?? []).filter((w) => !this.extra.has(w) && !w.includes(" "));
  }

  /** 없는 낱말을 한 번씩 받아 채움. 새로 채운 낱말이 있으면 true. */
  public async ensure(words: string[]): Promise<boolean> {
    const fetcher = this.fetcher;
    if (!fetcher) return false;
    const todo = this.unknownWords(words);
    let added = false;
    await Promise.all(
      todo.map((w) => {
        let p = this.pending.get(w);
        if (!p) {
          p = (async () => {
            let arpa: string[] | null = null;
            try {
              arpa = ipaToArpabet(await fetcher(w));
            } catch {
              arpa = null;
            }
            this.extra.set(w, arpa);
            this.pending.delete(w);
          })();
          this.pending.set(w, p);
        }
        return p.then(() => {
          if (this.extra.get(w)) added = true;
        });
      })
    );
    return added;
  }
}
