#!/usr/bin/env node
// SPEC 상태 표. 원본은 각 SPEC front matter `status:`이고 이 표는 보여 주기만 한다(저장하지 않음).
// 사용: node .claude/harness/status.mjs [--json] [--root <dir>]
import { projectRoot, loadSpecs } from "./lib.mjs";

const root = projectRoot();
const { specs, errors } = loadSpecs(root);
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ specs, errors }));
} else {
  console.log("| SPEC | 상태 | 회차 | 의존 | 제목 |\n|---|---|---|---|---|");
  for (const s of specs) console.log(`| ${s.id} | ${s.status} | ${s.iterations}/${s.max_iterations} | ${s.depends_on.join(", ") || "-"} | ${s.title} |`);
  for (const e of errors) console.log(`오류: ${e}`);
}
process.exitCode = errors.length ? 1 : 0;
