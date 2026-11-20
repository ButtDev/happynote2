#!/usr/bin/env node
// 모바일 화면 검사: 가짜 obsidian 모듈로 EarCoachView를 Chromium에 띄우고
// 뷰포트별로 영상·컨트롤·목록·overlay 좌표를 재서 보고서와 스크린샷을 남긴다.
//
// 사용: node tests/ui/runUiCheck.mjs [--fail-on-overlap] [--cases <json>] [--stub <ts>] [--out <dir>]
// 종료 코드: 렌더링·측정 성공 0, 뷰가 안 뜨거나 셀렉터가 없으면 1.
//           --fail-on-overlap 이면 겹침(영상∩컨트롤/목록, overlay∩영상)이 0보다 클 때도 1.
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
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;padding:0;height:100%;background:#1e1e1e;color:#ddd;font-family:sans-serif}
#app{position:fixed;inset:0;display:flex;flex-direction:column}
#app>.workspace-leaf-content{flex:1;display:flex;flex-direction:column;min-height:0}
#app .view-header{display:none}
#app .view-content{flex:1;min-height:0;overflow:hidden}</style>
<style>${css}</style></head>
<body><div id="app"></div><script>${bundle.outputFiles[0].text}</script></body></html>`;
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
    return { video, controls, controlRects, list, root: rootRect, cardCount, overlays, missing };
  }, cases.selectors ? { selectors: cases.selectors, overlayExclude: cases.overlayExclude ?? [] } : {});

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

  report.viewports.push({
    name: vp.name,
    width: vp.width,
    height: vp.height,
    rects: { video: m.video, controls: m.controls, controlParts: m.controlRects, list: m.list, overlays: overlaysOnVideo },
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
