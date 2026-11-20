#!/usr/bin/env node
// 입구 검사: 파일을 뒤지기 전에 「지금 할 일」을 JSON 한 줄로 판정한다.
// 사용: node .claude/harness/gate.mjs [--root <dir>]
import { execFileSync } from "node:child_process";
import { statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { projectRoot, loadSpecs, readText, readJsonSafe } from "./lib.mjs";

const root = projectRoot();
const cfg = readJsonSafe(root, "harness.json", {}) || {};
const { specs, errors } = loadSpecs(root);
const byId = Object.fromEntries(specs.map((s) => [s.id, s]));

// 1. 진행할 SPEC: READY·IN_PROGRESS이고 의존이 모두 DONE (after_implemented면 IMPLEMENTED도)
const runnable = [], waiting = [];
for (const s of specs) {
  if (s.status !== "READY" && s.status !== "IN_PROGRESS") continue;
  const blockers = s.depends_on.filter((d) => {
    const ds = byId[d]?.status;
    return !(ds === "DONE" || (s.after_implemented && ds === "IMPLEMENTED"));
  });
  if (blockers.length) waiting.push({ id: s.id, blockers });
  else runnable.push({ id: s.id, status: s.status, iterations: s.iterations, max_iterations: s.max_iterations });
}
// IN_PROGRESS 먼저, 그다음 번호 순
runnable.sort((a, b) => (a.status === b.status ? a.id.localeCompare(b.id) : a.status === "IN_PROGRESS" ? -1 : 1));

const inProgress = specs.filter((s) => s.status === "IN_PROGRESS").map((s) => s.id);
const pendingHuman = specs.filter((s) => s.status === "IMPLEMENTED").map((s) => s.id);

// 2. git: 커밋 안 된 추적 파일, night/* 브랜치
const git = (...a) => { try { return execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } };
const dirty = (git("status", "--porcelain", "--untracked-files=no") ?? "").split("\n").filter(Boolean).map((l) => l.slice(3));
const nightBranches = (git("branch", "--list", "night/*", "--format=%(refname:short)") ?? "").split("\n").filter(Boolean);

// 3. MEMORY.md 크기 (S2)
const maxBytes = Math.round((cfg.memoryMaxKB ?? 20) * 1024);
const memFile = join(root, "MEMORY.md");
const bytes = existsSync(memFile) ? statSync(memFile).size : 0;

// 4. 백로그 「## 대기」 항목 수
const backlogText = readText(root, "memory/backlog.md");
const waitSection = (backlogText.split(/^## 대기\s*$/m)[1] || "").split(/^## /m)[0];
const backlog = waitSection.split("\n").filter((l) => l.startsWith("- ")).length;

console.log(JSON.stringify({
  mode: runnable.length ? "spec" : "improve",
  runnable, waiting, inProgress, pendingHuman, dirty,
  memory: { bytes, maxBytes, over: bytes > maxBytes },
  backlog, nightBranches,
  commitBlockers: inProgress, // S4: main을 막는 것은 IN_PROGRESS(❌ 남음)뿐
  errors,
}));
