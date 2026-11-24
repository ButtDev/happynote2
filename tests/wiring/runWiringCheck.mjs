// SPEC_039: 플러그인 연결 검사 — src/main.ts를 가짜 obsidian으로 묶어 node에서 onload를 돌리고,
// 등록한 것(화면·URI·리본·명령·코드 블록·설정 탭·이벤트·openFile 가로채기)과 몇 가지 동작을
// tests/fixtures/wiring/expected.json과 비교한다. 다른 main을 보려면 --main <경로>(변이·동등성 확인용).
import esbuild from "esbuild";
import builtins from "builtin-modules";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const argIdx = process.argv.indexOf("--main");
const mainPath = path.resolve(argIdx > 0 ? process.argv[argIdx + 1] : path.join(root, "src/main.ts"));
const expected = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/wiring/expected.json"), "utf8"));

// 구조: main.ts는 연결만(기능은 src/features/) — 줄 수 상한
const mainLines = fs.readFileSync(mainPath, "utf8").split(/\r?\n/).length;
assert.ok(mainLines <= expected.mainMaxLines, `${path.relative(root, mainPath)} ${mainLines}줄 > ${expected.mainMaxLines}`);

const built = await esbuild.build({
  entryPoints: [mainPath],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  target: "es2022",
  external: ["obsidian", "electron", ...builtins],
  loader: { ".txt": "text" },
  define: { __INLINE_WORKER_CODE__: '""' },
  logLevel: "silent",
});
const code = built.outputFiles[0].text;

// ---- 가짜 obsidian ----
const rec = { notices: [], events: [], layoutReady: 0, handlers: {} };
class Notice {
  constructor(m) {
    rec.notices.push(String(m));
  }
  hide() {}
}
class TFile {
  constructor(p = "") {
    this.path = p;
    this.name = p.split("/").pop();
    this.extension = p.split(".").pop();
  }
}
const origOpenFile = async function () {
  return "orig";
};
class WorkspaceLeaf {}
WorkspaceLeaf.prototype.openFile = origOpenFile;
class Dummy {
  constructor(...a) {
    this.args = a;
  }
}
const frontmatterByPath = new Map();
const app = {
  workspace: {
    on: (name, cb) => (rec.events.push(`workspace:${name}`), (rec.handlers[`workspace:${name}`] = cb), { name }),
    onLayoutReady: () => void rec.layoutReady++,
    getLeavesOfType: () => [],
    iterateAllLeaves: () => {},
    getActiveFile: () => null,
    getActiveViewOfType: () => null,
  },
  metadataCache: {
    on: (name) => (rec.events.push(`metadataCache:${name}`), { name }),
    getFileCache: (f) => (frontmatterByPath.has(f.path) ? { frontmatter: frontmatterByPath.get(f.path) } : null),
  },
  vault: { getAbstractFileByPath: () => null, read: async () => "" },
};
class Plugin {
  constructor(a, manifest) {
    this.app = a;
    this.manifest = manifest;
    this.reg = { views: [], protocols: {}, ribbons: [], commands: [], codeblocks: [], settingTabs: 0, cleanups: [], registeredEvents: 0 };
  }
  registerView(type) {
    this.reg.views.push(type);
  }
  registerObsidianProtocolHandler(name, fn) {
    this.reg.protocols[name] = fn;
  }
  addRibbonIcon(icon, title) {
    this.reg.ribbons.push({ icon, title });
  }
  addCommand(c) {
    this.reg.commands.push(c);
  }
  registerMarkdownCodeBlockProcessor(lang) {
    this.reg.codeblocks.push(lang);
  }
  addSettingTab() {
    this.reg.settingTabs++;
  }
  register(cb) {
    this.reg.cleanups.push(cb);
  }
  registerEvent() {
    this.reg.registeredEvents++;
  }
  async loadData() {
    return {};
  }
  async saveData() {}
}
const known = { Notice, TFile, WorkspaceLeaf, Plugin, Platform: { isMobile: false, isMobileApp: false, isDesktop: true, isDesktopApp: true }, requestUrl: async () => { throw new Error("network disabled in wiring check"); }, normalizePath: (p) => p, setIcon: () => {}, apiVersion: "1.7.7" };
const fakeObsidian = new Proxy(known, { get: (t, k) => (k in t ? t[k] : Dummy) });

globalThis.window = globalThis.window ?? Object.assign(globalThis, { addEventListener() {}, removeEventListener() {} });

const req = createRequire(mainPath);
const mod = { exports: {} };
new Function("require", "module", "exports", code)((n) => (n === "obsidian" ? fakeObsidian : req(n)), mod, mod.exports);
const PluginClass = mod.exports.default;

const plugin = new PluginClass(app, { id: "obsidian-ear-coach", version: "0.0.0" });
await plugin.onload();
const r = plugin.reg;

// ---- 등록 ----
const got = {
  views: r.views,
  protocols: Object.keys(r.protocols),
  ribbonIcons: r.ribbons.map((x) => x.icon),
  commands: r.commands.map((c) => `${c.id}:${c.checkCallback ? "check" : "callback"}`),
  codeblocks: r.codeblocks,
  settingTabs: r.settingTabs,
  events: [...rec.events].sort(),
  registeredEvents: r.registeredEvents,
  layoutReady: rec.layoutReady,
  openFilePatched: WorkspaceLeaf.prototype.openFile !== origOpenFile,
};
for (const [k, v] of Object.entries(expected.registrations)) {
  assert.deepEqual(got[k], v, `등록 ${k}: ${JSON.stringify(got[k])}`);
}

// ---- 공개 이름(다른 파일이 부르는 것) ----
for (const name of expected.publicMembers) {
  assert.equal(typeof plugin[name], "function", `plugin.${name}가 함수가 아님`);
}
for (const name of expected.publicObjects) {
  assert.ok(plugin[name] && typeof plugin[name] === "object", `plugin.${name}가 객체가 아님`);
}

// ---- 동작 몇 가지 ----
for (const c of expected.aiConfig) {
  Object.assign(plugin.settings, c.settings);
  assert.deepEqual(plugin.getAiConfig(), c.expect, `getAiConfig ${JSON.stringify(c.settings)}`);
}
for (const c of expected.isEarCoachNoteFast) {
  if (c.frontmatter) frontmatterByPath.set(c.path, c.frontmatter);
  assert.equal(plugin.isEarCoachNoteFast(new TFile(c.path)), c.expect, `isEarCoachNoteFast ${c.path}`);
}
for (const c of expected.commandsWithoutActiveFile) {
  const cmd = r.commands.find((x) => x.id === c.id);
  assert.equal(cmd.checkCallback(true), c.expect, `checkCallback(${c.id}) 활성 파일 없음`);
}
rec.notices.length = 0;
await r.protocols["ear-coach"]({});
assert.deepEqual(rec.notices, [expected.protocolWithoutUrlNotice], "URI url 없음 안내");
rec.notices.length = 0;
await plugin.handleYouTubeTrigger("not a url");
assert.deepEqual(rec.notices, [expected.invalidUrlNotice], "잘못된 URL 안내");
// SPEC_053: 공유 메뉴 — 줄 넣기·누르면 handleYouTubeTrigger
{
  const realTrigger = plugin.handleYouTubeTrigger;
  for (const c of expected.shareMenu) {
    const items = [];
    const menu = { addItem: (fn) => { const it = { onClick(cb) { this.click = cb; return this; }, setTitle(t) { this.title = t; return this; }, setIcon(i) { this.icon = i; return this; } }; fn(it); items.push(it); return menu; } };
    let called = null;
    plugin.handleYouTubeTrigger = async (...a) => void (called = a);
    rec.handlers["workspace:receive-text-menu"](menu, c.text);
    assert.deepEqual(items.map((x) => ({ title: x.title, icon: x.icon })), c.items, `공유 메뉴 줄: ${c.text}`);
    items[0]?.click();
    assert.deepEqual(called, c.trigger, `공유 메뉴 누름: ${c.text}`);
  }
  plugin.handleYouTubeTrigger = realTrigger;
}
// 가로채기: Ear-Coach 노트가 아니면 원래 openFile로
assert.equal(await WorkspaceLeaf.prototype.openFile.call(new WorkspaceLeaf(), new TFile("Other/a.md")), "orig", "일반 노트는 원래 openFile");

// ---- 언로드 ----
for (const cb of r.cleanups) cb();
plugin.onunload();
assert.equal(WorkspaceLeaf.prototype.openFile, origOpenFile, "언로드 뒤 openFile 원래대로");

console.log(`wiring OK: ${got.commands.length} commands, ${got.events.length} events, ${expected.publicMembers.length} members, ${mainLines} lines — ${path.relative(root, mainPath)}`);
