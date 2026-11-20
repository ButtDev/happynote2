/**
 * 화면 검사용 가짜 `obsidian` 모듈.
 * Obsidian 없이 Chromium에서 EarCoachView를 띄우기 위한 최소 구현만 둔다.
 * (HTMLElement 확장 메서드 createDiv/createEl/... 와 ItemView·Notice·Platform 등)
 */

type ElInfo = {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string | number | boolean>;
  type?: string;
  placeholder?: string;
  value?: string;
  href?: string;
  title?: string;
};

function applyInfo(el: HTMLElement, info?: ElInfo | string): void {
  if (!info) return;
  if (typeof info === "string") {
    el.className = info;
    return;
  }
  if (info.cls) {
    const list = Array.isArray(info.cls) ? info.cls : info.cls.split(/\s+/);
    for (const c of list) if (c) el.classList.add(c);
  }
  if (info.text !== undefined) el.textContent = info.text;
  if (info.attr) for (const [k, v] of Object.entries(info.attr)) el.setAttribute(k, String(v));
  if (info.type !== undefined) el.setAttribute("type", info.type);
  if (info.placeholder !== undefined) el.setAttribute("placeholder", info.placeholder);
  if (info.value !== undefined) (el as HTMLInputElement).value = info.value;
  if (info.href !== undefined) el.setAttribute("href", info.href);
  if (info.title !== undefined) el.setAttribute("title", info.title);
}

const proto = HTMLElement.prototype as any;
proto.createEl = function (tag: string, info?: ElInfo | string, cb?: (el: HTMLElement) => void) {
  const el = document.createElement(tag);
  applyInfo(el, info);
  this.appendChild(el);
  cb?.(el);
  return el;
};
proto.createDiv = function (info?: ElInfo | string, cb?: (el: HTMLElement) => void) {
  return this.createEl("div", info, cb);
};
proto.createSpan = function (info?: ElInfo | string, cb?: (el: HTMLElement) => void) {
  return this.createEl("span", info, cb);
};
proto.empty = function () {
  while (this.firstChild) this.removeChild(this.firstChild);
};
proto.addClass = function (...c: string[]) {
  this.classList.add(...c);
};
proto.addClasses = function (c: string[]) {
  this.classList.add(...c);
};
proto.removeClass = function (...c: string[]) {
  this.classList.remove(...c);
};
proto.toggleClass = function (c: string, value: boolean) {
  this.classList.toggle(c, value);
};
proto.hasClass = function (c: string) {
  return this.classList.contains(c);
};
proto.setText = function (t: string) {
  this.textContent = t;
};
proto.getText = function () {
  return this.textContent ?? "";
};
proto.setAttr = function (k: string, v: string) {
  this.setAttribute(k, v);
};
proto.detach = function () {
  this.remove();
};

export const Platform = { isMobile: true, isMobileApp: true, isDesktop: false, isDesktopApp: false, isAndroidApp: true };

export class Notice {
  constructor(public message: string) {
    (window as any).__notices = [...((window as any).__notices ?? []), message];
  }
  hide(): void {}
}

export class TFile {
  path = "";
  basename = "";
}

export class WorkspaceLeaf {}

export type ViewStateResult = Record<string, unknown>;

export class ItemView {
  public containerEl: HTMLElement;
  public contentEl: HTMLElement;
  public app: any;
  constructor(public leaf: any) {
    this.containerEl = document.createElement("div");
    this.containerEl.className = "workspace-leaf-content";
    const header = document.createElement("div");
    header.className = "view-header";
    this.contentEl = document.createElement("div");
    this.contentEl.className = "view-content";
    this.containerEl.append(header, this.contentEl);
    this.app = { workspace: { requestSaveLayout: () => {} } };
  }
  async setState(_state: unknown, _result: ViewStateResult): Promise<void> {}
  getState(): Record<string, unknown> {
    return {};
  }
}

export async function requestUrl(): Promise<never> {
  throw new Error("requestUrl is disabled in UI check");
}

export function setIcon(): void {}
