/**
 * SPEC_049: card cutting report for one caption file (a tool for people and the next session, not a test).
 *
 *   node --experimental-strip-types scripts/segment-report.ts <caption.srv3.xml> [--before <git ref>] [--examples <n>]
 *
 * Cuts the file with the working-tree code ("after") and with the code at <git ref> ("before", default HEAD),
 * then prints word-count and duration distributions, the SPEC_048/049 metrics, and changed cards.
 * The old code is extracted to .scratch/segment-report/<ref>/ (outside git).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseCaptionPayload } from "../src/services/captionPayload.ts";
import { cardMetrics, wordCount, type MetricCard } from "../tests/segmentMetrics.ts";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
if (!file) {
  console.error("usage: segment-report.ts <caption.srv3.xml> [--before <git ref>] [--examples <n>]");
  process.exit(2);
}
const ref = opt("before", "HEAD");
const examples = Number(opt("examples", "12"));

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const oldDir = path.join(root, ".scratch", "segment-report", ref.replace(/[^\w.-]/g, "_"));
for (const rel of ["src/workers/transcriptProcessor.ts", "src/workers/segmentBalance.ts", "src/utils/karaoke.ts"]) {
  const out = path.join(oldDir, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let text = "";
  try {
    text = execFileSync("git", ["show", `${ref}:${rel}`], { cwd: root, encoding: "utf8" });
  } catch {
    if (rel.endsWith("segmentBalance.ts")) text = "export {};\n"; // refs before SPEC_048 have no segmentBalance
    else throw new Error(`git show ${ref}:${rel} failed`);
  }
  fs.writeFileSync(out, text);
}

const before = await import(path.join(oldDir, "src/workers/transcriptProcessor.ts"));
const after = await import(path.join(root, "src/workers/transcriptProcessor.ts"));
const data = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/segment-length/cases.json"), "utf8"));
const cues = parseCaptionPayload(fs.readFileSync(path.resolve(file), "utf8"));
const manual = !cues.some((c) => Array.isArray(c.words) && c.words.length > 0);
const procOpts = { speedSpikeWpmThreshold: 180, defaultUnlockStep: 0 as const };
const cut = (mod: { mergeCuesIntoSegments: (c: unknown, o: unknown) => MetricCard[] }) => mod.mergeCuesIntoSegments(cues, procOpts);
const A = cut(before);
const B = cut(after);

const hist = (cards: MetricCard[], edges: number[], val: (c: MetricCard) => number, step: number) => {
  const counts = new Array(edges.length + 1).fill(0);
  for (const c of cards) {
    const v = val(c);
    let k = edges.findIndex((e) => v <= e);
    if (k < 0) k = edges.length;
    counts[k]++;
  }
  return counts.map((n, k) => {
    const label = k === 0 ? `<=${edges[0]}` : k === edges.length ? `>${edges[k - 1]}` : `${edges[k - 1] + step}-${edges[k]}`;
    return `${label}:${n}`;
  }).join("  ");
};
const metrics = (cards: MetricCard[]) =>
  cardMetrics(cards, { shortWords: data.shortWords, longWords: data.longWords, minCardSec: data.minCardSec, maxCardSec: data.maxCardSec, manual, lists: data.cut });

console.log(`# segment-report ${path.basename(file)} (${manual ? "manual" : "auto/ASR"} captions, ${cues.length} cues) — before = ${ref}, after = working tree`);
for (const [name, cards] of [["before", A], ["after", B]] as const) {
  console.log(`\n## ${name}: ${cards.length} cards`);
  console.log(`words    ${hist(cards, [3, 6, 10, 15, 20, 25], (c) => wordCount(c.text), 1)}`);
  console.log(`seconds  ${hist(cards, [1, 2, 4, 6, 8, 10], (c) => c.end - c.start, 0)}`);
  console.log(`metrics  ${JSON.stringify(metrics(cards))}`);
}

const beforeTexts = new Set(A.map((c) => c.text));
const changed = B.filter((c) => !beforeTexts.has(c.text));
console.log(`\n## changed cards: ${changed.length} of ${B.length} (showing ${Math.min(examples, changed.length)})`);
const fmt = (c: MetricCard) => `[${c.start.toFixed(1)}-${c.end.toFixed(1)}] ${c.text}`;
for (const c of changed.slice(0, examples)) {
  const olds = A.filter((o) => o.end > c.start + 0.05 && o.start < c.end - 0.05);
  console.log(`- before: ${olds.map(fmt).join("  ‖  ")}`);
  console.log(`  after:  ${fmt(c)}`);
}
