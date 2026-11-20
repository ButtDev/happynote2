#!/usr/bin/env node
// 모바일 화면 검사: 가짜 obsidian 모듈로 EarCoachView를 Chromium에 띄우고
// 뷰포트별로 영상·컨트롤·목록·overlay 좌표를 재서 보고서와 스크린샷을 남긴다.
//
// 사용: node tests/ui/runUiCheck.mjs [--fail-on-overlap] [--cases <json>] [--stub <ts>] [--css <css>] [--out <dir>]
// 종료 코드: 렌더링·측정 성공 0, 뷰가 안 뜨거나 셀렉터가 없으면 1.
//           --fail-on-overlap 이면 겹침(영상∩컨트롤/목록, overlay∩영상)이 0보다 클 때도 1.
//           cases.json 뷰포트의 expect(배치 규칙)가 하나라도 어긋나면 1.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const failOnOverlap = process.argv.includes("--fail-on-overlap");
const casesPath = path.resolve(root, arg("--cases", "tests/ui/cases.json"));
const stubPath = path.resolve(root, arg("--stub", "tests/ui/obsidianStub.ts"));
const outDir = path.resolve(root, arg("--out", ".scratch/ui"));
const cssPath = path.resolve(root, arg("--css", "styles.css"));
const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));

fs.mkdirSync(outDir, { recursive: true });

// 1. 번들 (obsidian → 가짜 모듈)
const bundle = await esbuild.build({
  entryPoints: [path.join(here, "entry.ts")],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2022",
  alias: { obsidian: stubPath },
  loader: { ".json": "json" },
  define: { __INLINE_WORKER_CODE__: '""' },
  logLevel: "silent",
});
const css = fs.readFileSync(cssPath, "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- :root·button = Obsidian 모바일 기본 테마 근사(버튼 높이 --input-height), #app 위 40px·아래 24px = 실기기 바깥 여백, .workspace-leaf transform = 모바일 탭 스와이프(fixed를 가둠) 흉내(SPEC_004) -->
<style>:root{--background-primary:#1e1e1e;--background-primary-alt:#242424;--background-secondary:#262626;--background-modifier-border:#363636;--background-modifier-form-field:#2a2a2a;--background-modifier-hover:rgba(255,255,255,.075);--interactive-accent:#8a5cf5;--text-on-accent:#fff;--text-normal:#dadada;--text-muted:#a0a0a0;--color-orange:#e9973f;--font-monospace:monospace;--input-height:40px}
button{height:var(--input-height);font:inherit;cursor:pointer}
html,body{margin:0;padding:0;height:100%;background:#1e1e1e;color:#ddd;font-family:sans-serif}
#app{position:fixed;inset:0;display:flex;flex-direction:column;box-sizing:border-box;padding:40px 0 24px 0;contain:layout}
#app>.workspace-leaf{flex:1;display:flex;flex-direction:column;min-height:0;transform:translateX(0);will-change:transform}
#app .workspace-leaf-content{flex:1;display:flex;flex-direction:column;min-height:0}
#app .view-header{flex:0 0 48px;height:48px;background:#111}
#app .view-content{flex:1;min-height:0;overflow:hidden;box-sizing:border-box}
.mobile-navbar{position:fixed;left:50%;bottom:8px;transform:translateX(-50%);width:340px;height:56px;border-radius:28px;background:#333;z-index:10}</style>
<style>${css}</style></head>
<body><div id="app"></div><div class="mobile-navbar"></div><script>${bundle.outputFiles[0].text}</script></body></html>`;
const htmlPath = path.join(outDir, "index.html");
fs.writeFileSync(htmlPath, html);

// 2. 브라우저 (설치된 Chrome 우선, 없으면 Playwright Chromium)
const { chromium } = await import("playwright");
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
} catch {
  browser = await chromium.launch({ headless: true });
}

const PLACEHOLDER_HTML =
  "<!doctype html><html><body style='margin:0;background:#000;color:#666;font:14px sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'>video placeholder</body></html>";

// cases.json 뷰포트의 expect(배치 규칙)를 측정값에 적용한다. 규칙이 없으면 빈 배열.
function evaluateExpect(vp, m, nums) {
  const e = vp.expect;
  if (!e) return [];
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok: Boolean(ok), detail });
  const right = (r) => r.x + r.w;
  const bottom = (r) => r.y + r.h;
  if (e.maxOverlapVideoControlsPx2 !== undefined)
    add("overlapVideoControls", nums.overlapVideoControlsPx2 <= e.maxOverlapVideoControlsPx2, `${nums.overlapVideoControlsPx2} <= ${e.maxOverlapVideoControlsPx2}`);
  if (e.maxOverlayOnVideoPx2 !== undefined)
    add("overlayOnVideo", nums.overlayOnVideoPx2 <= e.maxOverlayOnVideoPx2, `${nums.overlayOnVideoPx2} <= ${e.maxOverlayOnVideoPx2}`);
  for (const key of e.insideViewport ?? []) {
    const r = m[key];
    // rect는 Math.round 값이라 소수 좌표 반올림으로 1px 넘칠 수 있음 → 1px 허용
    add(`inside:${key}`, r && r.x >= -1 && r.y >= -1 && right(r) <= vp.width + 1 && bottom(r) <= vp.height + 1 && r.w > 0 && r.h > 0, JSON.stringify(r));
  }
  if (e.minCards !== undefined) add("minCards", m.cardCount >= e.minCards, `${m.cardCount} >= ${e.minCards}`);
  const v = m.video, l = m.list, t = m.toolbar;
  if (e.layout === "stacked")
    add("stacked", v && l && bottom(v) <= l.y, `video.bottom=${v && bottom(v)} list.y=${l && l.y}`);
  if (e.layout === "sideBySide") {
    add("sideBySide:list", v && l && right(v) <= l.x, `video.right=${v && right(v)} list.x=${l && l.x}`);
    add("sideBySide:toolbar", v && t && right(v) <= t.x, `video.right=${v && right(v)} toolbar.x=${t && t.x}`);
  }
  if (e.minVideoWidth !== undefined) add("minVideoWidth", v && v.w >= e.minVideoWidth, `${v && v.w} >= ${e.minVideoWidth}`);
  if (e.minVideoHeight !== undefined) add("minVideoHeight", v && v.h >= e.minVideoHeight, `${v && v.h} >= ${e.minVideoHeight}`);
  if (e.minListHeight !== undefined) add("minListHeight", l && l.h >= e.minListHeight, `${l && l.h} >= ${e.minListHeight}`);
  for (const sel of e.hidden ?? []) {
    const vis = m.visibility?.[sel];
    add(`hidden:${sel}`, vis === false, vis === null ? "element missing" : `visible=${vis}`);
  }
  for (const sel of e.visible ?? []) {
    const vis = m.visibility?.[sel];
    add(`visible:${sel}`, vis === true, vis === null ? "element missing" : `visible=${vis}`);
  }
  const r0 = m.root;
  if (e.rootFillsViewport) {
    const slackB = typeof e.rootFillsViewport === "object" ? e.rootFillsViewport.bottomSlack ?? 0 : 0;
    add("rootFillsViewport", r0 && r0.x <= 1 && r0.y <= 1 && right(r0) >= vp.width - 1 && bottom(r0) >= vp.height - 1 - slackB, `${JSON.stringify(r0)} bottomSlack=${slackB}`);
  }
  if (e.diag) {
    const dg = m.diag;
    add("diag", dg && !dg.error && dg.summary.split("\n")[0] === e.diag.title && dg.chainLen >= e.diag.minChain && dg.topHits === e.diag.topHits, dg ? JSON.stringify({ ...dg, summary: dg.summary?.split("\n").slice(0, 3).join(" / ") }) : "missing");
  }
  for (const [sel, max] of Object.entries(e.maxHeight ?? {})) {
    const r = m.extraRects?.[sel];
    add(`maxHeight:${sel}`, r && r.h > 0 && r.h <= max, r ? `${r.h} <= ${max}` : "element missing");
  }
  if (e.maxVideoSideGap !== undefined) {
    const gl = v && r0 ? v.x - r0.x : Infinity;
    const gr = v && t ? t.x - right(v) : Infinity;
    add("maxVideoSideGap", gl <= e.maxVideoSideGap && gr <= e.maxVideoSideGap, `left=${gl} right=${gr} <= ${e.maxVideoSideGap}`);
  }
  for (const sel of e.noOverflowX ?? []) {
    const o = m.overflowX?.[sel];
    add(`noOverflowX:${sel}`, o && o.scrollWidth <= o.clientWidth + 1, o ? `${o.scrollWidth} <= ${o.clientWidth}` : "element missing");
  }
  if (e.minListWidth !== undefined) add("minListWidth", l && l.w >= e.minListWidth, `${l && l.w} >= ${e.minListWidth}`);
  if (e.maxVideoTop !== undefined) add("maxVideoTop", v && v.y <= e.maxVideoTop, `${v && v.y} <= ${e.maxVideoTop}`);
  if (e.videoAspect !== undefined) {
    const ratio = v && v.h > 0 ? v.w / v.h : 0;
    const tol = e.videoAspectTolerance ?? 0.03;
    add("videoAspect", Math.abs(ratio / e.videoAspect - 1) <= tol, `${ratio.toFixed(3)} vs ${e.videoAspect.toFixed(3)} ±${tol * 100}%`);
  }
  return out;
}

const report = { generatedAt: new Date().toISOString(), failOnOverlap, viewports: [] };
const errors = [];

for (const vp of cases.viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  // 네트워크 차단: 유튜브 iframe은 같은 크기의 자리표시 문서로, 나머지는 막는다.
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("file:")) return route.continue();
    if (route.request().resourceType() === "document") {
      return route.fulfill({ status: 200, contentType: "text/html", body: PLACEHOLDER_HTML });
    }
    return route.abort();
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(pathToFileURL(htmlPath).href);
  try {
    await page.waitForFunction(() => window.__uiReady === true || typeof window.__uiError === "string", null, {
      timeout: 15000,
    });
  } catch {
    errors.push(`${vp.name}: view did not become ready`);
  }
  const uiError = await page.evaluate(() => window.__uiError ?? null);
  if (uiError) errors.push(`${vp.name}: ${uiError.split("\n")[0]}`);
  await page.waitForTimeout(1500);

  const m = await page.evaluate(({ selectors, overlayExclude }) => {
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const one = (sel) => {
      const el = document.querySelector(sel);
      return el ? rectOf(el) : null;
    };
    const missing = [];
    const video = one(selectors.video);
    if (!video) missing.push(selectors.video);
    const rootRect = one(selectors.root);
    if (!rootRect) missing.push(selectors.root);
    const list = one(selectors.list);
    if (!list) missing.push(selectors.list);
    const controlRects = [];
    for (const sel of selectors.controls) {
      const r = one(sel);
      if (!r) missing.push(sel);
      else controlRects.push({ selector: sel, ...r });
    }
    let controls = null;
    if (controlRects.length) {
      const x1 = Math.min(...controlRects.map((r) => r.x));
      const y1 = Math.min(...controlRects.map((r) => r.y));
      const x2 = Math.max(...controlRects.map((r) => r.x + r.w));
      const y2 = Math.max(...controlRects.map((r) => r.y + r.h));
      controls = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    const cardCount = document.querySelectorAll(selectors.segmentCard).length;
    let toolbar = null;
    if (selectors.toolbar) {
      toolbar = one(selectors.toolbar);
      if (!toolbar) missing.push(selectors.toolbar);
    }

    const overlays = [];
    const videoEl = document.querySelector(selectors.video);
    if (video) {
      for (const el of document.querySelectorAll("body *")) {
        // 영상을 감싸는 조상(레이아웃 컨테이너)은 overlay가 아니다.
        if (el.contains(videoEl)) continue;
        const cs = getComputedStyle(el);
        if (!["absolute", "fixed", "sticky"].includes(cs.position)) continue;
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
        if (overlayExclude.some((sel) => el.closest(sel))) continue;
        const r = rectOf(el);
        if (r.w === 0 || r.h === 0) continue;
        overlays.push({
          selector: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""),
          ...r,
        });
      }
    }
    const visibility = {};
    for (const sel of [...(selectors.__hidden ?? []), ...(selectors.__visible ?? [])]) {
      const el = document.querySelector(sel);
      if (!el) { visibility[sel] = null; continue; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      visibility[sel] = cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
    }
    const extraRects = {};
    for (const sel of selectors.__extra ?? []) extraRects[sel] = one(sel);
    const overflowX = {};
    for (const sel of selectors.__noOverflowX ?? []) {
      const el = document.querySelector(sel);
      overflowX[sel] = el ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null;
    }
    return { video, controls, controlRects, list, toolbar, root: rootRect, cardCount, overlays, missing, visibility, extraRects, overflowX };
  }, cases.selectors ? { selectors: { ...cases.selectors, __hidden: vp.expect?.hidden ?? [], __visible: vp.expect?.visible ?? [], __extra: Object.keys(vp.expect?.maxHeight ?? {}), __noOverflowX: vp.expect?.noOverflowX ?? [] }, overlayExclude: cases.overlayExclude ?? [] } : {});

  m.diag = vp.expect?.diag
    ? await page.evaluate(() => {
        try {
          return window.__layoutDiag ? window.__layoutDiag() : null;
        } catch (err) {
          return { error: String(err) };
        }
      })
    : null;

  const inter = (a, b) => {
    if (!a || !b) return 0;
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const overlapVideoControlsPx2 =
    m.controlRects.reduce((s, r) => s + inter(m.video, r), 0) + inter(m.video, m.list);
  const overlaysOnVideo = m.overlays.filter((o) => inter(m.video, o) > 0);
  const overlayOnVideoPx2 = overlaysOnVideo.reduce((s, o) => s + inter(m.video, o), 0);

  const shot = path.join(outDir, `${vp.name}.png`);
  await page.screenshot({ path: shot });

  for (const sel of m.missing) errors.push(`${vp.name}: selector not found ${sel}`);
  for (const key of ["video", "controls"]) {
    const r = m[key];
    if (r && (r.w <= 0 || r.h <= 0)) errors.push(`${vp.name}: ${key} has empty size`);
  }
  if (m.cardCount === 0) errors.push(`${vp.name}: no segment cards rendered`);
  if (failOnOverlap && (overlapVideoControlsPx2 > 0 || overlayOnVideoPx2 > 0)) {
    errors.push(`${vp.name}: overlap video/controls=${overlapVideoControlsPx2} overlayOnVideo=${overlayOnVideoPx2}`);
  }

  const checks = evaluateExpect(vp, m, { overlapVideoControlsPx2, overlayOnVideoPx2 });
  for (const c of checks) if (!c.ok) errors.push(`${vp.name}: ${c.name} failed (${c.detail})`);

  report.viewports.push({
    name: vp.name,
    width: vp.width,
    height: vp.height,
    rects: { video: m.video, controls: m.controls, controlParts: m.controlRects, toolbar: m.toolbar, list: m.list, overlays: overlaysOnVideo },
    checks,
    cardCount: m.cardCount,
    overlapVideoControlsPx2,
    overlayOnVideoPx2,
    pageErrors,
    screenshot: path.relative(root, shot),
  });
  await context.close();
}
await browser.close();

report.errors = errors;
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
for (const v of report.viewports) {
  console.log(
    `${v.name} ${v.width}x${v.height}: video=${JSON.stringify(v.rects.video)} controls=${JSON.stringify(v.rects.controls)} list=${JSON.stringify(v.rects.list)} cards=${v.cardCount} overlapVideoControlsPx2=${v.overlapVideoControlsPx2} overlayOnVideoPx2=${v.overlayOnVideoPx2}`
  );
}
if (errors.length) {
  console.log("ui-check: FAIL\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log(`ui-check: ok (report ${path.relative(root, path.join(outDir, "report.json"))})`);
