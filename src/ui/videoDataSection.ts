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
import { addTrashRecords, emptyVideoTrash, newTrashEntries, trashStatus, VAULT_TRASH_DIR, VideoTrashStore } from "../services/videoTrash";

/** SPEC_033: 설정 화면 「🗑 저장된 영상」 — 영상마다 지우기 → 확인 창 → 볼트 휴지통으로 */
export interface VideoDataSectionOptions {
  app: App;
  store: VideoDataStore;
  dirs: VideoDataDirs;
  /** 지운 뒤(메모리 사본 비우기·열린 화면 닫기) */
  onDeleted?: (item: VideoDataItem) => void | Promise<void>;
  /** SPEC_034: 휴지통에 옮긴 파일 기록·비우기 */
  trash?: {
    store: VideoTrashStore;
    getRecorded: () => string[];
    setRecorded: (paths: string[]) => Promise<void>;
  };
}

/** 확인 창 공통: 제목·경로 목록·안내·[확인|취소] */
class ConfirmPathsModal extends Modal {
  constructor(
    app: App,
    private opts: { cls: string; title: string; paths: string[]; note?: string; okText: string; onConfirm: () => Promise<void> },
  ) {
    super(app);
  }

  onOpen(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass(this.opts.cls);
    el.createEl("h3", { text: this.opts.title });
    const ul = el.createEl("ul", { cls: "ear-coach-videodata-paths" });
    for (const p of this.opts.paths) ul.createEl("li", { text: p });
    if (this.opts.note) el.createEl("p", { text: this.opts.note, cls: "ear-coach-videodata-note" });
    const row = el.createDiv({ cls: "ear-coach-videodata-actions" });
    const ok = row.createEl("button", { text: this.opts.okText, cls: "mod-warning" });
    const cancel = row.createEl("button", { text: "취소" });
    ok.addEventListener("click", async () => {
      ok.disabled = true;
      await this.opts.onConfirm();
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
  const trashRow = opts.trash ? section.createDiv({ cls: "ear-coach-videodata-trash" }) : null;

  const renderTrash = async () => {
    if (!trashRow || !opts.trash) return;
    const t = opts.trash;
    const st = await trashStatus(t.store, t.getRecorded());
    trashRow.empty();
    const info = trashRow.createDiv({ cls: "ear-coach-videodata-info" });
    info.createDiv({ text: "🧹 휴지통 비우기", cls: "ear-coach-videodata-title" });
    info.createDiv({
      text: st.paths.length ? `Ear-Coach가 옮긴 파일 ${st.paths.length}개 · ${formatBytes(st.size)}` : "휴지통에 Ear-Coach 파일이 없어요.",
      cls: "ear-coach-videodata-meta",
    });
    const btn = trashRow.createEl("button", { text: "비우기", cls: "mod-warning" });
    btn.disabled = st.paths.length === 0;
    btn.addEventListener("click", () => {
      new ConfirmPathsModal(opts.app, {
        cls: "ear-coach-videotrash-confirm",
        title: `휴지통의 Ear-Coach 파일 ${st.paths.length}개를 영구 삭제할까요?`,
        paths: st.paths,
        note: "되돌릴 수 없어요. 다른 노트는 그대로예요.",
        okText: "영구 삭제",
        onConfirm: async () => {
          try {
            const r = await emptyVideoTrash(t.store, t.getRecorded());
            await t.setRecorded(r.remaining);
            new Notice(`🧹 파일 ${r.removed.length}개를 영구 삭제했어요`);
          } catch (e) {
            new Notice(`비우기 실패: ${String((e as Error)?.message ?? e)}`);
          }
          await renderTrash();
        },
      }).open();
    });
  };

  const refresh = async (): Promise<void> => {
    await renderTrash();
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
        new ConfirmPathsModal(opts.app, {
          cls: "ear-coach-videodata-confirm",
          title: `「${item.title}」 데이터를 지울까요?`,
          paths: item.paths,
          okText: "휴지통으로",
          onConfirm: async () => {
            try {
              const before = opts.trash ? await opts.trash.store.listFiles(VAULT_TRASH_DIR) : [];
              const done = await deleteVideoData(opts.store, item);
              if (opts.trash) {
                const after = await opts.trash.store.listFiles(VAULT_TRASH_DIR);
                await opts.trash.setRecorded(addTrashRecords(opts.trash.getRecorded(), newTrashEntries(before, after)));
              }
              await opts.onDeleted?.(item);
              new Notice(`🗑 ${item.title} — 파일 ${done.length}개를 휴지통으로 옮겼어요`);
            } catch (e) {
              new Notice(`지우기 실패: ${String((e as Error)?.message ?? e)}`);
            }
            await refresh();
          },
        }).open();
      });
    }
  };

  void refresh();
  return section;
}
