/**
 * 가로 화면 진단 (SPEC_005, 임시): 실기기에서 안전 영역 env() 값, Obsidian 변수,
 * Ear-Coach 컨테이너 조상 체인, 화면 위쪽에 실제로 그려진 요소를 잰다.
 * 원인 확정 뒤 지운다. DOM 측정(collect)과 글 만들기(summarize/format)를 나눠
 * 글 만들기는 순수 함수로 시험한다.
 */

export interface DiagRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagChainItem {
  name: string;
  rect: DiagRect;
  pos: string;
  padT: string;
  padB: string;
  marT: string;
  transform: string;
  contain: string;
  containerType: string;
  z: string;
}

export interface LayoutDiag {
  viewport: { w: number; h: number; dpr: number; vvW: number; vvH: number; vvTop: number };
  env: { top: number; right: number; bottom: number; left: number };
  obsidianVars: { top: string; bottom: string };
  chain: DiagChainItem[];
  topHits: Array<{ y: number; name: string }>;
}

export const LAYOUT_DIAG_TITLE = "Ear-Coach 화면 진단";
export const LAYOUT_DIAG_NOTE_PATH = "Ear-Coach 화면 진단.md";
const TOP_PROBE_YS = [4, 20, 40, 60, 80];

function round(n: number): number {
  return Math.round(n);
}

export function describeElement(el: Element | null): string {
  if (!el) return "-";
  const cls = typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className.trim() : "";
  const parts = cls ? cls.split(/\s+/).slice(0, 3) : [];
  return el.tagName.toLowerCase() + parts.map((c) => "." + c).join("");
}

/** DOM 측정. el은 Ear-Coach 뷰 안의 아무 요소(없으면 문서에서 찾음). */
export function collectLayoutDiag(el?: HTMLElement | null): LayoutDiag {
  const doc = (el?.ownerDocument ?? document) as Document;
  const win = doc.defaultView ?? window;

  const probe = doc.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  doc.body.appendChild(probe);
  const pcs = win.getComputedStyle(probe);
  const env = {
    top: round(parseFloat(pcs.paddingTop) || 0),
    right: round(parseFloat(pcs.paddingRight) || 0),
    bottom: round(parseFloat(pcs.paddingBottom) || 0),
    left: round(parseFloat(pcs.paddingLeft) || 0),
  };
  probe.remove();

  const bcs = win.getComputedStyle(doc.body);
  const obsidianVars = {
    top: bcs.getPropertyValue("--safe-area-inset-top").trim() || "-",
    bottom: bcs.getPropertyValue("--safe-area-inset-bottom").trim() || "-",
  };

  const start =
    (el?.closest(".ear-coach-mobile-container") as HTMLElement | null) ??
    (el?.querySelector?.(".ear-coach-mobile-container") as HTMLElement | null) ??
    (doc.querySelector(".workspace-leaf.mod-active .ear-coach-mobile-container") as HTMLElement | null) ??
    (doc.querySelector(".ear-coach-mobile-container") as HTMLElement | null) ??
    el ??
    null;
  const chain: DiagChainItem[] = [];
  for (let cur: Element | null = start; cur; cur = cur.parentElement) {
    const r = cur.getBoundingClientRect();
    const cs = win.getComputedStyle(cur);
    chain.push({
      name: describeElement(cur),
      rect: { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) },
      pos: cs.position,
      padT: cs.paddingTop,
      padB: cs.paddingBottom,
      marT: cs.marginTop,
      transform: cs.transform,
      contain: cs.contain,
      containerType: cs.getPropertyValue("container-type") || "normal",
      z: cs.zIndex,
    });
  }

  const cx = win.innerWidth / 2;
  const topHits = TOP_PROBE_YS.map((y) => ({ y, name: describeElement(doc.elementFromPoint(cx, y)) }));

  const vv = win.visualViewport;
  return {
    viewport: {
      w: win.innerWidth,
      h: win.innerHeight,
      dpr: Math.round(win.devicePixelRatio * 100) / 100,
      vvW: round(vv?.width ?? win.innerWidth),
      vvH: round(vv?.height ?? win.innerHeight),
      vvTop: round(vv?.offsetTop ?? 0),
    },
    env,
    obsidianVars,
    chain,
    topHits,
  };
}

function shortName(name: string): string {
  return name.replace(/^div\./, ".").slice(0, 28);
}

/** 알림용 짧은 글(여러 줄). */
export function summarizeLayoutDiag(d: LayoutDiag): string {
  const v = d.viewport;
  const root = d.chain[0];
  const lines = [
    LAYOUT_DIAG_TITLE,
    `vp ${v.w}×${v.h} dpr ${v.dpr} vv ${v.vvW}×${v.vvH}@${v.vvTop}`,
    `env t${d.env.top} r${d.env.right} b${d.env.bottom} l${d.env.left}`,
    `obs t${d.obsidianVars.top} b${d.obsidianVars.bottom}`,
    `root y${root ? root.rect.y : "-"} h${root ? root.rect.h : "-"}`,
  ];
  // 위로 올라가며 y가 0보다 큰(위가 비는) 조상이나 transform/패딩이 있는 조상만 짧게
  const notable = d.chain
    .slice(1)
    .filter((c) => c.rect.y > 0 || c.transform !== "none" || (c.padT !== "0px" && c.padT !== ""))
    .slice(0, 4)
    .map((c) => `${shortName(c.name)} y${c.rect.y} pt${c.padT.replace("px", "")}${c.transform !== "none" ? " T" : ""}${c.pos === "fixed" ? " F" : ""}`);
  if (notable.length) lines.push(notable.join(" | "));
  lines.push(d.topHits.map((h) => `y${h.y}:${shortName(h.name)}`).join(" "));
  return lines.join("\n");
}

/** 노트 본문(전체 값). */
export function formatLayoutDiagMarkdown(d: LayoutDiag, generatedAt: string): string {
  const out: string[] = [];
  out.push(`# ${LAYOUT_DIAG_TITLE}`, "", `- 생성: ${generatedAt}`);
  out.push("", "## 요약", "", "```", summarizeLayoutDiag(d), "```");
  out.push("", "## 조상 체인 (컨테이너 → html)", "");
  out.push("| # | 요소 | rect (x,y,w,h) | position | padding-top | padding-bottom | margin-top | transform | contain | container-type | z |");
  out.push("|---|---|---|---|---|---|---|---|---|---|---|");
  d.chain.forEach((c, i) => {
    const r = c.rect;
    out.push(`| ${i} | ${c.name} | ${r.x},${r.y},${r.w},${r.h} | ${c.pos} | ${c.padT} | ${c.padB} | ${c.marT} | ${c.transform} | ${c.contain} | ${c.containerType} | ${c.z} |`);
  });
  out.push("", "## 화면 위쪽에 그려진 요소 (가운데 x)", "");
  for (const h of d.topHits) out.push(`- y=${h.y}: ${h.name}`);
  return out.join("\n") + "\n";
}
