#!/usr/bin/env node
// 세션 수명과 분리된 긴 명령 (세션이 끝나도 계속 돌고, 끝나면 종료 코드를 파일로 남긴다).
// 사용: node .claude/harness/run-detached.mjs start <name> -- <명령…>
//       node .claude/harness/run-detached.mjs status <name>
//       node .claude/harness/run-detached.mjs stop <name>   — 프로세스 그룹째 끈다
//       node .claude/harness/run-detached.mjs wait <name> [초]  — 끝나거나 초(기본 540)가 지날 때까지 기다린 뒤 status
import { spawn } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot, tail } from "./lib.mjs";

const root = projectRoot();
const dir = join(root, ".scratch", "detached");
const [sub, name] = process.argv.slice(2);
const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

if (!name || !/^[A-Za-z0-9._-]+$/.test(name) || !["start", "status", "stop", "wait"].includes(sub)) {
  console.log(JSON.stringify({ ok: false, error: "사용: start <name> -- <명령…> | status <name> | stop <name> | wait <name> [초]" }));
  process.exit(1);
}
const log = join(dir, name + ".log"), done = join(dir, name + ".done"), pidf = join(dir, name + ".pid"), stopped = join(dir, name + ".stopped");
const exitOf = () => Number(readFileSync(done, "utf8").trim());

if (sub === "start") {
  const dd = process.argv.indexOf("--");
  const cmd = dd >= 0 ? process.argv.slice(dd + 1) : [];
  if (!cmd.length) { console.log(JSON.stringify({ ok: false, error: "명령 없음" })); process.exit(1); }
  mkdirSync(dir, { recursive: true });
  rmSync(done, { force: true });
  rmSync(stopped, { force: true });
  const line = cmd.length === 1 ? cmd[0] : cmd.map(quote).join(" ");
  const child = spawn("sh", ["-c", `( ${line} ) > ${quote(log)} 2>&1; echo $? > ${quote(done + ".tmp")} && mv ${quote(done + ".tmp")} ${quote(done)}`], { cwd: root, detached: true, stdio: "ignore" });
  child.unref();
  writeFileSync(pidf, String(child.pid)); // 참고용
  console.log(JSON.stringify({ ok: true, name, pid: child.pid, log }));
} else if (sub === "stop") {
  if (existsSync(done)) { console.log(JSON.stringify({ ok: true, name, state: "done", exit: exitOf() })); process.exit(0); }
  if (!existsSync(pidf)) { console.log(JSON.stringify({ ok: false, error: `실행 기록 없음: ${name}` })); process.exit(1); }
  const pid = Number(readFileSync(pidf, "utf8").trim());
  // start가 detached로 띄워 sh가 그룹 우두머리다: -pid = 그룹 전체(하위 셸·실제 명령 포함)
  const signal = (sig) => { try { process.kill(-pid, sig); return true; } catch { return false; } };
  const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  if (pid > 0 && signal(0)) {
    signal("SIGTERM");
    for (let i = 0; i < 30 && signal(0); i++) nap(100);
    if (signal(0)) signal("SIGKILL");
  }
  writeFileSync(stopped, new Date().toISOString());
  console.log(JSON.stringify({ ok: true, name, state: "stopped" }));
} else {
  if (sub === "wait") {
    const rest = process.argv.slice(4);
    const ri = rest.indexOf("--root");
    if (ri >= 0) rest.splice(ri, 2);
    const sec = rest.length ? Number(rest[0]) : 540;
    const until = Date.now() + (sec >= 0 ? sec : 540) * 1000;
    const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    while (!existsSync(done) && !existsSync(stopped) && Date.now() < until) nap(Math.min(500, Math.max(1, until - Date.now())));
  }
  let state = "missing", exit = null;
  if (existsSync(done)) { state = "done"; exit = exitOf(); }
  else if (existsSync(stopped)) state = "stopped";
  else if (existsSync(log)) state = "running";
  const logTail = existsSync(log) ? tail(readFileSync(log, "utf8"), 10) : "";
  console.log(JSON.stringify({ name, state, exit, logTail }));
}
