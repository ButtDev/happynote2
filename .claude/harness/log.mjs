#!/usr/bin/env node
// 늘어나는 기록은 append 전용 JSONL로 (MEMORY.md에 쌓지 않는다).
// 사용: node .claude/harness/log.mjs append <runs|confirmations|failures> '<json>'
//       node .claude/harness/log.mjs count-failure '<시그니처>'
import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./lib.mjs";

const KINDS = ["runs", "confirmations", "failures"];
const root = projectRoot();
const [sub, a, b] = process.argv.slice(2);
const file = (k) => join(root, "log", k + ".jsonl");
const fail = (error) => { console.log(JSON.stringify({ ok: false, error })); process.exit(1); };

if (sub === "append") {
  if (!KINDS.includes(a)) fail(`종류는 ${KINDS.join("|")}`);
  let rec;
  try { rec = JSON.parse(b); } catch { fail("JSON이 아님"); }
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) fail("객체여야 함");
  if (a === "failures" && typeof rec.signature !== "string") fail("failures에는 signature 필요");
  mkdirSync(join(root, "log"), { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...rec });
  appendFileSync(file(a), line + "\n");
  console.log(JSON.stringify({ ok: true, kind: a }));
} else if (sub === "count-failure") {
  if (typeof a !== "string" || !a) fail("시그니처 필요");
  const f = file("failures");
  const n = existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((r) => r && r.signature === a).length : 0;
  console.log(JSON.stringify({ signature: a, count: n }));
} else fail("사용: append <종류> '<json>' | count-failure '<시그니처>'");
