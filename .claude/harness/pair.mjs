#!/usr/bin/env node
// 구현·검토 짝: herdr 작업 공간 하나에 구현 창과 검토 창을 띄워,
// 구현이 끝나면 검토 창(매 회 새 세션)이 변경을 보고 판정 파일을 남기고, FIX면 지적을 구현 창에 넘긴다.
// 사용: node .claude/harness/pair.mjs <폴더> --task "<과제 글>" [--rounds N] [--label <이름>] [--timeout-min M] [--dry-run]
//       node .claude/harness/pair.mjs --check   — herdr 서버 확인(꺼져 있으면 띄워 봄): 준비됨 0, 짝 불가 3
// 기록: <폴더>/.scratch/pair/<run>/ (task.md, log.jsonl, review-N.md)
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CLAUDE_CMD = "claude --permission-mode acceptEdits --allowedTools Bash Edit Write Read Glob Grep";
export const IMPL_PROMPT = (taskFile) => `과제 파일 ${taskFile} 를 읽고 그대로 한다. 끝나면 바꾼 것을 커밋하고 멈춘다.`;
export const FIX_PROMPT = (reviewFile) => `검토자가 지적을 남겼다: ${reviewFile} 를 읽고 고친다. 동의하지 않는 지적은 이유를 답에 적는다. 끝나면 커밋하고 멈춘다.`;
export const REVIEW_PROMPT = (taskFile, base, reviewFile) =>
  `너는 검토자다. 과제 파일 ${taskFile} 의 과제를 다른 에이전트가 이 폴더에서 구현했다. ` +
  `git diff ${base} 와 git status(커밋 안 한 변경)를 보고, 과제를 다 했는지·버그·빠진 시험을 검토한다. 코드는 고치지 않는다. ` +
  `결과를 ${reviewFile} 에 쓴다: 지적마다 한 줄(파일:줄 — 문제 — 고칠 방향), 마지막 줄은 고칠 것이 없으면 PAIR-VERDICT: OK, 있으면 PAIR-VERDICT: FIX.`;
export const VERDICT_RE = /^PAIR-VERDICT:\s*(OK|FIX)\s*$/;

const USAGE = '사용: node .claude/harness/pair.mjs <폴더> --task "<과제 글>" [--rounds N] [--label <이름>] [--timeout-min M] [--dry-run] | --check';
const bin = process.env.HERDR_BIN || "herdr";
const pre = process.env.HERDR_SESSION ? ["--session", process.env.HERDR_SESSION] : [];
// herdr 한 번 부르기 → 표준 출력 글(실패해도 출력이 있으면 돌려준다). 실행 파일이 없으면 ENOENT를 던진다.
function herdrRaw(a, { quiet = false } = {}) {
  const args = [...pre, ...a];
  const [cmd, argv] = bin.endsWith(".mjs") ? [process.execPath, [bin, ...args]] : [bin, args];
  try { return execFileSync(cmd, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { if (e.code === "ENOENT") throw e; const out = String(e.stdout || ""); if (quiet || out.trim()) return out; throw e; }
}
// 서버 확인 → null(준비됨) | "<짝 불가 이유>"
export function serverProblem() {
  const running = () => /status:\s*running/.test(herdrRaw(["status", "server"], { quiet: true }));
  try { if (running()) return null; } catch (e) { return e.code === "ENOENT" ? "herdr 없음" : "herdr 서버를 띄우지 못함"; }
  const [cmd, argv] = bin.endsWith(".mjs") ? [process.execPath, [bin, ...pre, "server"]] : [bin, [...pre, "server"]];
  try { spawn(cmd, argv, { detached: true, stdio: "ignore" }).unref(); } catch { return "herdr 서버를 띄우지 못함"; }
  const until = Date.now() + Number(process.env.PAIR_SERVER_WAIT_MS ?? 15000);
  for (;;) {
    try { if (running()) return null; } catch { /* 다시 */ }
    if (Date.now() >= until) return "herdr 서버를 띄우지 못함";
    sleep(Math.min(500, Math.max(1, until - Date.now())));
  }
}

function parseArgs(argv) {
  const o = { rounds: 2, timeoutMin: 60, dry: false, dir: null, task: null, label: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--task") o.task = argv[++i];
    else if (a === "--rounds") o.rounds = Number(argv[++i]);
    else if (a === "--label") o.label = argv[++i];
    else if (a === "--timeout-min") o.timeoutMin = Number(argv[++i]);
    else if (a === "--dry-run") o.dry = true;
    else if (a === "--check") o.check = true;
    else if (!o.dir) o.dir = a;
  }
  return o;
}

export function lastVerdict(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) { const m = lines[i].match(VERDICT_RE); if (m) return m[1]; }
  return null;
}

const sleep = (ms) => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.check) {
    const p = serverProblem();
    if (p) { console.log(`pair: 짝 불가 — ${p}`); return 3; }
    console.log("pair: 준비됨");
    return 0;
  }
  if (!o.dir || !o.task || !(o.rounds >= 1) || !(o.timeoutMin > 0)) { console.error(USAGE); return 2; }
  const dir = resolve(o.dir);
  let base;
  try {
    const g = (...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (realpathSync(g("rev-parse", "--show-toplevel")) !== realpathSync(dir)) throw new Error("not top"); // 상위 저장소 안의 폴더는 아님
    base = g("rev-parse", "HEAD");
  } catch { console.error(`pair: git 저장소가 아님: ${dir}`); return 2; }

  const pollMs = Number(process.env.PAIR_POLL_MS ?? 1000);
  const timeoutMs = Math.round(o.timeoutMin * 60_000);
  const label = o.label || `pair-${basename(dir)}`;
  const run = process.env.PAIR_RUN_ID || stamp();
  const outDir = join(dir, ".scratch", "pair", run); // 과제·기록·판정 파일(대상 폴더 안)
  const runDir = process.env.PAIR_LOG_DIR ? join(process.env.PAIR_LOG_DIR, run) : outDir;
  const logFile = join(runDir, "log.jsonl");

  function herdr(...a) {
    if (o.dry) { console.log(["herdr", ...a].map((x) => (/\s/.test(x) ? JSON.stringify(x) : x)).join(" ")); return {}; }
    let out;
    try { out = herdrRaw(a); }
    catch (e) { out = String(e.stdout || e.stderr || ""); if (!out.trim().startsWith("{")) throw e; }
    out = out.trim();
    if (!out) return {}; // pane run 등은 성공해도 아무것도 출력하지 않는다
    return out.startsWith("{") ? JSON.parse(out) : { text: out }; // pane read는 화면 글 그대로
  }
  const log = (step, pane, round, detail) => {
    if (o.dry) return;
    mkdirSync(runDir, { recursive: true });
    appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), step, pane, round, detail }) + "\n");
  };
  let rounds = 0;
  const end = (result, detail) => {
    if (!o.dry) appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), step: "end", result, rounds, detail }) + "\n");
    console.log(`pair: ${result} (${rounds}회 검토) — ${label}`);
    return result === "ok" ? 0 : 1;
  };
  const tail = (pane) => {
    try { return (herdr("pane", "read", pane, "--source", "recent", "--lines", "30").text ?? "").slice(-3000); }
    catch { return ""; }
  };
  // 프롬프트를 넣고 끝(idle·done·blocked)까지 기다린다 → "ok" | "blocked" | "timeout"
  const ask = (pane, text) => {
    const r = herdr("agent", "prompt", pane, text, "--wait", "--timeout", String(timeoutMs));
    if (o.dry) return "ok";
    if (r.error) return r.error.code === "timeout" ? "timeout" : r.error.code === "agent_blocked" ? "blocked" : `error:${r.error.code}`;
    const st = r.result?.agent?.agent_status;
    return st === "blocked" ? "blocked" : "ok";
  };
  // claude가 뜨고 입력을 받을 수 있을 때까지
  const ready = (pane) => {
    if (o.dry) return "ok";
    const until = Date.now() + Math.min(timeoutMs, 120_000);
    for (;;) {
      const r = herdr("agent", "get", pane);
      const st = r.result?.agent?.agent_status;
      if (st === "idle" || st === "done") return "ok";
      if (st === "blocked") return "blocked";
      if (Date.now() > until) return "timeout";
      sleep(pollMs);
    }
  };

  if (!o.dry) {
    const p = serverProblem();
    if (p) { console.log(`pair: 짝 불가 — ${p}`); return 3; }
  }
  const existing = o.dry ? [] : (herdr("workspace", "list").result?.workspaces ?? []).map((w) => w.label);
  if (existing.includes(label)) { console.error(`pair: 이미 있음: ${label}`); return 2; }

  if (!o.dry) { mkdirSync(runDir, { recursive: true }); mkdirSync(outDir, { recursive: true }); }
  const taskFile = join(runDir, "task.md");
  if (!o.dry) writeFileSync(taskFile, o.task.trim() + "\n");
  log("start", null, 0, { dir, base, label, rounds: o.rounds });

  const ws = herdr("workspace", "create", "--cwd", dir, "--label", label, "--no-focus");
  const impl = o.dry ? "<impl>" : ws.result?.root_pane?.pane_id;
  const sp = herdr("pane", "split", impl, "--direction", "right", "--cwd", dir);
  const rev = o.dry ? "<review>" : sp.result?.pane?.pane_id;
  if (!impl || !rev) return end("error", { ws, sp });
  log("panes", null, 0, { impl, rev, workspace: ws.result?.workspace?.workspace_id });
  for (const p of [impl, rev]) herdr("pane", "run", p, CLAUDE_CMD);
  for (const p of [impl, rev]) {
    const st = ready(p);
    if (st !== "ok") { log("startup", p, 0, { status: st, tail: tail(p) }); return end(st === "blocked" ? "blocked" : "timeout"); }
  }

  let st = ask(impl, IMPL_PROMPT(taskFile));
  log("impl", impl, 1, { status: st });
  for (;;) {
    if (st !== "ok") return end(st === "blocked" ? "blocked" : st === "timeout" ? "timeout" : "error", { pane: impl, tail: tail(impl) });
    rounds++;
    if (rounds > 1) {
      herdr("agent", "prompt", rev, "/clear");
      herdr("agent", "wait", rev, "--timeout", "30000");
      log("clear", rev, rounds, {});
    }
    const reviewFile = join(outDir, `review-${rounds}.md`);
    st = ask(rev, REVIEW_PROMPT(taskFile, base, reviewFile));
    log("review", rev, rounds, { status: st });
    if (st !== "ok") return end(st === "blocked" ? "blocked" : st === "timeout" ? "timeout" : "error", { pane: rev, tail: tail(rev) });
    if (o.dry) return end("ok");
    const text = existsSync(reviewFile) ? readFileSync(reviewFile, "utf8") : null;
    const verdict = text == null ? null : lastVerdict(text);
    log("verdict", rev, rounds, { verdict, file: reviewFile });
    if (!verdict) return end("no-verdict", { file: reviewFile });
    if (verdict === "OK") return end("ok");
    if (rounds >= o.rounds) return end("rounds");
    st = ask(impl, FIX_PROMPT(reviewFile));
    log("fix", impl, rounds + 1, { status: st });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
