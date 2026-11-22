import { diagnostics } from "../services/diagnostics";

/**
 * SPEC_029: 세로에서 목록 입력칸(받아쓰기)에 포커스가 가면 영상·툴바를 접고(is-typing)
 * 입력칸 카드를 목록 맨 위로 올려 키보드에 가리지 않게 한다. 포커스가 떠나면 원래대로.
 * 회차 2: 실기기에선 키보드가 뜨면 Obsidian이 앱 영역을 헤더 밑 ~30px까지 줄인다 →
 * 입력 중엔 컨테이너를 position:fixed로 띄워 헤더 아래 ~ 보이는 화면 끝을 직접 채운다.
 */
export function setupMobileTypingMode(container: HTMLElement, listWrapper: HTMLElement): () => void {
  const isText = (el: unknown): el is HTMLElement =>
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  const isPortrait = (): boolean => {
    const type = window.screen?.orientation?.type;
    return type ? type.startsWith("portrait") : window.matchMedia("(orientation: portrait)").matches;
  };
  const typingInput = (): HTMLElement | null => {
    const a = document.activeElement;
    return container.hasClass("is-typing") && isText(a) && listWrapper.contains(a) ? a : null;
  };
  let leaveTimer: number | null = null;
  const reveal = (el: HTMLElement) => {
    if (!el.isConnected || document.activeElement !== el) return;
    // 카드 머리(▶ 문장 재생)까지 보이게 카드 위쪽을 목록 위에 맞춘다
    const target = el.closest<HTMLElement>(".ear-coach-segment-card") ?? el;
    const delta = target.getBoundingClientRect().top - listWrapper.getBoundingClientRect().top - 4;
    if (Math.abs(delta) > 4) listWrapper.scrollTop += delta;
  };
  // 헤더 바로 아래 ~ 보이는 화면(visualViewport) 끝
  const place = () => {
    const vv = window.visualViewport;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const header = container
      .closest(".workspace-leaf-content")
      ?.querySelector<HTMLElement>(":scope > .view-header");
    const hb = header?.getBoundingClientRect();
    const top = hb && hb.height > 0 && hb.bottom > 0 && hb.bottom < bottom - 120 ? Math.round(hb.bottom) : 0;
    container.style.top = `${top}px`;
    container.style.height = `${Math.max(120, Math.round(bottom - top))}px`;
  };
  const unplace = () => {
    container.style.removeProperty("top");
    container.style.removeProperty("height");
  };
  // 그래도 가려지면 실기기 원인 파악용 알림(실패할 때만)
  const diagnose = (el: HTMLElement) => {
    if (typingInput() !== el) return;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const vv = window.visualViewport;
    if (hit && (hit === el || el.contains(hit)) && r.bottom <= (vv ? vv.offsetTop + vv.height : window.innerHeight)) return;
    const c = container.getBoundingClientRect();
    const chain: string[] = [];
    for (let p: HTMLElement | null = container.parentElement; p && chain.length < 6; p = p.parentElement) {
      const b = p.getBoundingClientRect();
      chain.push(`${p.className.toString().split(" ")[0] || p.tagName}:${Math.round(b.top)}/${Math.round(b.height)}`);
    }
    // SPEC_042: 알림 대신 진단 기록(🩺 진단 복사)
    diagnostics.record(
      "입력 배치",
      `가려짐 in=${window.innerHeight} vv=${Math.round(vv?.height ?? -1)}/${Math.round(vv?.offsetTop ?? -1)} ` +
        `box=${Math.round(c.top)}/${Math.round(c.height)} input=${Math.round(r.top)}-${Math.round(r.bottom)} ` +
        `hit=${hit ? `${hit.tagName}.${hit.className.toString().split(" ")[0]}` : "none"} | ${chain.join(" ")}`
    );
  };
  listWrapper.addEventListener("focusin", (ev: FocusEvent) => {
    if (!isText(ev.target)) return;
    if (leaveTimer !== null) {
      window.clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    if (!container.hasClass("is-typing") && !isPortrait()) return;
    container.addClass("is-typing");
    place();
    const el = ev.target;
    window.requestAnimationFrame(() => reveal(el));
    window.setTimeout(() => {
      place();
      reveal(el);
    }, 350);
    window.setTimeout(() => diagnose(el), 1200);
  });
  listWrapper.addEventListener("focusout", () => {
    if (leaveTimer !== null) window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      leaveTimer = null;
      const active = document.activeElement;
      if (!(isText(active) && listWrapper.contains(active))) {
        container.removeClass("is-typing");
        unplace();
      }
    }, 150);
  });
  // 키보드가 화면을 줄이면(resize) 줄어든 뒤에 자리·스크롤을 다시 맞춘다
  const onResize = () => {
    const active = typingInput();
    if (!active) return;
    place();
    window.setTimeout(() => {
      place();
      reveal(active);
    }, 50);
  };
  window.visualViewport?.addEventListener("resize", onResize);
  window.addEventListener("resize", onResize);
  return () => {
    window.visualViewport?.removeEventListener("resize", onResize);
    window.removeEventListener("resize", onResize);
  };
}
