/**
 * SPEC_053 회차 2: 「공유 → Obsidian」 메뉴에 「🎧 Ear-Coach로 열기」 줄을 DOM으로 넣는다.
 * Obsidian 모바일이 `receive-text-menu` 이벤트를 부르지 않는 판(사람 실기기 11-24 NG)이 있어서,
 * Share to Save 플러그인처럼 body에 붙는 공유 메뉴(`data-section` title·options·danger)를 지켜본다.
 * obsidian import 없음 — 아이콘 그리기는 주입받는다.
 */
import { findYouTubeInShare } from "../utils/youtubeUrlParser";

/** 공유 메뉴 줄 제목 */
export const SHARE_MENU_TITLE = "🎧 Ear-Coach로 열기";
export const SHARE_ITEM_CLASS = "ear-coach-share-item";

export type ShareOpen = (url: string, timestampSeconds?: number) => void;
export type IconSetter = (el: HTMLElement, icon: string) => void;

/** 공유 메뉴 모양인가: 제목(공유 글)·고를 줄·취소 칸이 모두 있음 */
export function isShareMenu(menu: Element): boolean {
  return (
    !!menu.querySelector('[data-section="title"]') &&
    !!menu.querySelector('[data-section="options"]') &&
    !!menu.querySelector('[data-section="danger"]')
  );
}

/** 공유된 글: 제목 칸 글자 */
export function shareTextOf(menu: Element): string {
  const title = menu.querySelector('[data-section="title"] .menu-item-title') ?? menu.querySelector('[data-section="title"]');
  return title?.textContent ?? "";
}

export type ShareInjectReason = "넣음" | "이미 있음" | "유튜브 없음" | "공유 메뉴 아님";

/** SPEC_054: 진단 한 줄 쓰는 곳(주입) */
export type ShareDiagRecord = (stage: string, message: string) => void;

/** 공유 메뉴에 줄을 넣는다(유튜브 주소가 있고 아직 없을 때만). 넣었으면 true */
export function injectShareItem(menu: Element, onOpen: ShareOpen, setIcon?: IconSetter): boolean {
  return shareInjectReason(menu, onOpen, setIcon) === "넣음";
}

/** 줄 넣기를 해 보고 그 결과 이유를 돌려준다 */
export function shareInjectReason(menu: Element, onOpen: ShareOpen, setIcon?: IconSetter): ShareInjectReason {
  if (!isShareMenu(menu)) return "공유 메뉴 아님";
  const already = Array.from(menu.querySelectorAll(".menu-item-title")).some((t) => t.textContent === SHARE_MENU_TITLE);
  if (already || menu.querySelector(`.${SHARE_ITEM_CLASS}`)) return "이미 있음";
  const found = findYouTubeInShare(shareTextOf(menu));
  if (!found) return "유튜브 없음";

  const doc = menu.ownerDocument;
  const item = doc.createElement("div");
  item.className = `menu-item tappable ${SHARE_ITEM_CLASS}`;
  item.setAttribute("data-section", "options");
  const icon = doc.createElement("div");
  icon.className = "menu-item-icon";
  setIcon?.(icon, "headphones");
  const title = doc.createElement("div");
  title.className = "menu-item-title";
  title.textContent = SHARE_MENU_TITLE;
  item.append(icon, title);
  item.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    // 메뉴 닫기: 취소 줄을 누른 것처럼
    (menu.querySelector('[data-section="danger"]') as HTMLElement | null)?.click();
    onOpen(found.url, found.timestampSeconds);
  });

  // 「Add text to file」 묶음보다 위 — 첫 options 칸 앞
  const firstOption = menu.querySelector('[data-section="options"]');
  firstOption?.parentElement?.insertBefore(item, firstOption);
  return "넣음";
}

/** 진단 글: `<이유> · 묶음 <data-section 목록> · 줄 N` */
export function shareMenuDiagLine(menu: Element, reason: ShareInjectReason): string {
  const secs = Array.from(new Set(Array.from(menu.querySelectorAll("[data-section]")).map((e) => e.getAttribute("data-section"))));
  const rows = menu.querySelectorAll(".menu-item").length;
  return `${reason} · 묶음 ${secs.join(",") || "없음"} · 줄 ${rows}`;
}

/** body에 붙는 메뉴를 지켜보며 줄을 넣는다. 멈추는 함수를 돌려준다 */
export function startShareMenuObserver(doc: Document, onOpen: ShareOpen, setIcon?: IconSetter, diag?: ShareDiagRecord): () => void {
  const seen = new WeakSet<Element>();
  const tryMenus = (node: Element) => {
    const menus = node.matches(".menu") ? [node] : Array.from(node.querySelectorAll(".menu"));
    for (const m of menus) {
      const reason = shareInjectReason(m, onOpen, setIcon);
      // 공유 메뉴(또는 유튜브 글이 든 메뉴)만, 메뉴마다 한 번 — 일반 메뉴는 기록 안 함
      if (!diag || seen.has(m)) continue;
      if (reason === "공유 메뉴 아님" && !/youtu/i.test(m.textContent ?? "")) continue;
      seen.add(m);
      diag("공유 메뉴", shareMenuDiagLine(m, reason));
    }
  };
  const observer = new MutationObserver((mutations) => {
    for (const mu of mutations) {
      for (const n of Array.from(mu.addedNodes)) {
        if (n.nodeType !== 1) continue;
        const el = n as Element;
        tryMenus(el);
        // 메뉴가 먼저 붙고 줄이 나중에 채워지는 경우
        setTimeout(() => el.isConnected && tryMenus(el), 50);
      }
    }
  });
  observer.observe(doc.body, { childList: true });
  return () => observer.disconnect();
}
