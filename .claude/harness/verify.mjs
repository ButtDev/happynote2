#!/usr/bin/env node
// harness.json의 검증 명령을 차례로 돌린다. 각 결과가 완료 판정의 근거다.
// 사용: node .claude/harness/verify.mjs [--set regression] [--json] [--root <dir>]
import { spawnSync } from "node:child_process";
import { projectRoot, readJsonSafe, tail } from "./lib.mjs";

const root = projectRoot();
const cfg = readJsonSafe(root, "harness.json", null);
if (!cfg || !Array.isArray(cfg.verify)) {
  console.log(JSON.stringify({ ok: false, results: [], error: "harness.json에 verify 목록 없음" }));
  process.exit(1);
}
const si = process.argv.indexOf("--set");
const set = si >= 0 ? process.argv[si + 1] : null;
let items = cfg.verify;
if (set) {
  const names = Array.isArray(cfg[set]) ? cfg[set] : [];
  items = items.filter((v) => names.includes(v.name));
}

const results = [];
for (const v of items) {
  const t0 = Date.now();
  const r = spawnSync("sh", ["-c", v.cmd], { cwd: root, encoding: "utf8", timeout: (v.timeoutSec ?? 600) * 1000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const exit = r.status ?? (r.signal ? 128 : 1);
  const patternHit = v.failPattern ? new RegExp(v.failPattern, "m").test(out) : false;
  results.push({ name: v.name, ok: exit === 0 && !patternHit, exit, patternHit, timedOut: r.error?.code === "ETIMEDOUT", ms: Date.now() - t0, tail: tail(out) });
}
const ok = results.length > 0 && results.every((r) => r.ok);
if (process.argv.includes("--json")) console.log(JSON.stringify({ ok, results }));
else {
  for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name} exit=${r.exit}${r.patternHit ? " failPattern" : ""} ${r.ms}ms\n${r.tail.replace(/^/gm, "    ")}`);
  console.log(ok ? "verify: ok" : "verify: FAIL");
}
process.exitCode = ok ? 0 : 1;
