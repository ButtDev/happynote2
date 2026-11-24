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
  loader: { ".json": "json", ".png": "binary", ".txt": "text", ".m4a": "binary" },
  define: { __INLINE_WORKER_CODE__: '""' },
  logLevel: "silent",
});
const css = fs.readFileSync(cssPath, "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- :root·button = Obsidian 모바일 기본 테마 근사(버튼 높이 --input-height), #app 위 40px·아래 24px = 실기기 바깥 여백, .workspace-leaf transform = 모바일 탭 스와이프(fixed를 가둠) 흉내(SPEC_004), --safe-area-inset 30/15·가로 leaf-content 위 82px = 1.0.6 실기기 진단 값(SPEC_006), .modal = Obsidian 폰 모달(아래 시트) 근사(SPEC_013) -->
<style>:root{--background-primary:#1e1e1e;--background-primary-alt:#242424;--background-secondary:#262626;--background-modifier-border:#363636;--background-modifier-form-field:#2a2a2a;--background-modifier-hover:rgba(255,255,255,.075);--interactive-accent:#8a5cf5;--text-on-accent:#fff;--text-normal:#dadada;--text-muted:#a0a0a0;--color-orange:#e9973f;--color-yellow:#e0de71;--color-red:#fb464c;--font-monospace:monospace;--input-height:40px;--safe-area-inset-top:30px;--safe-area-inset-bottom:15px}
@media (orientation:landscape){#app .workspace-leaf-content{padding-top:82px;box-sizing:border-box}}
button{height:var(--input-height);font:inherit;cursor:pointer}
html,body{margin:0;padding:0;height:100%;background:#1e1e1e;color:#ddd;font-family:sans-serif}
#app{position:fixed;inset:0;display:flex;flex-direction:column;box-sizing:border-box;padding:40px 0 24px 0;contain:layout}
#app>.workspace-leaf{flex:1;display:flex;flex-direction:column;min-height:0;transform:translateX(0);will-change:transform}
#app .workspace-leaf-content{flex:1;display:flex;flex-direction:column;min-height:0}
#app .view-header{flex:0 0 48px;height:48px;background:#111}
#app .view-content{flex:1;min-height:0;overflow:hidden;box-sizing:border-box}
.mobile-navbar{position:fixed;left:50%;bottom:8px;transform:translateX(-50%);width:340px;height:56px;border-radius:28px;background:#333;z-index:10}
.modal-container{position:fixed;inset:0;z-index:40;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55)}
.modal{position:relative;box-sizing:border-box;width:100%;max-height:85vh;overflow:auto;padding:16px;border-radius:12px 12px 0 0;background:var(--background-primary);border:1px solid var(--background-modifier-border)}</style>
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
    const topY = typeof e.rootFillsViewport === "object" ? e.rootFillsViewport.top ?? 0 : 0;
    add("rootFillsViewport", r0 && r0.x <= 1 && Math.abs(r0.y - topY) <= 1 && right(r0) >= vp.width - 1 && bottom(r0) >= vp.height - 1 - slackB, `${JSON.stringify(r0)} top=${topY} bottomSlack=${slackB}`);
  }
  if (e.dictionary) {
    const d = m.dictionary;
    const want = d && d.tapped ? d.tapped.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "").replace(/^'+|'+$/g, "").replace(/'s$/, "") : null;
    add("dictionary", !!d && !d.error && d.words >= d.tokens && d.modal && d.title === want && d.defs >= e.dictionary.minDefs && !!d.ipa && d.audioBtn && d.pauseCalls === 1, JSON.stringify(d));
  }
  if (e.phraseBefore) {
    const p = m.phraseBefore;
    add("phraseBefore", !!p && !p.error && p.modal && p.phraseTitle === e.phraseBefore.title && p.phraseDefs >= 1 && p.word === e.phraseBefore.tap.toLowerCase() && p.phraseAboveWord, JSON.stringify(p));
  }
  if (e.phrase) {
    const p = m.phrase;
    add("phrase", !!p && !p.error && p.modal && p.phraseTitle === e.phrase.title && p.tag === null && p.tagText === false && p.phraseDefs >= 1 && p.word === e.phrase.tap.toLowerCase() && p.phraseAboveWord && m.dictionary?.phraseOnFirst === false, JSON.stringify({ ...p, phraseOnFirst: m.dictionary?.phraseOnFirst }));
  }
  if (e.anki) {
    const a = m.anki?.added;
    const d = m.anki?.dup;
    // SPEC_017: 장면 그림 — storeMediaFile 뒤 Front에 <img>, 풀면 칸 크기·기대 칸 색
    const pe = e.anki.picture;
    const pic = a?.picture;
    const okPicture = !!pe && !!pic && !pic.error && pic.filename === pe.filename && pic.w === pe.width && pic.h === pe.height && pic.rgb.every((v, i) => Math.abs(v - pe.rgb[i]) <= 24) && a.sbUrls?.length === 1 && a.sbUrls[0].includes(pe.sheet) && (a.note?.fields?.Front ?? "").includes(`<img src="${pe.filename}">`);
    const okAdded = !!a && !a.error && a.phraseBtn === "➕ Anki" && a.wordBtn === "➕ Anki" && JSON.stringify(a.calls) === JSON.stringify(["deckNames", "modelNames", "modelFieldNames", "storeMediaFile", "canAddNotes", "addNote"]) && a.status === "Anki에 저장했어요" && a.note?.deckName === "happynote2" && a.note?.options?.allowDuplicate === false && a.note?.audio?.[0]?.data === "AQID" && !("url" in a.note.audio[0]) && okPicture;
    const okDup = !!d && !d.error && JSON.stringify(d.calls) === JSON.stringify(["deckNames", "modelNames", "modelFieldNames", "storeMediaFile", "canAddNotes"]) && d.status === "이미 Anki에 있는 카드예요";
    const np = m.anki?.noPic;
    const okNoPic = !!np && !np.error && JSON.stringify(np.calls) === JSON.stringify(["deckNames", "modelNames", "modelFieldNames", "canAddNotes", "addNote"]) && np.status === "Anki에 저장했어요 (그림 없음)" && !(np.note?.fields?.Front ?? "").includes("<img");
    const n = m.anki?.noDeck;
    const okNoDeck = !!n && !n.error && JSON.stringify(n.calls) === JSON.stringify(["deckNames"]) && n.status === "Anki에 「happynote2」 덱이 없어요 — AnkiDroid에서 「happynote2」 덱을 만들거나 설정에서 「덱·노트 타입 불러오기」로 골라 주세요";
    // SPEC_025: 앞면 뜻은 하나(<i>품사</i> 한 번) — 고른 뜻(added) / 안 고르면 첫 뜻(noPic)
    const meaningCount = (note) => ((note?.fields?.Front ?? "").match(/<i>/g) ?? []).length;
    const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const ce = e.anki.chooseDef;
    const okChosen = ce === undefined || (!!a?.chosen && a.chosen.chosenCount === 1 && a.chosen.onTarget && a.chosen.text !== a.firstDef && meaningCount(a.note) === 1 && (a.note?.fields?.Front ?? "").includes(esc(a.chosen.text)) && !(a.note?.fields?.Front ?? "").includes(esc(a.firstDef)));
    const okDefault = ce === undefined || (!!np?.note && meaningCount(np.note) === 1 && (np.note.fields.Front ?? "").includes(esc(np.firstDef)));
    add("anki", okAdded && okDup && okNoDeck && okNoPic && okChosen && okDefault, JSON.stringify({ okAdded, okPicture, okDup, okNoDeck, okNoPic, okChosen, okDefault, ...m.anki }));
  }
  if (e.reviewQueue) {
    const r = m.reviewQueue;
    const ok = !!r && !r.error && r.pinned >= 2 && r.due.length === r.pinned - 1 && r.label === `⏰ ${r.due.length}` && JSON.stringify(r.shown) === JSON.stringify(r.due) && r.blind && Array.isArray(r.reviews) && r.reviews.length === 1 && r.reviews[0].ok === false;
    add("reviewQueue", ok, JSON.stringify(r));
  }
  if (e.todaySentences) {
    const t = m.todaySentences;
    const ok = !!t && !t.error && t.banner === "☀️ 오늘의 문장 2개" && t.due === "⏰ 2" && t.bannerTop && t.bannerInside && t.overflow <= 0
      && JSON.stringify(t.shown) === JSON.stringify(t.expected) && t.blind && t.active === "DUE" && t.afterStart.banner === null
      && t.backAll.banner === "☀️ 오늘의 문장 2개" && t.empty.banner === null && t.empty.due === null
      && t.again.banner === "☀️ 오늘의 문장 2개" && t.closed.banner === null && t.closed.due === "⏰ 2"
      && t.closedH > 0 && t.closedH <= e.todaySentences.toolbarMaxH;
    add("todaySentences", ok, JSON.stringify(t));
  }
  if (e.quiz) {
    const q = m.quiz;
    const ok = !!q && !q.error && q.start.warmup?.startsWith("☀️ 오늘의 문장") && q.afterClose.banner === "🎧 어제 본 영상 퀴즈 3문제"
      && q.afterClose.overflow <= 0 && q.afterClose.h <= e.quiz.toolbarMaxH && q.titles.join("|") === "🎧 퀴즈 1/3|🎧 퀴즈 2/3|🎧 퀴즈 3/3"
      && q.play1 === "▶ 듣기" && q.verdict1.startsWith("맞혔어요") && q.verdict2.startsWith("아쉬워요") && q.miss2 > 0
      && q.play3 === "원음을 못 받았어요 — 건너뛸게요" && q.result === "2문제 중 1개 맞힘"
      && JSON.stringify(q.records) === JSON.stringify([[q.videoId, 2, 1]]) && q.clipCalls === 3
      && q.afterDone.banner === null && q.modalOverflow <= 0;
    add("quiz", ok, JSON.stringify(q));
  }
  if (e.blankRecord) {
    const b = m.blankRecord;
    const w = b?.want;
    const ok = !!b && !b.error && b.recs.length === 2 && b.recs.every((r) => r.videoId === w.videoId && r.start === w.start && r.word === w.word) && b.recs[0].ok === false && b.recs[1].ok === true;
    add("blankRecord", ok, JSON.stringify(b));
  }
  // SPEC_026: 핀 카드에만 「➕ Anki」 → 문장 듣기 카드 addNote 1회
  // SPEC_031: 정답 단계 「🔊 발음 포인트」 = 계산한 [한글] /IPA/
  if (e.soundHintStep3) {
    const ph = m.dictionary?.phonetic ?? "";
    // SPEC_032: 힌트 앞에 덩어리 영어 「<낱말> → 」
    add("soundHintStep3", /^🔊 발음 포인트: [A-Za-z'][A-Za-z' ,.?!]* → \[[가-힣 ]+\] \/[^/]+\/ — /.test(ph), JSON.stringify(ph));
    const ph2 = m.dictionary?.phonetic2 ?? "";
    add("soundHintStep2NoChunk", /^🔊 실제 발음 힌트: \[[가-힣 ]+\] \/[^/]+\/$/.test(ph2), JSON.stringify(ph2));
  }
  // SPEC_031: 문장 카드 앞면 Hint엔 한글 소리 없음, 뒷면 Source 맨 앞에 🔊 [한글] /IPA/
  if (e.sentenceAnki?.soundOnBack) {
    const f = m.sentenceAnki?.note?.fields ?? {};
    const ok = !String(f.Hint ?? "").includes("[") && /^🔊 [A-Za-z'][A-Za-z' ,.?!]* → \[[가-힣 ]+\] \/[^/]+\/<br><a /.test(String(f.Source ?? ""));
    add("sentenceAnki.soundOnBack", ok, JSON.stringify({ Hint: f.Hint, Source: f.Source }));
  }
  if (e.sentenceAnki) {
    const sa = m.sentenceAnki;
    const n = sa?.note;
    const ok = !!sa && !sa.error && sa.inside === true && sa.pinned >= 1 && sa.btnOnPinned === sa.pinned && sa.btnOnUnpinned === 0 && JSON.stringify(sa.calls) === JSON.stringify(["deckNames", "modelNames", "modelFieldNames", "storeMediaFile", "storeMediaFile", "canAddNotes", "addNote"]) && n?.modelName === e.sentenceAnki.modelName && n?.deckName === "happynote2" && n?.fields?.Sentence === sa.text && /^\[sound:happynote2_[^\]]+\.wav\]<img /.test(n?.fields?.Picture ?? "") && n?.tags?.includes("sentence") && sa.notice === "Anki에 저장했어요";
    add("sentenceAnki", ok, JSON.stringify(sa));
    // SPEC_036: 원음 — storeMediaFile(.wav, WAV base64)이 canAddNotes 앞, 원음 실패면 addNote 0회 + 문구
    const media = sa?.media ?? [];
    const wav = media.find((x) => /\.wav$/.test(x?.filename ?? ""));
    add("sentenceAnki.audio", !!wav && String(wav.data ?? "").startsWith("UklGR") && (n?.fields?.Picture ?? "").includes(`[sound:${wav.filename}]`) && sa.clipArgs?.length === 1, JSON.stringify({ media: media.map((x) => x.filename), clipArgs: sa?.clipArgs }));
    const fa = sa?.fail;
    add("sentenceAnki.noAudio", !!fa && JSON.stringify(fa.calls) === JSON.stringify(["deckNames", "modelNames", "modelFieldNames"]) && fa.notes === 0 && fa.notice === "원음을 받지 못해 저장하지 않았어요", JSON.stringify(fa));
    // SPEC_042: 「다시」 버튼 1개·글·누르면 닫힘 + Anki 호출 다시 + 같은 알림 다시
    const rt = sa?.retry;
    add("sentenceAnki.retry", !!rt && JSON.stringify(rt.buttons) === JSON.stringify(["다시"]) && rt.text === "원음을 받지 못해 저장하지 않았어요" && rt.closed === true && rt.callsAfter?.length > 0 && rt.newNotice?.includes("원음을 받지 못해 저장하지 않았어요"), JSON.stringify(rt));
    // SPEC_036: Chrome에서 실제 조각 디코드 → 창 길이 ±0.05초
    const dc = sa?.decode;
    const lm = sa?.limited;
    add("sentenceAnki.limited", !!lm && JSON.stringify(lm.calls) === JSON.stringify(["deckNames", "modelNames", "modelFieldNames"]) && lm.notes === 0 && lm.notice === "이 영상은 유튜브가 앞부분 1분 정도만 받게 해 줘서 원음을 못 받아요 — 저장하지 않았어요" && Array.isArray(lm.buttons) && lm.buttons.length === 0, JSON.stringify(lm));
    add("sentenceAnki.decode", !!dc && !dc.error && Math.abs(dc.sec - dc.want) <= 0.05 && dc.peak > 0.01 && dc.wavHead === "RIFF", JSON.stringify(dc));
  }
  for (const [sel, max] of Object.entries(e.maxHeight ?? {})) {
    const r = m.extraRects?.[sel];
    add(`maxHeight:${sel}`, r && r.h > 0 && r.h <= max, r ? `${r.h} <= ${max}` : "element missing");
  }
  if (e.maxVideoSideGap !== undefined) {
    const gl = v && r0 ? v.x - r0.x : Infinity;
    // SPEC_011: 가로 조절 막대가 있으면 영상 열의 오른쪽 끝 = 막대 왼쪽(막대 자체는 의도된 칸)
    const barX = m.landscapeResizer?.before?.bar?.x;
    const gr = v && t ? (barX ?? t.x) - right(v) : Infinity;
    add("maxVideoSideGap", gl <= e.maxVideoSideGap && gr <= e.maxVideoSideGap, `left=${gl} right=${gr} <= ${e.maxVideoSideGap}`);
  }
  for (const sel of e.noOverflowX ?? []) {
    const o = m.overflowX?.[sel];
    add(`noOverflowX:${sel}`, o && o.scrollWidth <= o.clientWidth + 1, o ? `${o.scrollWidth} <= ${o.clientWidth}` : "element missing");
  }
  if (e.cardPitchMax !== undefined) add("cardPitchMax", m.cardPitch !== null && m.cardPitch <= e.cardPitchMax, `cardPitch=${m.cardPitch} <= ${e.cardPitchMax}`);
  if (e.rowSlack) {
    const rsl = m.rowSlack;
    add(`rowSlack:${e.rowSlack.selector}`, !!rsl && rsl.oneRow && rsl.slack >= e.rowSlack.min, rsl ? `oneRow=${rsl.oneRow} slack=${rsl.slack} >= ${e.rowSlack.min} last=${JSON.stringify(rsl.lastText)}` : "element missing");
  }
  for (const [sel, min] of Object.entries(e.minRadius ?? {})) {
    const r = m.radii?.[sel];
    add(`minRadius:${sel}`, typeof r === "number" && r >= min, r === null || r === undefined ? "element missing" : `${r} >= ${min}`);
  }
  if (e.minListWidth !== undefined) add("minListWidth", l && l.w >= e.minListWidth, `${l && l.w} >= ${e.minListWidth}`);
  if (e.maxVideoTop !== undefined) add("maxVideoTop", v && v.y <= e.maxVideoTop, `${v && v.y} <= ${e.maxVideoTop}`);
  if (e.activeCardNoShift !== undefined) {
    add("activeCardNoShift", m.activeShift !== null && m.activeShift <= e.activeCardNoShift, `shift=${m.activeShift} <= ${e.activeCardNoShift}`);
  }
  if (e.sameHeight) {
    const hs = e.sameHeight.map((sel) => m.heights?.[sel]);
    const ok = hs.every((h) => typeof h === "number" && h > 0) && Math.max(...hs) - Math.min(...hs) <= 1;
    add("sameHeight", ok, JSON.stringify(m.heights));
  }
  if (e.videoCrop !== undefined) {
    const p = m.player;
    const ok = p && v && v.y - p.y >= e.videoCrop && bottom(p) - bottom(v) >= e.videoCrop && p.x === v.x && p.w === v.w;
    add("videoCrop", ok, `player=${JSON.stringify(p)} box=${JSON.stringify(v)} >= ${e.videoCrop}`);
  }
  if (e.overlayToggle !== undefined) {
    const t = m.overlayToggle;
    const crop = (x) => x && x.box && x.player ? x.box.y - x.player.y : null;
    const ok =
      t && t.on && t.off &&
      t.on.active === true && crop(t.on) === 0 && t.on.player.h === t.on.box.h && !String(t.on.src).includes("controls=0") &&
      t.off.active === false && crop(t.off) >= (e.videoCrop ?? 40) && String(t.off.src).includes("controls=0");
    add("overlayToggle", !!ok, JSON.stringify(t));
  }
  if (e.landscapeResizer !== undefined) {
    const z = m.landscapeResizer;
    const ok = z && !z.error && z.before.bar.w >= 10 && z.before.bar.h >= 200 && z.before.barVisible &&
      z.after.listW - z.before.listW >= 100 &&
      Math.abs(z.after.videoW / z.after.videoH - 16 / 9) <= 16 / 9 * 0.03 &&
      z.after.saved !== 58 && String(z.after.saved) === z.after.cssVar && z.after.controlsOverflowX <= 1 &&
      z.reset.saved === 58 && z.reset.listW === z.before.listW;
    add("landscapeResizer", !!ok, JSON.stringify(z));
  }
  if (e.loopCycle) {
    const z = m.loopCycle;
    const st = z?.steps ?? [];
    const ok = z && !z.error && st.length === 3 &&
      st[0].text === "🔂 ∞" && st[0].active && JSON.stringify(st[0].loopingCards) === JSON.stringify([z.target]) &&
      st[1].text === `🔂 ×${e.loopCycle.count}` && st[1].active && JSON.stringify(st[1].loopingCards) === JSON.stringify([z.target]) &&
      st[2].text === "🔁 OFF" && !st[2].active && st[2].loopingCards.length === 0;
    add("loopCycle", !!ok, JSON.stringify(z));
  }
  if (e.shadowing) {
    const z = m.shadowing;
    const d = z?.denied;
    const ok = z && !z.error && JSON.stringify(z.recInLow) === "[0,0]" && z.recCount === 1 && z.idleText === "🎙" && z.idleAria === "따라 말하기 녹음" &&
      !z.cmpBefore && /^⏹ \d+$/.test(z.recText ?? "") && z.recorders === 1 && z.mime === "audio/webm;codecs=opus" &&
      z.autoStopMs !== null && Math.abs(z.autoStopMs - z.limit * 1000) <= 400 && z.afterText === "🎙" && z.cmpShown && z.cmpText === "🔁 비교" &&
      z.trackStops >= 1 && z.overflow.card <= 1 && z.overflow.row <= 1 &&
      JSON.stringify(z.origCalls) === JSON.stringify([[z.index, false]]) && z.audioPlays === 1 && JSON.stringify(z.order) === JSON.stringify(["playSegment", "audio.play"]) &&
      z.gapMs !== null && Math.abs(z.gapMs - (z.duration + 0.3) * 1000) <= 400;
    add("shadowing", !!ok, JSON.stringify({ ...z, denied: undefined, evs: undefined }));
    const okDenied = !!d && d.notices.length === 1 && d.notices[0].includes("마이크 권한") && !d.notices[0].includes("니다") && d.recorders === 0 && d.text === "🎙" && !!d.diag?.includes("shadow.record");
    add("shadowing.denied", okDenied, JSON.stringify(d));
  }
  if (e.resume) {
    const r = m.resume;
    const okRestore = r && !r.error && r.restore.seeks === 1 && r.restore.visible && r.restore.notices.length === 1 &&
      r.restore.notices[0] === `⏩ 지난번 ${r.label}부터 이어요` && !r.restore.notices[0].includes("니다") &&
      r.focus.seeks === 0 && r.focus.notices.length === 0 && r.none.seeks === 0 && r.none.notices.length === 0;
    add("resume", !!okRestore, JSON.stringify({ ...r, save: undefined }));
    const sv = r?.save;
    const okSave = !!sv && !sv.error && sv.during.length >= 2 && sv.during.length <= 3 && sv.afterPause.length === 1 &&
      [...sv.during, ...sv.afterPause].every((x) => x[0] === r.videoId && x[2] !== null && Math.abs(x[1] - x[2]) <= 1) &&
      sv.during.every((x, i) => i === 0 || x[1] - sv.during[i - 1][1] >= 10 - 1);
    add("resume.save", okSave, JSON.stringify(sv));
  }
  if (e.karaoke) {
    const k = m.karaoke;
    const ok = k && !k.error && k.first.length === 1 && k.first[0].wi === 1 && k.first[0].text === k.words[1] &&
      k.last.length === 1 && k.last[0].wi === k.n - 1 && k.last[0].text === k.words[k.n - 1] &&
      k.away === 0 && Math.abs(k.h1 - k.h0) <= 0.5;
    add("karaoke", !!ok, JSON.stringify(k));
  }
  if (e.follow) {
    const f = m.follow;
    const ok = f && !f.error && f.pressedBefore === "true" && f.top1 > f.top0 + 50 && f.lastVisible &&
      f.pressedAfter === "false" && f.saved === false && Math.abs(f.top2 - f.top1) <= 1 &&
      f.loopFollow && JSON.stringify(f.loopFollow.loopHi) === JSON.stringify([f.loopFollow.k]) &&
      JSON.stringify(f.loopFollow.pastEndHi) === JSON.stringify([f.loopFollow.k]) && Math.abs(f.loopFollow.pastEndTop - f.loopFollow.loopTop) <= 1 &&
      JSON.stringify(f.loopFollow.offHi) === JSON.stringify([f.loopFollow.k + 1]);
    add("follow", !!ok, JSON.stringify(f));
  }
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
    // SPEC_007: 첫 카드에 활성 표시를 붙였다 뗄 때 시간 버튼 x 이동량
    let activeShift = null;
    const card0 = document.querySelector(selectors.segmentCard + ".ear-coach-segment-card") ?? document.querySelector(".ear-coach-segment-card");
    const probe = card0?.querySelector(".ear-coach-time-btn");
    if (card0 && probe) {
      const had = card0.classList.contains("is-active-playing");
      card0.classList.remove("is-active-playing");
      const x0 = probe.getBoundingClientRect().x;
      card0.classList.add("is-active-playing");
      const x1 = probe.getBoundingClientRect().x;
      if (!had) card0.classList.remove("is-active-playing");
      activeShift = Math.abs(x1 - x0);
    }
    const heights = {};
    for (const sel of selectors.__sameHeight ?? []) {
      const el = document.querySelector(sel);
      heights[sel] = el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null;
    }
    // SPEC_024: 컨트롤 줄 — 모든 자식이 한 줄인지, 마지막 자식(시각) 앞 빈 폭
    let rowSlack = null;
    if (selectors.__rowSlack) {
      const row = document.querySelector(selectors.__rowSlack);
      const kids = row ? [...row.children].filter((k) => k.getBoundingClientRect().width > 0) : [];
      if (kids.length >= 2) {
        const rs = kids.map((k) => k.getBoundingClientRect());
        const oneRow = rs.every((r) => Math.abs((r.top + r.bottom) / 2 - (rs[0].top + rs[0].bottom) / 2) <= 4);
        const last = rs[rs.length - 1], prev = rs[rs.length - 2];
        rowSlack = { oneRow, slack: Math.round(last.left - prev.right), lastText: kids[kids.length - 1].textContent };
      }
    }
    // SPEC_028: 카드 간격(목록 안 이웃 카드 위끝 차이 중 최대, 맨 끝 카드 제외 없음)
    const cardTops = [...document.querySelectorAll(".ear-coach-segment-card")].map((c) => c.getBoundingClientRect().top).sort((a, b) => a - b);
    let cardPitch = null;
    for (let i = 1; i < cardTops.length; i++) cardPitch = Math.max(cardPitch ?? 0, Math.round(cardTops[i] - cardTops[i - 1]));
    // SPEC_024: 첫 요소의 계산된 border-top-left-radius(px)
    const radii = {};
    for (const sel of selectors.__minRadius ?? []) {
      const el = document.querySelector(sel);
      radii[sel] = el ? parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 : null;
    }
    // SPEC_007: 플레이어 요소(유튜브 iframe/자리)와 영상 상자
    const playerEl = videoEl?.querySelector(':scope > [id^="ear-coach-player-"]');
    const player = playerEl ? rectOf(playerEl) : null;
    return { video, controls, controlRects, list, toolbar, root: rootRect, cardCount, overlays, missing, visibility, extraRects, overflowX, activeShift, heights, radii, rowSlack, player, cardPitch };
  }, cases.selectors ? { selectors: { ...cases.selectors, __hidden: vp.expect?.hidden ?? [], __visible: vp.expect?.visible ?? [], __extra: Object.keys(vp.expect?.maxHeight ?? {}), __noOverflowX: vp.expect?.noOverflowX ?? [], __sameHeight: vp.expect?.sameHeight ?? [], __minRadius: Object.keys(vp.expect?.minRadius ?? {}), __rowSlack: vp.expect?.rowSlack?.selector ?? null }, overlayExclude: cases.overlayExclude ?? [] } : {});

  // SPEC_009: YT 버튼을 누르면 플레이어를 다시 만들고 자르기를 푼다, 다시 누르면 원래대로.
  m.overlayToggle = null;
  if (vp.expect?.overlayToggle) {
    const measure = () =>
      page.evaluate((btnSel) => {
        const box = document.querySelector(".ear-coach-video-box");
        const pl = box?.querySelector(':scope > [id^="ear-coach-player-"]');
        const btn = document.querySelector(btnSel);
        const r = (el) => {
          const b = el.getBoundingClientRect();
          return { y: Math.round(b.y), h: Math.round(b.height) };
        };
        return {
          box: box ? r(box) : null,
          player: pl ? r(pl) : null,
          tag: pl ? pl.tagName.toLowerCase() : null,
          src: pl?.getAttribute("src") ?? pl?.querySelector("iframe")?.getAttribute("src") ?? null,
          active: btn ? btn.classList.contains("is-active") : null,
        };
      }, vp.expect.overlayToggle);
    const btn = page.locator(vp.expect.overlayToggle).first();
    if ((await btn.count()) === 0) {
      m.overlayToggle = { error: "button missing" };
    } else {
      await btn.click();
      await page.waitForTimeout(800);
      const on = await measure();
      await btn.click();
      await page.waitForTimeout(800);
      const off = await measure();
      m.overlayToggle = { on, off };
    }
  }

  // SPEC_011: 가로 좌우 비율 조절 바 — 막대를 왼쪽으로 150px 끌어 목록이 넓어지고 값이 저장되는지
  m.landscapeResizer = null;
  if (vp.expect?.landscapeResizer) {
    const snap = () =>
      page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const rr = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
        const bar = q(".ear-coach-mobile-resizer"), list = q(".ear-coach-mobile-list-wrapper"), video = q(".ear-coach-video-box");
        if (!bar || !list || !video) return { error: "element missing" };
        const cs = getComputedStyle(bar);
        const v = rr(video);
        return {
          bar: rr(bar), barVisible: cs.display !== "none" && cs.visibility !== "hidden",
          listW: rr(list).w, videoW: v.w, videoH: v.h,
          saved: window.__earCoachSettings?.mobileLandscapeLeftPercent,
          controlsOverflowX: (() => { const c = q(".ear-coach-player-controls"); return c ? c.scrollWidth - c.clientWidth : null; })(),
          cssVar: q(".ear-coach-mobile-container").style.getPropertyValue("--ear-coach-landscape-left"),
        };
      });
    const before = await snap();
    if (before.error) m.landscapeResizer = before;
    else {
      // 합성 포인터 이벤트(모바일 컨텍스트에선 page.mouse가 막대에 안 닿음)
      await page.evaluate(async ({ cx, cy }) => {
        const bar = document.querySelector(".ear-coach-mobile-resizer");
        const ev = (type, x) => bar.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", clientX: x, clientY: cy }));
        const frame = () => new Promise((res) => requestAnimationFrame(() => res()));
        ev("pointerdown", cx);
        for (let i = 1; i <= 6; i++) { ev("pointermove", cx - 25 * i); await frame(); await frame(); }
        ev("pointerup", cx - 150);
        await new Promise((res) => setTimeout(res, 100));
      }, { cx: before.bar.x + before.bar.w / 2, cy: before.bar.y + before.bar.h / 2 });
      const after = await snap();
      await page.screenshot({ path: path.join(outDir, `${vp.name}-resized.png`) });
      // 두 번 눌러 기본(58)으로 → 이후 스크린샷·측정은 기본 배치
      await page.evaluate(() => document.querySelector(".ear-coach-mobile-resizer").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
      await page.waitForTimeout(150);
      m.landscapeResizer = { before, after, reset: await snap() };
    }
  }

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

  // SPEC_023: 반복 버튼 순환(지금 재생 위치 기준) — 3번째 문장 안으로 시각을 두고 세 번 누른다.
  m.loopCycle = null;
  if (vp.expect?.loopCycle) {
    m.loopCycle = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const view = window.__earCoachView;
      const segs = view?.session?.segments ?? [];
      const btn = document.querySelector(".ear-coach-loop-btn");
      if (!view || segs.length < 3 || !btn) return { error: "view/segments/button missing" };
      const prevFollow = window.__earCoachSettings.autoFollowPlayback;
      window.__earCoachSettings.autoFollowPlayback = false; // 스크롤 없이 3번째 카드가 화면에 있게
      const target = segs[2];
      view.playerBar.seekTo((target.start + target.end) / 2);
      await wait(250);
      const state = () => ({
        text: btn.textContent,
        active: btn.classList.contains("is-loop-active"),
        loopingCards: [...document.querySelectorAll(".ear-coach-segment-card")]
          .filter((c) => c.querySelector(".is-loop-active-btn"))
          .map((c) => Number(c.getAttribute("data-segment-index"))),
      });
      const steps = [];
      for (let i = 0; i < 3; i++) {
        btn.click();
        await wait(150);
        steps.push(state());
      }
      window.__earCoachSettings.autoFollowPlayback = prevFollow;
      return { target: target.index, steps };
    });
  }

  // SPEC_023: 자동 따라가기 — 켜짐에서 마지막 문장으로 → 목록이 내려감, 끄고 첫 문장으로 → 그대로.
  m.follow = null;
  if (vp.expect?.follow) {
    m.follow = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const view = window.__earCoachView;
      const segs = view?.session?.segments ?? [];
      const btn = document.querySelector(".ear-coach-follow-btn");
      const scroller = [...document.querySelectorAll(".ear-coach-mobile-list-wrapper, .ear-coach-mobile-list-wrapper *")].find((el) => el.scrollHeight > el.clientHeight + 10 && getComputedStyle(el).overflowY !== "visible");
      if (!view || !btn || !scroller || segs.length < 4) return { error: "view/button/scroller missing" };
      const pressedBefore = btn.getAttribute("aria-pressed");
      const last = segs[segs.length - 1];
      const top0 = scroller.scrollTop;
      view.playerBar.seekTo((last.start + last.end) / 2);
      await wait(3000);
      const top1 = scroller.scrollTop;
      const card = document.querySelector(`.ear-coach-segment-card[data-segment-index="${last.index}"]`);
      const sr = scroller.getBoundingClientRect();
      const cr = card?.getBoundingClientRect();
      const lastVisible = !!cr && cr.bottom > sr.top && cr.top < sr.bottom;
      btn.click();
      await wait(100);
      const pressedAfter = btn.getAttribute("aria-pressed");
      const saved = window.__earCoachSettings.autoFollowPlayback;
      view.playerBar.seekTo((segs[0].start + segs[0].end) / 2);
      await wait(1200);
      const top2 = scroller.scrollTop;
      // 회차 2: 따라가기 켬 + 반복 중 — 재생 시각이 반복 문장 끝을 넘어 다음 문장에 들어가도 카드는 반복 문장에 머문다.
      btn.click();
      await wait(100);
      const k = Math.floor(segs.length / 2);
      const seg = segs[k], nextSeg = segs[k + 1];
      view.playerBar.seekTo((seg.start + seg.end) / 2);
      await wait(200);
      view.playerBar.cycleLoopMode();
      await wait(1500);
      const highlighted = () => [...document.querySelectorAll(".ear-coach-segment-card.is-active-playing")].map((c) => Number(c.getAttribute("data-segment-index")));
      const loopTop = scroller.scrollTop;
      const loopHi = highlighted();
      view.playerBar.seekTo(nextSeg.start + 0.05);
      await wait(1500);
      const pastEndTop = scroller.scrollTop;
      const pastEndHi = highlighted();
      view.playerBar.cycleLoopMode(); // ×N
      view.playerBar.cycleLoopMode(); // off → 이제 다음 문장으로 따라감
      await wait(1500);
      const offHi = highlighted();
      const loopFollow = { k, loopHi, loopTop, pastEndTop, pastEndHi, offHi };
      // 되돌리기: 맨 위로, 시각 0
      scroller.scrollTop = 0;
      await wait(300);
      view.playerBar.seekTo(0);
      await wait(300);
      scroller.scrollTop = 0;
      await wait(300);
      return { pressedBefore, top0, top1, lastVisible, pressedAfter, saved, top2, loopFollow };
    });
  }

  // SPEC_043: 노래방식 — 첫 카드를 3단계로 펼치고 합성 단어 시각을 넣은 뒤 재생 위치를 옮기면 낱말 하나만 칠해짐.
  m.karaoke = null;
  if (vp.expect?.karaoke) {
    m.karaoke = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const view = window.__earCoachView;
      const seg = view?.session?.segments?.[0];
      const other = view?.session?.segments?.[2];
      if (!seg || !other) return { error: "segments missing" };
      const n = seg.words.length;
      // 낱말 1은 start+0.01부터, 마지막 두 칸 앞까지 몰아 두고 낱말 2부터는 start+1.5 뒤(재생 시각이 흘러도 칸 안에 머물게)
      seg.wordStarts = seg.words.map((_, i) => (i <= 1 ? seg.start + i * 0.01 : seg.start + 1.5 + (i - 2) * 0.01));
      const step3 = document.querySelector(`.ear-coach-segment-card[data-segment-index="${seg.index}"] .ear-coach-step-btn[data-step="3"]`);
      if (!step3) return { error: "step3 button missing" };
      step3.click();
      await wait(200);
      const card = () => document.querySelector(`.ear-coach-segment-card[data-segment-index="${seg.index}"]`);
      const lit = () => [...document.querySelectorAll(".ear-coach-word.is-karaoke")].map((w) => ({ wi: Number(w.getAttribute("data-wi")), text: w.textContent }));
      const h0 = card()?.getBoundingClientRect().height ?? 0;
      view.playerBar.seekTo(seg.start + 0.3);
      await wait(350);
      const first = lit();
      const h1 = card()?.getBoundingClientRect().height ?? 0;
      view.playerBar.seekTo(seg.wordStarts[n - 1] + 0.05);
      await wait(350);
      const last = lit();
      return { n, words: seg.words, first, last, h0, h1, otherIndex: other.index };
    });
    if (m.karaoke && !m.karaoke.error) {
      // 스크린샷은 마지막 낱말이 칠해진 채로
      await page.screenshot({ path: path.join(outDir, `karaoke-${vp.name}.png`) });
      m.karaoke.away = await page.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const view = window.__earCoachView;
        const other = view.session.segments[2];
        view.playerBar.seekTo((other.start + other.end) / 2);
        await wait(350);
        const away = document.querySelectorAll(".ear-coach-word.is-karaoke").length;
        const seg = view.session.segments[0];
        delete seg.wordStarts;
        document.querySelector(`.ear-coach-segment-card[data-segment-index="${seg.index}"] .ear-coach-step-btn[data-step="0"]`)?.click();
        view.playerBar.seekTo(0);
        await wait(300);
        return away;
      });
    }
  }

  // SPEC_045: 쉐도잉 — 가짜 마이크로 3단계 카드 🎙 → 자동 멈춤 → 🔁 비교(원음 → 내 녹음), 권한 거부 알림.
  m.shadowing = null;
  if (vp.expect?.shadowing) {
    m.shadowing = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__installShadowFakes();
      const view = window.__earCoachView;
      const segs = view?.session?.segments ?? [];
      const seg = segs.find((s) => s.duration > 0 && s.duration <= 4) ?? segs[0];
      const others = segs.filter((s) => s !== seg).slice(0, 2);
      if (!seg || others.length < 2) return { error: "segments missing" };
      const card = (s) => document.querySelector(`.ear-coach-segment-card[data-segment-index="${s.index}"]`);
      const step = (s, n) => card(s)?.querySelector(`.ear-coach-step-btn[data-step="${n}"]`)?.click();
      const recBtn = () => card(seg)?.querySelector(".ear-coach-shadow-rec");
      const cmpBtn = () => card(seg)?.querySelector(".ear-coach-shadow-compare");
      const shown = (el) => !!el && el.getBoundingClientRect().width > 0;
      const evs = () => window.__shadowLog.map((e) => e.ev);
      // 1·2단계 카드엔 🎙 없음
      step(others[0], 1);
      step(others[1], 2);
      await wait(150);
      const recInLow = [others[0], others[1]].map((s) => card(s)?.querySelectorAll(".ear-coach-shadow-rec").length ?? -1);
      step(seg, 3);
      await wait(200);
      card(seg)?.scrollIntoView({ block: "center" });
      await wait(200);
      const recCount = card(seg)?.querySelectorAll(".ear-coach-shadow-rec").length ?? 0;
      const idleText = recBtn()?.textContent ?? null;
      const idleAria = recBtn()?.getAttribute("aria-label") ?? null;
      const cmpBefore = shown(cmpBtn());
      const limit = Math.min(seg.duration + 2, 20);
      recBtn()?.click();
      await wait(400);
      const recText = recBtn()?.textContent ?? null;
      const recorders = window.__shadowRecorders;
      const startEv = window.__shadowLog.find((e) => e.ev === "recorder.start");
      const deadline = performance.now() + (limit + 3) * 1000;
      while (!window.__shadowLog.some((e) => e.ev === "recorder.stop") && performance.now() < deadline) await wait(100);
      const stopEv = window.__shadowLog.find((e) => e.ev === "recorder.stop");
      await wait(200);
      const autoStopMs = startEv && stopEv ? Math.round(stopEv.t - startEv.t) : null;
      const afterText = recBtn()?.textContent ?? null;
      const cmpShown = shown(cmpBtn());
      const cmpText = cmpBtn()?.textContent ?? null;
      const trackStops = window.__shadowTrackStops;
      const c = card(seg);
      const row = c?.querySelector(".ear-coach-shadow-row");
      const overflow = { card: c ? c.scrollWidth - c.clientWidth : null, row: row ? row.scrollWidth - row.clientWidth : null };
      const logLen = window.__shadowLog.length;
      cmpBtn()?.click();
      await wait((seg.duration + 0.3) * 1000 + 700);
      const cmpLog = window.__shadowLog.slice(logLen);
      const orig = cmpLog.filter((e) => e.ev === "playSegment");
      const plays = cmpLog.filter((e) => e.ev === "audio.play");
      const gapMs = orig[0] && plays[0] ? Math.round(plays[0].t - orig[0].t) : null;
      return {
        index: seg.index, duration: seg.duration, limit, recInLow, recCount, idleText, idleAria, cmpBefore, recText, recorders,
        mime: window.__shadowLog.find((e) => e.ev === "recorder.new")?.mime ?? null,
        autoStopMs, afterText, cmpShown, cmpText, trackStops, overflow,
        origCalls: orig.map((e) => [e.index, e.loop]), audioPlays: plays.length, gapMs, order: cmpLog.map((e) => e.ev).filter((e) => e === "playSegment" || e === "audio.play"),
        evs: evs(),
      };
    });
    if (m.shadowing && !m.shadowing.error) {
      await page.screenshot({ path: path.join(outDir, `shadow-${vp.name}.png`) });
      m.shadowing.denied = await page.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const view = window.__earCoachView;
        const segs = view.session.segments;
        const seg = segs.find((s) => s.duration > 0 && s.duration <= 4) ?? segs[0];
        const card = (s) => document.querySelector(`.ear-coach-segment-card[data-segment-index="${s.index}"]`);
        window.__shadowDeny = true;
        window.__shadowRecorders = 0;
        const before = (window.__notices ?? []).length;
        card(seg)?.querySelector(".ear-coach-shadow-rec")?.click();
        await wait(400);
        const notices = (window.__notices ?? []).slice(before);
        const text = card(seg)?.querySelector(".ear-coach-shadow-rec")?.textContent ?? null;
        const recorders = window.__shadowRecorders;
        const diag = (window.__diagnostics?.list?.() ?? window.__diagnostics?.entries?.() ?? []).map?.((e) => e.stage) ?? null;
        window.__shadowDeny = false;
        // 되돌리기: 바꾼 카드들을 0단계로
        for (const s of segs) {
          const c = card(s);
          if (c && !c.querySelector('.ear-coach-step-btn[data-step="0"]')?.classList.contains("is-current-step")) c.querySelector('.ear-coach-step-btn[data-step="0"]')?.click();
        }
        document.querySelector(".notice-container")?.replaceChildren();
        await wait(200);
        return { notices, text, recorders, diag };
      });
    }
  }

  // SPEC_013: 첫 카드를 3단계로 → 첫 단어 누름 → 사전 창(단어·뜻) + 영상 멈춤. 기본 스크린샷 뒤에 한다.
  m.dictionary = null;
  if (vp.expect?.dictionary) {
    m.dictionary = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const card = document.querySelector(".ear-coach-segment-card");
      if (!card) return { error: "card missing" };
      // SPEC_032: 2단계 힌트 글자(덩어리 영어가 없어야 함)
      const step2 = card.querySelector('.ear-coach-step-btn[data-step="2"]');
      step2?.click();
      await wait(200);
      const phonetic2 = document.querySelector(".ear-coach-segment-card .ear-coach-sound-hint-box .ear-coach-phonetic-kr")?.textContent ?? null;
      const step3 = document.querySelector('.ear-coach-segment-card .ear-coach-step-btn[data-step="3"]'); // SPEC_028: 글자 대신 data-step
      if (!step3) return { error: "step3 button missing" };
      step3.click();
      await wait(200);
      const c2 = document.querySelector(".ear-coach-segment-card");
      const script = c2?.querySelector(".ear-coach-full-script");
      if (!script) return { error: "full-script missing" };
      const phonetic = c2.querySelector(".ear-coach-full-reveal-box .ear-coach-phonetic-kr")?.textContent ?? null; // SPEC_031
      const tokens = script.textContent.split(/\s+/).filter((t) => /[A-Za-z]/.test(t));
      const words = [...script.querySelectorAll(".ear-coach-word")];
      const before = window.__pauseCalls ?? 0;
      const target = words[0];
      if (!target) return { error: "no .ear-coach-word", tokens: tokens.length };
      target.click();
      await wait(300);
      const modal = document.querySelector(".ear-coach-dictionary-modal");
      return {
        tokens: tokens.length,
        words: words.length,
        tapped: target.textContent,
        modal: !!modal,
        title: modal?.querySelector(".ear-coach-dict-word")?.textContent ?? null,
        ipa: modal?.querySelector(".ear-coach-dict-ipa")?.textContent ?? null,
        audioBtn: !!modal?.querySelector(".ear-coach-dict-audio"),
        defs: modal ? modal.querySelectorAll(".ear-coach-dict-body .ear-coach-dict-def").length : 0,
        phraseOnFirst: !!modal?.querySelector(".ear-coach-dict-phrase"),
        pauseCalls: (window.__pauseCalls ?? 0) - before,
        lookups: window.__dictLookups ?? [],
        phonetic,
        phonetic2,
      };
    });
    await page.screenshot({ path: path.join(outDir, `dictionary-${vp.name}.png`) });
    await page.evaluate(() => document.querySelectorAll(".modal-container").forEach((e) => e.remove()));
    // SPEC_032: 사전 창을 닫은 뒤 3단계 카드(「🔊 발음 포인트: <덩어리> → […]」)
    await page.evaluate(() => document.querySelector(".ear-coach-segment-card .ear-coach-full-reveal-box .ear-coach-phonetic-kr")?.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: path.join(outDir, `sound-hint-${vp.name}.png`) });
  }

  // SPEC_014: 같은 카드에서 「going」 누름 → 맨 위 구동사 칸(go to) + 그 아래 단어 칸
  // SPEC_019: phraseBefore = 앞 낱말에서 시작하는 구(「to」 누름 → go to)
  for (const [key, shot] of [["phrase", "phrase"], ["phraseBefore", "phrase-before"]]) {
  m[key] = null;
  if (vp.expect?.[key]) {
    const tapWord = vp.expect[key].tap;
    m[key] = await page.evaluate(async (tapWord) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const script = document.querySelector(".ear-coach-segment-card .ear-coach-full-script");
      if (!script) return { error: "full-script missing" };
      const target = [...script.querySelectorAll(".ear-coach-word")].find((w) => w.textContent === tapWord);
      if (!target) return { error: `word ${tapWord} missing` };
      target.click();
      await wait(300);
      const modal = document.querySelector(".ear-coach-dictionary-modal");
      const box = modal?.querySelector(".ear-coach-dict-phrase");
      const title = box?.querySelector(".ear-coach-dict-phrase-title");
      const word = modal?.querySelector(".ear-coach-dict-word");
      return {
        modal: !!modal,
        phraseTitle: title?.textContent ?? null,
        tag: box?.querySelector(".ear-coach-dict-phrase-tag")?.textContent ?? null,
        tagText: !!box && box.textContent.includes("구동사"),
        phraseDefs: box ? box.querySelectorAll(".ear-coach-dict-def").length : 0,
        word: word?.textContent ?? null,
        phraseAboveWord: !!(title && word && title.getBoundingClientRect().bottom <= word.getBoundingClientRect().top),
      };
    }, tapWord);
    await page.screenshot({ path: path.join(outDir, `${shot}-${vp.name}.png`) });
    await page.evaluate(() => document.querySelectorAll(".modal-container").forEach((e) => e.remove()));
  }
  }

  // SPEC_026: 핀 카드 「➕ Anki」(카드 목록에서) — 사전 검사보다 먼저(모달 없음 상태)
  m.sentenceAnki = null;
  if (vp.expect?.sentenceAnki) {
    m.sentenceAnki = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__ankiCalls = [];
      window.__ankiNotes = [];
      window.__ankiMedia = [];
      window.__ankiDuplicate = false;
      window.__ankiDecks = undefined;
      window.__storyboardNone = false;
      window.__notices = [];
      const cards = [...document.querySelectorAll(".ear-coach-segment-card")];
      const pinned = cards.filter((c) => c.classList.contains("is-pinned"));
      const btnOnPinned = pinned.filter((c) => c.querySelector(".ear-coach-sentence-anki")).length;
      const btnOnUnpinned = cards.filter((c) => !c.classList.contains("is-pinned") && c.querySelector(".ear-coach-sentence-anki")).length;
      const card = pinned[0];
      if (!card) return { error: "no pinned card", cards: cards.length };
      // 버튼이 카드 안에 다 보이는지(가로 목록 362px에서 잘리지 않음)
      const inside = pinned.every((c) => {
        const b = c.querySelector(".ear-coach-sentence-anki")?.getBoundingClientRect();
        const r = c.getBoundingClientRect();
        return !!b && b.right <= r.right - 1 && b.left >= r.left;
      });
      const idx = Number(card.dataset.segmentIndex);
      const seg = window.__earCoachView?.session?.segments?.[idx];
      card.scrollIntoView({ block: "center" });
      window.__audioNone = false;
      window.__clipArgs = [];
      card.querySelector(".ear-coach-sentence-anki").click();
      await wait(400);
      const okRun = { calls: window.__ankiCalls, note: window.__ankiNotes[0] ?? null, media: window.__ankiMedia, clipArgs: window.__clipArgs, notice: (window.__notices ?? []).at(-1) ?? null };
      // SPEC_036: 원음 실패 흉내
      window.__ankiCalls = [];
      window.__ankiNotes = [];
      window.__audioNone = true;
      card.querySelector(".ear-coach-sentence-anki").click();
      await wait(400);
      const fail = { calls: window.__ankiCalls, notes: window.__ankiNotes.length, notice: (window.__notices ?? []).at(-1) ?? null };
      // SPEC_042: 원음 실패 알림의 「다시」 — 누르면 알림이 닫히고 같은 저장을 다시 함
      const notes = [...document.querySelectorAll(".notice-container .notice")];
      const failEl = notes.at(-1);
      const btns = failEl ? [...failEl.querySelectorAll("button")] : [];
      const rect = failEl?.getBoundingClientRect();
      window.__ankiCalls = [];
      const noticesBefore = (window.__notices ?? []).length;
      btns[0]?.click();
      await wait(400);
      const retry = {
        buttons: btns.map((x) => x.textContent),
        text: failEl?.querySelector(".ear-coach-notice-text")?.textContent ?? null,
        width: rect ? Math.round(rect.width) : null,
        closed: !!failEl && !failEl.isConnected,
        callsAfter: window.__ankiCalls,
        newNotice: (window.__notices ?? []).slice(noticesBefore),
      };
      // SPEC_052: 앞부분만 허락하는 영상 — 정확한 문구, 「다시」 없음
      document.querySelectorAll(".notice-container .notice").forEach((x) => x.remove());
      window.__ankiCalls = [];
      window.__ankiNotes = [];
      window.__audioReason = "limited";
      card.querySelector(".ear-coach-sentence-anki").click();
      await wait(400);
      const limEl = [...document.querySelectorAll(".notice-container .notice")].at(-1);
      const limited = { calls: window.__ankiCalls, notes: window.__ankiNotes.length, notice: (window.__notices ?? []).at(-1) ?? null, buttons: limEl ? [...limEl.querySelectorAll("button")].map((x) => x.textContent) : null };
      window.__audioReason = undefined;
      window.__audioNone = false;
      // SPEC_036: 실제 조각(초기화+조각 1, 9.98초) 1.0~4.0초 디코드
      let decode;
      try {
        const s = await window.__decodeAudioClip(window.__audioFixture.slice().buffer, 1.0, 4.0, 22050);
        let peak = 0;
        for (let i = 0; i < s.length; i++) peak = Math.max(peak, Math.abs(s[i]));
        const wav = window.__encodeWav(s, 22050);
        decode = { sec: s.length / 22050, want: 3.0, peak: Math.round(peak * 1000) / 1000, wavHead: String.fromCharCode(...wav.subarray(0, 4)), wavBytes: wav.length };
      } catch (err) {
        decode = { error: String(err) };
      }
      return { pinned: pinned.length, btnOnPinned, btnOnUnpinned, inside, ...okRun, text: seg?.text ?? null, fail, retry, limited, decode };
    });
    await page.screenshot({ path: path.join(outDir, `sentence-anki-${vp.name}.png`) });
  }

  // SPEC_015: 「going」 누름 → 구 칸·단어 칸 「➕ Anki」 → 단어 칸 버튼 → canAddNotes·addNote 각 1회 + 저장 문구.
  //           그다음 중복 응답이면 addNote 0회 + 중복 문구.
  m.anki = null;
  if (vp.expect?.anki) {
    const tapWord = vp.expect.anki.tap;
    const run = async (duplicate, decks = null, noStoryboard = false, chooseDef = null) =>
      page.evaluate(
        async ({ tapWord, duplicate, decks, noStoryboard, chooseDef }) => {
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          window.__ankiCalls = [];
          window.__ankiNotes = [];
          window.__ankiMedia = [];
          window.__sbUrls = [];
          window.__ankiDuplicate = duplicate;
          window.__ankiDecks = decks ?? undefined;
          window.__storyboardNone = noStoryboard;
          const script = document.querySelector(".ear-coach-segment-card .ear-coach-full-script");
          if (!script) return { error: "full-script missing" };
          const target = [...script.querySelectorAll(".ear-coach-word")].find((w) => w.textContent === tapWord);
          if (!target) return { error: `word ${tapWord} missing` };
          target.click();
          await wait(300);
          const modal = document.querySelector(".ear-coach-dictionary-modal");
          const phraseBtn = modal?.querySelector(".ear-coach-dict-phrase .ear-coach-dict-anki");
          const wordBtn = modal?.querySelector(".ear-coach-dict-body")?.previousElementSibling?.querySelector(".ear-coach-dict-anki");
          if (!wordBtn) return { error: "word anki button missing", phraseBtn: !!phraseBtn };
          // SPEC_025: 단어 칸 뜻 목록 — chooseDef번째 뜻을 누르면 그것만 is-chosen, 카드 앞면엔 그 뜻 하나
          const defs = [...(modal.querySelector(".ear-coach-dict-body")?.querySelectorAll(".ear-coach-dict-def") ?? [])];
          const defText = (li) => li?.querySelector("span")?.textContent ?? null;
          let chosen = null;
          if (chooseDef !== null) {
            const li = defs[chooseDef];
            if (!li) return { error: `def ${chooseDef} missing`, defs: defs.length };
            defs[0].click();
            li.click();
            chosen = { text: defText(li), chosenCount: modal.querySelectorAll(".ear-coach-dict-def.is-chosen").length, onTarget: li.classList.contains("is-chosen") };
          }
          const firstDef = defText(defs[0]);
          wordBtn.click();
          await wait(300);
          const status = [...modal.querySelectorAll(".ear-coach-dict-anki-status")].find((e) => e.style.display !== "none");
          // SPEC_017: 저장한 그림을 풀어 크기·가운데 색
          let picture = null;
          const media = window.__ankiMedia[0];
          if (media?.data) {
            picture = await new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                const c = document.createElement("canvas");
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                const x = c.getContext("2d");
                x.drawImage(img, 0, 0);
                const px = x.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
                resolve({ filename: media.filename, w: img.naturalWidth, h: img.naturalHeight, rgb: [px[0], px[1], px[2]] });
              };
              img.onerror = () => resolve({ filename: media.filename, error: "decode failed" });
              img.src = `data:image/jpeg;base64,${media.data}`;
            });
          }
          return {
            phraseBtn: phraseBtn?.textContent ?? null,
            wordBtn: wordBtn.textContent,
            calls: window.__ankiCalls,
            status: status?.textContent ?? null,
            note: window.__ankiNotes[0] ?? null,
            sbUrls: window.__sbUrls,
            picture,
            chosen,
            firstDef,
            defCount: defs.length,
          };
        },
        { tapWord, duplicate, decks, noStoryboard, chooseDef }
      );
    const added = await run(false, null, false, vp.expect.anki.chooseDef ?? null);
    await page.screenshot({ path: path.join(outDir, `anki-${vp.name}.png`) });
    await page.evaluate(() => document.querySelectorAll(".modal-container").forEach((e) => e.remove()));
    const dup = await run(true);
    await page.evaluate(() => document.querySelectorAll(".modal-container").forEach((e) => e.remove()));
    // SPEC_015 회차 3·SPEC_016: AnkiDroid에 설정 덱(happynote2)이 없으면 addNote 없이 안내
    const noDeck = await run(false, ["기본"]);
    await page.screenshot({ path: path.join(outDir, `anki-nodeck-${vp.name}.png`) });
    await page.evaluate(() => document.querySelectorAll(".modal-container").forEach((e) => e.remove()));
    // SPEC_017: 스토리보드가 없으면 그림 없이 저장 + 문구
    const noPic = await run(false, null, true);
    await page.evaluate(() => document.querySelectorAll(".modal-container").forEach((e) => e.remove()));
    m.anki = { added, dup, noDeck, noPic };
  }

  // SPEC_027: 「⏰ 오늘」 — 차례인 핀만(오늘 켠 핀은 빠짐), 블라인드부터, 정답을 직접 열면 실패 기록 1개
  m.reviewQueue = null;
  if (vp.expect?.reviewQueue) {
    m.reviewQueue = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelectorAll(".modal-container").forEach((e) => e.remove());
      const segs = window.__earCoachView?.session?.segments ?? [];
      const pinned = segs.filter((s) => s.isPinned);
      const due = pinned.filter((s) => !s.pinnedAt).map((s) => s.index);
      const findBtn = (re) => [...document.querySelectorAll(".ear-coach-mobile-toolbar button")].find((b) => re.test(b.textContent ?? ""));
      const dueBtn = document.querySelector('.ear-coach-mobile-toolbar button[data-filter="DUE"]');
      if (!dueBtn) return { error: "due filter missing", pinned: pinned.length };
      const label = dueBtn.textContent;
      dueBtn.click();
      await wait(300);
      const cards = [...document.querySelectorAll(".ear-coach-segment-card")];
      const shown = cards.map((c) => Number(c.dataset.segmentIndex));
      const card = cards[0];
      const blind = card?.querySelector(".ear-coach-step-btn.is-current-step")?.dataset.step === "0";
      const seg = segs[shown[0]];
      card?.querySelector('.ear-coach-step-btn[data-step="3"]')?.click();
      await wait(200);
      const reviews = seg?.reviews ?? null;
      const activeLabel = document.querySelector(".ear-coach-mobile-toolbar .ear-coach-btn.is-active")?.textContent ?? null;
      return { label, due, shown, blind, reviews, activeLabel, pinned: pinned.length };
    });
    await page.screenshot({ path: path.join(outDir, `review-${vp.name}.png`) });
    await page.evaluate(() => [...document.querySelectorAll(".ear-coach-mobile-toolbar button")].find((b) => /^전체/.test(b.textContent ?? ""))?.click());
  }

  // SPEC_044: 오늘의 문장 — 차례 핀 A + 어제 틀린 빈칸 C(+ 오늘 틀림 D·다른 영상 E·A와 겹침) → 줄 「2개」·⏰ 2, 시작 → 목록 [A, C]
  m.todaySentences = null;
  if (vp.expect?.todaySentences) {
    m.todaySentences = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelectorAll(".modal-container").forEach((e) => e.remove());
      const view = window.__earCoachView;
      const segs = view?.session?.segments ?? [];
      if (segs.length < 7) return { error: "segments < 7" };
      window.__todaySaved = segs.map((s) => ({ isPinned: s.isPinned, pinnedAt: s.pinnedAt, reviews: s.reviews, unlockStep: s.unlockStep }));
      const vid = view.session.videoId;
      for (const s of segs) { s.isPinned = false; delete s.pinnedAt; delete s.reviews; }
      const [A, B, C, D, E] = [segs[1], segs[2], segs[4], segs[5], segs[6]];
      A.isPinned = true;
      B.isPinned = true;
      B.pinnedAt = new Date().toISOString();
      const y = new Date(Date.now() - 86_400_000).toISOString();
      const t = new Date().toISOString();
      window.__todayMaterial = [
        { videoId: vid, start: C.start, word: "x", ok: false, at: y },
        { videoId: vid, start: D.start, word: "x", ok: false, at: t },
        { videoId: "other-video", start: E.start, word: "x", ok: false, at: y },
        { videoId: vid, start: A.start, word: "x", ok: false, at: y },
      ];
      window.__wrongBlanks = window.__todayMaterial;
      await view.loadWrongBlanks();
      await wait(150);
      const tb = document.querySelector(".ear-coach-mobile-toolbar");
      const bn = tb?.querySelector(".ear-coach-warmup");
      const tr = tb?.getBoundingClientRect();
      const br = bn?.getBoundingClientRect();
      return {
        expected: [A.index, C.index],
        banner: tb?.querySelector(".ear-coach-warmup-text")?.textContent ?? null,
        due: tb?.querySelector('button[data-filter="DUE"]')?.textContent ?? null,
        bannerTop: !!(br && tr && [...tb.children].every((c) => c === bn || c.getBoundingClientRect().top >= br.bottom - 1)),
        overflow: tb ? tb.scrollWidth - tb.clientWidth : null,
        bannerInside: !!(br && tr && br.left >= tr.left - 0.5 && br.right <= tr.right + 0.5),
      };
    });
    await page.screenshot({ path: path.join(outDir, `today-${vp.name}.png`) });
    const rest = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const view = window.__earCoachView;
      const segs = view.session.segments;
      const tb = () => document.querySelector(".ear-coach-mobile-toolbar");
      const read = () => ({ banner: tb()?.querySelector(".ear-coach-warmup-text")?.textContent ?? null, due: tb()?.querySelector('button[data-filter="DUE"]')?.textContent ?? null });
      tb().querySelector(".ear-coach-warmup .ear-coach-btn-primary")?.click();
      await wait(300);
      const cards = [...document.querySelectorAll(".ear-coach-segment-card")];
      const shown = cards.map((c) => Number(c.dataset.segmentIndex));
      const blind = cards[0]?.querySelector(".ear-coach-step-btn.is-current-step")?.dataset.step === "0";
      const active = tb()?.querySelector(".ear-coach-btn.is-active")?.dataset.filter ?? null;
      const afterStart = read();
      [...tb().querySelectorAll("button")].find((b) => b.dataset.filter === "ALL")?.click();
      await wait(150);
      const backAll = read();
      window.__wrongBlanks = [];
      segs[1].isPinned = false;
      await view.loadWrongBlanks();
      await wait(150);
      const empty = read();
      segs[1].isPinned = true;
      window.__wrongBlanks = window.__todayMaterial;
      await view.loadWrongBlanks();
      await wait(150);
      const again = read();
      tb().querySelector('.ear-coach-warmup button[aria-label="오늘은 닫기"]')?.click();
      await wait(150);
      const closed = read();
      const closedH = tb().getBoundingClientRect().height;
      // 원래 상태로
      window.__todaySaved.forEach((o, i) => { const s = segs[i]; s.isPinned = o.isPinned; s.unlockStep = o.unlockStep; if (o.pinnedAt) s.pinnedAt = o.pinnedAt; else delete s.pinnedAt; if (o.reviews) s.reviews = o.reviews; else delete s.reviews; });
      window.__wrongBlanks = [];
      await view.loadWrongBlanks();
      view.refreshSegments();
      return { shown, blind, active, afterStart, backAll, empty, again, closed, closedH };
    });
    m.todaySentences = { ...m.todaySentences, ...rest };
  }

  // SPEC_050: 어제 영상 퀴즈 — 오늘의 문장 줄 닫기 → 퀴즈 줄 → 시작 → 3문제(맞힘·틀림·원음 없음) → 끝·기록
  m.quiz = null;
  if (vp.expect?.quiz) {
    const qa = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const view = window.__earCoachView;
      const vid = view.session.videoId;
      const tb = () => document.querySelector(".ear-coach-mobile-toolbar");
      const text = () => tb()?.querySelector(".ear-coach-warmup-text")?.textContent ?? null;
      const y = new Date(Date.now() - 86400000).toISOString();
      window.__quizAct = { positions: { [vid]: { at: y } }, pins: [], blanks: [], quizzes: [] };
      window.__quizRecords = [];
      window.__clipArgs = [];
      view.quizOffer = null;
      view.warmupClosed = false;
      window.__wrongBlanks = window.__todayMaterial ?? []; // 오늘의 문장 줄이 먼저인지 보려고
      await view.loadWrongBlanks();
      await wait(150);
      const start = { warmup: text() };
      tb().querySelector('.ear-coach-warmup button[aria-label="오늘은 닫기"]')?.click();
      await wait(150);
      const r = tb().getBoundingClientRect();
      const afterClose = { banner: text(), overflow: tb().scrollWidth - tb().clientWidth, h: r.height };
      tb().querySelector(".ear-coach-warmup .ear-coach-btn-primary")?.click();
      await wait(200);
      const modal = () => document.querySelector(".ear-coach-quiz-modal");
      const titles = [modal()?.querySelector(".ear-coach-quiz-title")?.textContent];
      const play1 = modal()?.querySelector(".ear-coach-quiz-play")?.textContent;
      const items = view.quizOffer?.items ?? [];
      modal().querySelector(".ear-coach-quiz-input").value = items[0]?.seg.text ?? "";
      modal().querySelector(".ear-coach-quiz-check").click();
      await wait(50);
      const verdict1 = modal().querySelector(".ear-coach-quiz-verdict")?.textContent ?? "";
      modal().querySelector(".ear-coach-quiz-next").click();
      await wait(200);
      titles.push(modal()?.querySelector(".ear-coach-quiz-title")?.textContent);
      modal().querySelector(".ear-coach-quiz-input").value = "nothing like it";
      modal().querySelector(".ear-coach-quiz-check").click();
      await wait(50);
      const verdict2 = modal().querySelector(".ear-coach-quiz-verdict")?.textContent ?? "";
      const miss2 = modal().querySelectorAll(".ear-coach-quiz-word.is-miss").length;
      const mr = modal().getBoundingClientRect();
      const modalOverflow = Math.max(0, mr.right - window.innerWidth, -mr.left);
      return { start, afterClose, titles, play1, verdict1, verdict2, miss2, modalOverflow, videoId: vid };
    });
    await page.screenshot({ path: path.join(outDir, `quiz-${vp.name}.png`) });
    const qb = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const view = window.__earCoachView;
      const modal = () => document.querySelector(".ear-coach-quiz-modal");
      const text = () => document.querySelector(".ear-coach-mobile-toolbar .ear-coach-warmup-text")?.textContent ?? null;
      window.__audioNone = true;
      modal().querySelector(".ear-coach-quiz-next").click();
      await wait(200);
      const title3 = modal()?.querySelector(".ear-coach-quiz-title")?.textContent;
      const play3 = modal()?.querySelector(".ear-coach-quiz-play")?.textContent;
      window.__audioNone = false;
      modal().querySelector(".ear-coach-quiz-next").click();
      await wait(100);
      const result = modal()?.querySelector(".ear-coach-quiz-result")?.textContent ?? null;
      const records = window.__quizRecords;
      const clipCalls = window.__clipArgs.length;
      const afterDone = { banner: text() };
      modal()?.querySelector(".ear-coach-quiz-close")?.click();
      // 원래 상태로
      delete window.__quizAct;
      window.__wrongBlanks = [];
      view.quizOffer = null;
      view.warmupClosed = false;
      await view.loadWrongBlanks();
      return { title3, play3, result, records, clipCalls, afterDone };
    });
    qa.titles.push(qb.title3);
    m.quiz = { ...qa, ...qb };
  }

  // SPEC_044: 빈칸 결과 기록 — 틀린 말 입력 후 떠남(두 번) → false 1번, 정답 → true 1번
  m.blankRecord = null;
  if (vp.expect?.blankRecord) {
    m.blankRecord = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelectorAll(".modal-container").forEach((e) => e.remove());
      const view = window.__earCoachView;
      const segs = view.session.segments;
      window.__blankRecords = [];
      for (const card of document.querySelectorAll(".ear-coach-segment-card")) {
        card.querySelector('.ear-coach-step-btn[data-step="1"]')?.click();
        await wait(150);
        const live = document.querySelector(`.ear-coach-segment-card[data-segment-index="${card.dataset.segmentIndex}"]`);
        const input = live?.querySelector(".ear-coach-blank-input");
        if (!input) continue;
        const seg = segs[Number(card.dataset.segmentIndex)];
        const wi = Number(/(\d+)$/.exec(input.getAttribute("aria-label") ?? "")?.[1]) - 1;
        const word = (seg.words[wi] ?? "").replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, "");
        input.value = "zzzq";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.value = word;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await wait(150);
        const recs = (window.__blankRecords ?? []).map((a) => ({ videoId: a[0], start: a[1], word: a[2], ok: a[3] }));
        return { recs, want: { videoId: view.session.videoId, start: seg.start, word } };
      }
      return { error: "no blank input" };
    });
  }

  // SPEC_033: 설정 「🗑 저장된 영상」 — 행 2개 → 첫 행 지우기 → 확인 창 → 휴지통으로 → 행 1개, 휴지통 호출은 그 영상 파일만
  if (vp.expect?.videoData) {
    await page.evaluate(() => {
      document.querySelectorAll(".modal-container").forEach((e) => e.remove());
      window.__renderVideoData();
    });
    await page.waitForTimeout(200);
    const rowIds = () => page.evaluate(() => [...document.querySelectorAll(".ear-coach-videodata-row")].map((r) => r.dataset.videoId));
    const before = await rowIds();
    const overflow = await page.evaluate(() => {
      const h = document.querySelector(".ear-coach-ui-settings-host");
      const rows = [...document.querySelectorAll(".ear-coach-videodata-row")];
      return { host: h ? h.scrollWidth - h.clientWidth : -1, rows: rows.map((r) => r.scrollWidth - r.clientWidth) };
    });
    await page.screenshot({ path: path.join(outDir, `video-data-${vp.name}.png`) });
    const firstId = before[0];
    await page.locator(`.ear-coach-videodata-row[data-video-id="${firstId}"] button`).click();
    await page.waitForTimeout(150);
    const modal = await page.evaluate(() => {
      const c = document.querySelector(".ear-coach-videodata-confirm");
      return c ? { title: c.querySelector("h3")?.textContent ?? "", paths: [...c.querySelectorAll("li")].map((l) => l.textContent), buttons: [...c.querySelectorAll("button")].map((b) => b.textContent) } : null;
    });
    await page.screenshot({ path: path.join(outDir, `video-data-confirm-${vp.name}.png`) });
    if (modal) await page.locator(".ear-coach-videodata-confirm button.mod-warning").click();
    await page.waitForTimeout(300);
    const after = await rowIds();
    const trash = await page.evaluate(() => window.__vdTrash ?? []);
    const notices = await page.evaluate(() => (window.__notices ?? []).filter((n) => n.startsWith("🗑")));
    const res = { before, after, modal, trash, notices, overflow };
    if (before.length !== 2) errors.push(`${vp.name}: videoData rows before ${before.length} != 2`);
    if (!modal) errors.push(`${vp.name}: videoData confirm modal missing`);
    else {
      if (!/데이터를 지울까요\?$/.test(modal.title)) errors.push(`${vp.name}: videoData modal title ${modal.title}`);
      if (modal.buttons.join("|") !== "휴지통으로|취소") errors.push(`${vp.name}: videoData modal buttons ${modal.buttons.join("|")}`);
    }
    if (after.length !== 1 || after[0] === firstId) errors.push(`${vp.name}: videoData rows after ${JSON.stringify(after)}`);
    if (trash.length === 0 || trash.some((p) => !p.includes(firstId))) errors.push(`${vp.name}: videoData trash ${JSON.stringify(trash)}`);
    if (JSON.stringify(trash) !== JSON.stringify(modal?.paths ?? [])) errors.push(`${vp.name}: videoData trash != modal paths`);
    if (notices.length !== 1) errors.push(`${vp.name}: videoData notice ${JSON.stringify(notices)}`);
    if (overflow.host > 1 || overflow.rows.some((x) => x > 1)) errors.push(`${vp.name}: videoData overflowX ${JSON.stringify(overflow)}`);
    m.videoData = res;
    console.log(`${vp.name} videoData: ${JSON.stringify(res)}`);
    await page.evaluate(() => {
      document.querySelectorAll(".modal-container").forEach((e) => e.remove());
      document.querySelector(".ear-coach-ui-settings-host")?.remove();
    });
  }

  // SPEC_038: 「🩺 진단 복사」 — 처음 오류 없음 → 오류 2개(키·URL 쿼리 포함) → 다시 그리면 2개 → 복사 글은 가려짐
  if (vp.expect?.diagnostics) {
    await page.evaluate(() => {
      document.querySelectorAll(".modal-container").forEach((e) => e.remove());
      window.__diagnostics.clear();
      window.__renderDiagnostics();
    });
    const diagState = () =>
      page.evaluate(() => {
        const r = document.querySelector(".ear-coach-diagnostics");
        return r ? { title: r.querySelector(".ear-coach-videodata-title")?.textContent ?? "", meta: r.querySelector(".ear-coach-videodata-meta")?.textContent ?? "", button: r.querySelector("button")?.textContent ?? "", overflow: r.scrollWidth - r.clientWidth, height: r.getBoundingClientRect().height } : null;
      });
    const start = await diagState();
    await page.evaluate(() => {
      window.__diagnostics.record("Anki 저장", new Error("Request failed, status 500"));
      window.__diagnostics.record("AI 분석", new Error("fetch https://generativelanguage.googleapis.com/v1beta/x?key=ui-fake-secret-123456 failed"));
      window.__renderDiagnostics();
    });
    const after = await diagState();
    await page.screenshot({ path: path.join(outDir, `diagnostics-${vp.name}.png`) });
    await page.locator(".ear-coach-diagnostics button").click();
    await page.waitForTimeout(150);
    const clip = await page.evaluate(() => window.__diagClip ?? "");
    const notices = await page.evaluate(() => (window.__notices ?? []).filter((n) => n.startsWith("📋 진단")));
    const res = { start, after, clip, notices };
    console.log(`${vp.name} diagnostics: ${JSON.stringify(res)}`);
    if (!start || start.title !== "🩺 진단 복사" || start.meta !== "기록된 오류가 없어요. 문제가 생기면 복사해서 보내 주세요." || start.button !== "복사") errors.push(`${vp.name}: diagnostics start ${JSON.stringify(start)}`);
    if (!after || after.meta !== "최근 오류 2개 — 문제가 생기면 복사해서 보내 주세요.") errors.push(`${vp.name}: diagnostics after ${JSON.stringify(after)}`);
    if (!clip.startsWith("Ear-Coach 진단 ") || !clip.includes("앱 9.9.9 · Obsidian 1.7.7 · android")) errors.push(`${vp.name}: diagnostics clip head ${clip.slice(0, 120)}`);
    if (!clip.includes("] Anki 저장: Request failed, status 500") || !clip.includes("] AI 분석: fetch https://generativelanguage.googleapis.com/v1beta/x?… failed")) errors.push(`${vp.name}: diagnostics clip entries ${clip}`);
    if (clip.includes("ui-fake-secret-123456") || clip.includes("key=")) errors.push(`${vp.name}: diagnostics clip leaks secret`);
    if (notices.length !== 1 || notices[0] !== "📋 진단을 복사했어요 (오류 2개)") errors.push(`${vp.name}: diagnostics notice ${JSON.stringify(notices)}`);
    if ((start?.overflow ?? 9) > 1 || (after?.overflow ?? 9) > 1) errors.push(`${vp.name}: diagnostics overflowX`);
    m.diagnostics = { start, after, clipLines: clip.split("\n").length, notices };
    await page.evaluate(() => {
      window.__diagnostics.clear();
      document.querySelector(".ear-coach-ui-settings-host")?.remove();
    });
  }

  // SPEC_053 회차 2: 공유 메뉴 DOM 지켜보기 — body에 붙는 공유 메뉴에 줄 1개(첫 options 앞), 누르면 취소 줄 클릭 + 열기
  if (vp.expect?.shareMenu) {
    const share = JSON.parse(fs.readFileSync(path.join(root, vp.expect.shareMenu), "utf8"));
    const res = await page.evaluate(async ({ cases, options }) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const S = window.__shareMenu;
      const calls = [];
      const diags = [];
      const stop = S.startShareMenuObserver(document, (url, t) => calls.push([url, t ?? null]), undefined, (stage, msg) => diags.push(`${stage}: ${msg}`));
      window.__shareCalls = calls;
      window.__shareKeep = { getCancelled: () => 0 };
      const out = [];
      // SPEC_054: 공유 아닌 일반 메뉴는 진단에 안 남음
      const plain = document.createElement("div");
      plain.className = "menu";
      plain.innerHTML = '<div class="menu-item"><div class="menu-item-title">Copy</div></div>';
      document.body.appendChild(plain);
      await wait(120);
      plain.remove();
      const plainDiags = diags.length;
      for (const c of cases) {
        calls.length = 0;
        diags.length = 0;
        const menu = document.createElement("div");
        menu.className = "menu ear-coach-ui-share-menu";
        menu.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:50;background:var(--background-secondary);border-radius:16px;padding:8px";
        const scroll = menu.appendChild(document.createElement("div"));
        scroll.className = "menu-scroll";
        const row = (sec, title, cls = "") => {
          const it = scroll.appendChild(document.createElement("div"));
          it.className = `menu-item ${sec === "title" ? "" : "tappable"} ${cls}`;
          it.setAttribute("data-section", sec);
          it.appendChild(document.createElement("div")).className = "menu-item-icon";
          const t = it.appendChild(document.createElement("div"));
          t.className = "menu-item-title";
          t.textContent = title;
          it.style.cssText = "padding:12px;min-height:24px";
          return it;
        };
        row("title", c.text);
        if (c.preExisting) row("options", "🎧 Ear-Coach로 열기");
        for (const o of options) row("options", o);
        let cancelled = 0;
        row("danger", "Cancel").addEventListener("click", () => { cancelled++; });
        document.body.appendChild(menu);
        await wait(120);
        const items = [...menu.querySelectorAll(".menu-item-title")].filter((t) => t.textContent === "🎧 Ear-Coach로 열기");
        const ours = menu.querySelector(".ear-coach-share-item");
        const firstOptionIsOurs = menu.querySelector('[data-section="options"]') === ours;
        S.injectShareItem(menu, () => {}); // 두 번 불러도 하나
        const itemsAgain = [...menu.querySelectorAll(".menu-item-title")].filter((t) => t.textContent === "🎧 Ear-Coach로 열기").length;
        let shot = false;
        if (ours) {
          if (c.name.startsWith("유튜브 앱")) shot = true;
          if (!shot) ours.click();
        }
        out.push({ name: c.name, items: items.length, itemsAgain, firstOptionIsOurs: ours ? firstOptionIsOurs : null, shot, menuId: shot ? "keep" : null, diags: [...diags], plainDiags });
        if (shot) {
          menu.id = "ear-coach-ui-share-keep";
          window.__shareKeep = { getCancelled: () => cancelled };
          continue;
        }
        out[out.length - 1].trigger = calls[0] ?? null;
        out[out.length - 1].cancelled = cancelled;
        menu.remove();
      }
      window.__shareStop = stop;
      return out;
    }, share);
    await page.screenshot({ path: path.join(outDir, `share-menu-${vp.name}.png`) });
    const kept = await page.evaluate(() => {
      const menu = document.getElementById("ear-coach-ui-share-keep");
      const calls = window.__shareCalls;
      const before = calls.length;
      menu?.querySelector(".ear-coach-share-item")?.click();
      const r = { trigger: calls[before] ?? null, cancelled: window.__shareKeep.getCancelled() };
      menu?.remove();
      window.__shareStop();
      return r;
    });
    const keepIdx = res.findIndex((r) => r.shot);
    if (keepIdx >= 0) Object.assign(res[keepIdx], kept);
    console.log(`${vp.name} shareMenu: ${JSON.stringify(res)}`);
    share.cases.forEach((c, i) => {
      const r = res[i];
      const ok = r && r.items === c.expectItems && r.itemsAgain === c.expectItems
        && JSON.stringify(r.trigger ?? null) === JSON.stringify(c.expectTrigger)
        && (c.expectTrigger ? r.cancelled === 1 && r.firstOptionIsOurs === true : true)
        && r.plainDiags === 0 && r.diags.length === 1 && r.diags[0].startsWith(`공유 메뉴: ${c.expectDiag} · 묶음 title,options,danger`);
      if (!ok) errors.push(`${vp.name}: shareMenu ${c.name} ${JSON.stringify(r)}`);
    });
    m.shareMenu = res;
  }

  // SPEC_034: 「🧹 휴지통 비우기」 — 처음 0개·disabled → 영상 지우기 → 3개 → 비우기 → 영구 삭제는 기록 3개만(남의 .trash 노트 그대로) → 0개
  if (vp.expect?.videoTrash) {
    await page.evaluate(() => {
      document.querySelectorAll(".modal-container").forEach((e) => e.remove());
      window.__renderVideoData();
    });
    await page.waitForTimeout(200);
    const trashState = () =>
      page.evaluate(() => {
        const r = document.querySelector(".ear-coach-videodata-trash");
        return r ? { meta: r.querySelector(".ear-coach-videodata-meta")?.textContent ?? "", disabled: !!r.querySelector("button")?.disabled } : null;
      });
    const start = await trashState();
    const firstId = await page.evaluate(() => document.querySelector(".ear-coach-videodata-row")?.dataset.videoId);
    await page.locator(`.ear-coach-videodata-row[data-video-id="${firstId}"] button`).click();
    await page.waitForTimeout(150);
    await page.locator(".ear-coach-videodata-confirm button.mod-warning").click();
    await page.waitForTimeout(300);
    const afterDelete = await trashState();
    const recorded = await page.evaluate(() => window.__vdRecorded);
    await page.screenshot({ path: path.join(outDir, `video-trash-${vp.name}.png`) });
    let modal = null;
    if (afterDelete && !afterDelete.disabled) {
      await page.locator(".ear-coach-videodata-trash button").click();
      await page.waitForTimeout(150);
      modal = await page.evaluate(() => {
        const c = document.querySelector(".ear-coach-videotrash-confirm");
        return c ? { title: c.querySelector("h3")?.textContent ?? "", paths: [...c.querySelectorAll("li")].map((l) => l.textContent), note: c.querySelector(".ear-coach-videodata-note")?.textContent ?? "", buttons: [...c.querySelectorAll("button")].map((b) => b.textContent) } : null;
      });
      await page.screenshot({ path: path.join(outDir, `video-trash-confirm-${vp.name}.png`) });
      if (modal) await page.locator(".ear-coach-videotrash-confirm button.mod-warning").click();
      await page.waitForTimeout(300);
    }
    const end = await trashState();
    const removed = await page.evaluate(() => window.__vdRemove);
    const notices = await page.evaluate(() => (window.__notices ?? []).filter((n) => n.startsWith("🧹")));
    const overflow = await page.evaluate(() => {
      const r = document.querySelector(".ear-coach-videodata-trash");
      return r ? r.scrollWidth - r.clientWidth : -1;
    });
    const res = { start, afterDelete, recorded, modal, removed, end, notices, overflow };
    console.log(`${vp.name} videoTrash: ${JSON.stringify(res)}`);
    const EMPTY = "휴지통에 Ear-Coach 파일이 없어요.";
    if (!start || start.meta !== EMPTY || !start.disabled) errors.push(`${vp.name}: videoTrash start ${JSON.stringify(start)}`);
    if (!afterDelete || !/^Ear-Coach가 옮긴 파일 3개 · /.test(afterDelete.meta) || afterDelete.disabled) errors.push(`${vp.name}: videoTrash afterDelete ${JSON.stringify(afterDelete)}`);
    if (recorded.length !== 3 || recorded.some((p) => !p.startsWith(".trash/") || p.includes("diary"))) errors.push(`${vp.name}: videoTrash recorded ${JSON.stringify(recorded)}`);
    if (!modal) errors.push(`${vp.name}: videoTrash confirm modal missing`);
    else {
      if (modal.title !== "휴지통의 Ear-Coach 파일 3개를 영구 삭제할까요?") errors.push(`${vp.name}: videoTrash modal title ${modal.title}`);
      if (modal.note !== "되돌릴 수 없어요. 다른 노트는 그대로예요.") errors.push(`${vp.name}: videoTrash modal note ${modal.note}`);
      if (modal.buttons.join("|") !== "영구 삭제|취소") errors.push(`${vp.name}: videoTrash modal buttons ${modal.buttons.join("|")}`);
    }
    if (JSON.stringify([...removed].sort()) !== JSON.stringify([...recorded].sort())) errors.push(`${vp.name}: videoTrash removed ${JSON.stringify(removed)} != recorded`);
    if (removed.some((p) => p.includes("diary"))) errors.push(`${vp.name}: videoTrash removed other note`);
    if (!end || end.meta !== EMPTY || !end.disabled) errors.push(`${vp.name}: videoTrash end ${JSON.stringify(end)}`);
    if (notices.length !== 1 || notices[0] !== "🧹 파일 3개를 영구 삭제했어요") errors.push(`${vp.name}: videoTrash notice ${JSON.stringify(notices)}`);
    if (overflow > 1) errors.push(`${vp.name}: videoTrash overflowX ${overflow}`);
    m.videoTrash = res;
    await page.evaluate(() => {
      document.querySelectorAll(".modal-container").forEach((e) => e.remove());
      document.querySelector(".ear-coach-ui-settings-host")?.remove();
    });
  }

  // SPEC_029: 세로 받아쓰기 입력 중 — 키보드가 덮든(높이 그대로) 줄이든(480·380) 입력칸·컨트롤이 보이고 세로 배치 유지
  if (vp.expect?.typing) {
    const t = vp.expect.typing;
    const probe = () =>
      page.evaluate(() => {
        const r = (s) => {
          const e = typeof s === "string" ? document.querySelector(s) : s;
          if (!e) return null;
          const b = e.getBoundingClientRect();
          return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width) };
        };
        const c = document.querySelector(".ear-coach-mobile-container");
        const a = document.activeElement;
        return {
          typing: !!c?.classList.contains("is-typing"),
          focused: a?.tagName === "INPUT",
          input: a?.tagName === "INPUT" ? r(a) : null,
          controls: r(".ear-coach-mobile-top-player .ear-coach-player-controls"),
          video: r(".ear-coach-mobile-top-player .ear-coach-video-box"),
          list: r(".ear-coach-mobile-list-wrapper"),
          toolbarShown: (r(".ear-coach-mobile-toolbar")?.h ?? 0) > 0,
          vh: window.innerHeight,
        };
      });
    await page.evaluate(() => document.querySelectorAll(".modal-container").forEach((e) => e.remove()));
    await page.locator('.ear-coach-mobile-list-wrapper .ear-coach-step-btn[data-step="1"]').first().click();
    await page.waitForTimeout(250);
    await page.locator(".ear-coach-mobile-list-wrapper .ear-coach-segment-card input").first().focus();
    await page.waitForTimeout(500);
    const res = { overlay: await probe() };
    await page.screenshot({ path: path.join(outDir, `typing-${vp.name}.png`) });
    const o = res.overlay;
    if (!o.typing) errors.push(`${vp.name}: typing class missing after focus`);
    if (!o.input || o.input.bottom > vp.height * t.overlayMaxBottom)
      errors.push(`${vp.name}: typing overlay input bottom=${o.input?.bottom} > ${Math.round(vp.height * t.overlayMaxBottom)}`);
    if (o.toolbarShown) errors.push(`${vp.name}: typing toolbar still shown`);
    // SPEC_030: 첫 빈칸 오답이면 그대로, 정답(아포스트로피 빼고 대문자로)이면 다음 빈칸으로 커서 이동
    if (t.advance) {
      const info = await page.evaluate(() => {
        const card = document.activeElement?.closest(".ear-coach-segment-card");
        const seg = window.__earCoachView?.session?.segments?.find((x) => x.index === Number(card?.dataset.segmentIndex));
        // SPEC_037: 실제로 그린 첫 빈칸(aria-label "Blank word N")의 낱말
        const inputs = [...(card?.querySelectorAll("input.ear-coach-blank-input") ?? [])];
        const first = Number((inputs[0]?.getAttribute("aria-label") ?? "").replace(/\D+/g, "")) - 1;
        return { n: inputs.length, word: first >= 0 ? (seg?.words?.[first] ?? null) : null };
      });
      const where = () => page.evaluate(() => {
        const a = document.activeElement;
        return [...(a?.closest(".ear-coach-segment-card")?.querySelectorAll("input.ear-coach-blank-input") ?? [])].indexOf(a);
      });
      if (info.n < 2 || !info.word) errors.push(`${vp.name}: typing advance needs 2+ blanks (n=${info.n} word=${info.word})`);
      else {
        await page.keyboard.type("zzz");
        const afterWrong = await where();
        await page.locator(":focus").fill("");
        await page.keyboard.type(info.word.replace(/[^a-z0-9]/gi, "").toUpperCase());
        await page.waitForTimeout(150);
        const afterRight = await where();
        res.advance = { word: info.word, afterWrong, afterRight };
        if (afterWrong !== 0) errors.push(`${vp.name}: typing advance moved on wrong answer (at ${afterWrong})`);
        if (afterRight !== 1) errors.push(`${vp.name}: typing advance did not move to next blank (at ${afterRight}, word=${info.word}, n=${info.n})`);
      }
    }
    for (const h of t.heights) {
      await page.setViewportSize({ width: vp.width, height: h });
      await page.waitForTimeout(500);
      const k = await probe();
      res[h] = k;
      await page.screenshot({ path: path.join(outDir, `typing-${vp.name}-${h}.png`) });
      if (!k.focused || !k.input) errors.push(`${vp.name}: typing h=${h} input lost focus`);
      else if (k.input.top < 0 || k.input.bottom > h) errors.push(`${vp.name}: typing h=${h} input outside ${k.input.top}..${k.input.bottom}`);
      if (!k.controls || k.controls.top < 0 || k.controls.bottom > h || k.controls.h <= 0)
        errors.push(`${vp.name}: typing h=${h} controls hidden ${JSON.stringify(k.controls)}`);
      if (k.list && k.controls && k.list.top < k.controls.bottom - 1)
        errors.push(`${vp.name}: typing h=${h} not stacked (list.top=${k.list.top} < controls.bottom=${k.controls.bottom})`);
    }
    // 실기기 1.0.36 사진: 웹뷰가 줄어든 데다 Obsidian이 앱 영역을 키보드 높이만큼 또 줄여 화면이 헤더 밑 ~30px만 남음.
    // #app 아래 여백에 키보드 높이를 더해 흉내 낸다(squeeze).
    for (const h of t.squeeze ?? []) {
      await page.setViewportSize({ width: vp.width, height: h });
      await page.evaluate((kb) => { document.getElementById("app").style.paddingBottom = `${24 + kb}px`; }, vp.height - h);
      await page.waitForTimeout(600);
      const k = await probe();
      res[`squeeze${h}`] = k;
      await page.screenshot({ path: path.join(outDir, `typing-${vp.name}-squeeze${h}.png`) });
      if (!k.focused || !k.input) errors.push(`${vp.name}: typing squeeze h=${h} input lost focus`);
      else if (k.input.top < 0 || k.input.bottom > h) errors.push(`${vp.name}: typing squeeze h=${h} input outside ${k.input.top}..${k.input.bottom}`);
      if (!k.list || k.list.h < h * 0.4) errors.push(`${vp.name}: typing squeeze h=${h} list too small ${JSON.stringify(k.list)}`);
      const topEl = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a) return null;
        const b = a.getBoundingClientRect();
        const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return e === a || a.contains(e);
      });
      if (!topEl) errors.push(`${vp.name}: typing squeeze h=${h} input covered`);
      await page.evaluate(() => { document.getElementById("app").style.paddingBottom = ""; });
    }
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(500);
    res.after = await probe();
    if (res.after.typing) errors.push(`${vp.name}: typing class stays after blur`);
    if ((res.after.video?.h ?? 0) < 60) errors.push(`${vp.name}: video not back after blur h=${res.after.video?.h}`);
    m.typing = res;
  }

  // SPEC_046: 이어 보기 — 가짜 위치(가운데 문장)로 다시 열면 seekTo 1번·카드 보임·알림, 시각 지정·위치 없음이면 복원 안 함.
  // 저장: 재생 중 0→25초 흘리면 10초마다(≤3번), 멈추면 1번 더.
  m.resume = null;
  if (vp.expect?.resume) {
    m.resume = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const w = window;
      const view = w.__earCoachView;
      const segs = view?.session?.segments ?? [];
      if (!view || segs.length < 4) return { error: "view/segments missing" };
      const videoId = view.session.videoId;
      const mid = segs[Math.floor(segs.length / 2)];
      const sec = Math.round((mid.start + 0.2) * 10) / 10;
      const seeks = [];
      const orig = w.__PlayerBar.prototype.seekTo;
      w.__PlayerBar.prototype.seekTo = function (t) { seeks.push(t); return orig.call(this, t); };
      const reopen = async (focus) => {
        seeks.length = 0;
        const before = (w.__notices ?? []).length;
        await view.loadSession({ ...view.session }, null, focus);
        await wait(700);
        return { all: seeks.slice(), notices: (w.__notices ?? []).slice(before).filter((n) => n.includes("⏩")) };
      };
      const fmt = (s) => { const x = Math.floor(s); return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
      try {
        w.__positions = { [videoId]: { seconds: sec, at: new Date().toISOString() } };
        const a = await reopen(undefined);
        const scroller = [...document.querySelectorAll(".ear-coach-mobile-list-wrapper, .ear-coach-mobile-list-wrapper *")].find((el) => el.scrollHeight > el.clientHeight + 10 && getComputedStyle(el).overflowY !== "visible");
        const card = document.querySelector(`.ear-coach-segment-card[data-segment-index="${mid.index}"]`);
        const sr = scroller?.getBoundingClientRect();
        const cr = card?.getBoundingClientRect();
        const visible = !!sr && !!cr && cr.bottom > sr.top + 4 && cr.top < sr.bottom - 4;
        const restore = { seeks: a.all.filter((t) => Math.abs(t - sec) < 0.01).length, seekArgs: a.all, visible, notices: a.notices };
        w.__positions = {};
        const c = await reopen(undefined);
        const none = { seeks: c.all.length, notices: c.notices };
        w.__positions = { [videoId]: { seconds: sec, at: new Date().toISOString() } };
        const b = await reopen(segs[1].start);
        const focus = { seeks: b.all.filter((t) => Math.abs(t - sec) < 0.01).length, notices: b.notices };
        view.playerBar.clearSegmentLoop();
        view.playerBar.pause();
        w.__positions = {};
        await wait(200);
        // 저장 — 위치 없이 다시 열어 저장 기록을 처음부터
        await reopen(undefined);
        w.__setPositions = [];
        view.playerBar.seekTo(0);
        w.__simT = 0;
        view.playerBar.play();
        for (let t = 0; t <= 25; t++) {
          w.__simT = t;
          view.playerBar.seekTo(t);
          await wait(120);
        }
        const during = w.__setPositions.slice();
        view.playerBar.pause();
        await wait(300);
        const afterPause = w.__setPositions.slice(during.length);
        w.__simT = null;
        view.playerBar.seekTo(0);
        await wait(200);
        return { videoId, sec, label: fmt(sec), restore, focus, none, save: { during, afterPause } };
      } finally {
        w.__PlayerBar.prototype.seekTo = orig;
      }
    });
    if (m.resume && !m.resume.error) {
      // 스크린샷은 복원 상태로 다시 연 화면(알림 포함)
      await page.evaluate(async (sec) => {
        const view = window.__earCoachView;
        window.__positions = { [view.session.videoId]: { seconds: sec, at: new Date().toISOString() } };
        document.querySelector(".notice-container")?.replaceChildren();
        await view.loadSession({ ...view.session }, null);
        await new Promise((r) => setTimeout(r, 700));
      }, m.resume.sec);
      await page.screenshot({ path: path.join(outDir, `resume-${vp.name}.png`) });
      await page.evaluate(() => { window.__positions = {}; document.querySelector(".notice-container")?.replaceChildren(); });
    }
  }

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
