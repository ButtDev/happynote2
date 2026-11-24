#!/usr/bin/env node
// harness.json의 검증 명령을 차례로 돌린다. 각 결과가 완료 판정의 근거다.
// 사용: node .claude/harness/verify.mjs [--set regression] [--only a,b] [--json] [--root <dir>]
// 모르는 옵션·이름은 전체를 돌리지 않고 바로 실패한다(실기 점검이 뜻하지 않게 도는 것을 막는다).
import { spawnSync } from "node:child_process";
import { projectRoot, readJsonSafe, tail } from "./lib.mjs";

const root = projectRoot();
const cfg = readJsonSafe(root, "harness.json", null);
if (!cfg || !Array.isArray(cfg.verify)) {
  console.log(JSON.stringify({ ok: false, results: [], error: "harness.json에 verify 목록 없음" }));
  process.exit(1);
}
const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--json") opts.json = true;
  else if (["--set", "--only", "--root"].includes(a) && argv[i + 1] && !argv[i + 1].startsWith("--")) opts[a.slice(2)] = argv[++i];
  else {
    console.error(`verify: 모르는 인자 또는 값 없음: ${a} (쓸 수 있는 것: --set <이름> --only <a,b> --json --root <dir>)`);
    process.exit(2);
  }
}
let items = cfg.verify;
if (opts.set) {
  if (!Array.isArray(cfg[opts.set])) {
    console.error(`verify: harness.json에 "${opts.set}" 목록 없음`);
    process.exit(2);
  }
  items = items.filter((v) => cfg[opts.set].includes(v.name));
}
if (opts.only) {
  const want = opts.only.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = want.filter((n) => !cfg.verify.some((v) => v.name === n));
  if (unknown.length) {
    console.error(`verify: verify에 없는 이름: ${unknown.join(", ")}`);
    process.exit(2);
  }
  items = items.filter((v) => want.includes(v.name));
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
if (opts.json) console.log(JSON.stringify({ ok, results }));
else {
  for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name} exit=${r.exit}${r.patternHit ? " failPattern" : ""} ${r.ms}ms\n${r.tail.replace(/^/gm, "    ")}`);
  console.log(ok ? "verify: ok" : "verify: FAIL");
}
process.exitCode = ok ? 0 : 1;
