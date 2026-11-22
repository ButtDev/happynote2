import { App, Modal, Notice } from "obsidian";
import {
  deleteVideoData,
  formatBytes,
  formatDate,
  listVideoData,
  VideoDataDirs,
  VideoDataItem,
  VideoDataStore,
} from "../services/videoData";

/** SPEC_033: 설정 화면 「🗑 저장된 영상」 — 영상마다 지우기 → 확인 창 → 볼트 휴지통으로 */
export interface VideoDataSectionOptions {
  app: App;
  store: VideoDataStore;
  dirs: VideoDataDirs;
  /** 지운 뒤(메모리 사본 비우기·열린 화면 닫기) */
  onDeleted?: (item: VideoDataItem) => void | Promise<void>;
}

class ConfirmVideoDeleteModal extends Modal {
  constructor(
    app: App,
    private item: VideoDataItem,
    private onConfirm: () => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("ear-coach-videodata-confirm");
    el.createEl("h3", { text: `「${this.item.title}」 데이터를 지울까요?` });
    const ul = el.createEl("ul", { cls: "ear-coach-videodata-paths" });
    for (const p of this.item.paths) ul.createEl("li", { text: p });
    const row = el.createDiv({ cls: "ear-coach-videodata-actions" });
    const ok = row.createEl("button", { text: "휴지통으로", cls: "mod-warning" });
    const cancel = row.createEl("button", { text: "취소" });
    ok.addEventListener("click", async () => {
      ok.disabled = true;
      await this.onConfirm();
      this.close();
    });
    cancel.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function renderVideoDataSection(containerEl: HTMLElement, opts: VideoDataSectionOptions): HTMLElement {
  const section = containerEl.createDiv({ cls: "ear-coach-videodata" });
  section.createEl("h3", { text: "🗑 저장된 영상" });
  section.createEl("p", {
    text: "지우면 볼트 휴지통(.trash)으로 옮겨져요. Anki 카드는 그대로예요.",
    cls: "setting-item-description",
  });
  const list = section.createDiv({ cls: "ear-coach-videodata-list" });

  const refresh = async () => {
    const items = await listVideoData(opts.store, opts.dirs);
    list.empty();
    if (items.length === 0) {
      list.createEl("p", { text: "저장된 영상이 없어요.", cls: "ear-coach-videodata-empty" });
      return;
    }
    for (const item of items) {
      const row = list.createDiv({ cls: "ear-coach-videodata-row" });
      row.dataset.videoId = item.videoId;
      const info = row.createDiv({ cls: "ear-coach-videodata-info" });
      info.createDiv({ text: item.title, cls: "ear-coach-videodata-title" });
      info.createDiv({
        text: `${item.videoId} · ${formatBytes(item.size)} · ${formatDate(item.mtime)}`,
        cls: "ear-coach-videodata-meta",
      });
      const btn = row.createEl("button", { text: "지우기", cls: "mod-warning" });
      btn.addEventListener("click", () => {
        new ConfirmVideoDeleteModal(opts.app, item, async () => {
          try {
            const done = await deleteVideoData(opts.store, item);
            await opts.onDeleted?.(item);
            new Notice(`🗑 ${item.title} — 파일 ${done.length}개를 휴지통으로 옮겼어요`);
          } catch (e) {
            new Notice(`지우기 실패: ${String((e as Error)?.message ?? e)}`);
          }
          await refresh();
        }).open();
      });
    }
  };

  void refresh();
  return section;
}
