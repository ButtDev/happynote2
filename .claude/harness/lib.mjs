// 하네스 공용: 프로젝트 루트, front matter 읽기, SPEC 목록. Node 내장 모듈만 쓴다.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const STATUSES = ["DRAFT", "READY", "IN_PROGRESS", "IMPLEMENTED", "DONE", "BLOCKED", "STOPPED", "DROPPED"];
export const SPEC_FILE = /^SPEC_(\d{3,})_[A-Z0-9_]+\.md$/;

// 루트: 인자 --root 또는 HARNESS_ROOT, 없으면 이 파일 기준 ../..
export function projectRoot(argv = process.argv) {
  const i = argv.indexOf("--root");
  if (i >= 0 && argv[i + 1]) return resolve(argv[i + 1]);
  if (process.env.HARNESS_ROOT) return resolve(process.env.HARNESS_ROOT);
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export const readText = (root, p) => {
  const f = join(root, p);
  return existsSync(f) ? readFileSync(f, "utf8") : "";
};

export function readJsonSafe(root, p, fallback = null) {
  const t = readText(root, p);
  if (!t) return fallback;
  try { return JSON.parse(t); } catch { return fallback; }
}

// front matter: `key: value` 줄, `[a, b]` 목록, `# 주석`, true/false/숫자. 그 밖의 YAML은 다루지 않는다.
export function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = {};
  for (const raw of m[1].split(/\r?\n/)) {
    // 줄 끝 ` #…`은 주석. 단 title은 사람이 읽는 자유 글이라 `#`을 그대로 둔다(예: 「버튼 #3」)
    const line = (/^title:/.test(raw) ? raw : raw.replace(/\s+#.*$/, "")).trimEnd();
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    else if (v === "true" || v === "false") v = v === "true";
    else if (/^-?\d+$/.test(v)) v = Number(v);
    out[kv[1]] = v;
  }
  return out;
}

// specs/ 의 SPEC 목록과 오류
export function loadSpecs(root) {
  const dir = join(root, "specs");
  const specs = [], errors = [];
  if (!existsSync(dir)) return { specs, errors };
  for (const file of readdirSync(dir).sort()) {
    if (!SPEC_FILE.test(file)) continue;
    const fm = parseFrontMatter(readFileSync(join(dir, file), "utf8"));
    if (!fm) { errors.push(`${file}: front matter 없음`); continue; }
    const id = typeof fm.id === "string" ? fm.id : file.match(/^(SPEC_\d+)/)[1];
    const status = typeof fm.status === "string" ? fm.status.toUpperCase() : "";
    if (!STATUSES.includes(status)) errors.push(`${id}: 모르는 상태 「${fm.status ?? ""}」`);
    specs.push({
      id, file, title: fm.title ?? "", status,
      iterations: Number.isInteger(fm.iterations) ? fm.iterations : 0,
      max_iterations: Number.isInteger(fm.max_iterations) ? fm.max_iterations : 3,
      depends_on: Array.isArray(fm.depends_on) ? fm.depends_on : [],
      after_implemented: fm.after_implemented === true,
    });
  }
  const seen = new Set();
  for (const s of specs) {
    if (seen.has(s.id)) errors.push(`${s.id}: id 중복`);
    seen.add(s.id);
  }
  for (const s of specs) for (const d of s.depends_on) if (!seen.has(d)) errors.push(`${s.id}: 없는 depends_on ${d}`);
  return { specs, errors };
}

export const tail = (s, n = 5) => String(s).trimEnd().split("\n").slice(-n).join("\n");
