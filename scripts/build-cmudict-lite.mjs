// SPEC_031: CMUdict + 낱말 빈도 목록 → src/data/cmudict-lite.txt (자주 쓰는 낱말만, 음소 한 글자 압축)
// 사용: node scripts/build-cmudict-lite.mjs <cmudict.dict> <en_50k.txt> [최대 낱말 수=30000]
// 원본: https://github.com/cmusphinx/cmudict (BSD 식 라이선스, 머리말에 고지 유지)
//       https://github.com/hermitdave/FrequencyWords (순서 고르기에만 씀, 배포하지 않음)
import fs from "node:fs";

const [dictPath, freqPath, maxArg] = process.argv.slice(2);
if (!dictPath || !freqPath) {
  console.error("사용: node scripts/build-cmudict-lite.mjs <cmudict.dict> <en_50k.txt> [최대]");
  process.exit(1);
}
const MAX = Number(maxArg || 30000);
const VOWELS = ["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"];
const CONS = ["B", "CH", "D", "DH", "F", "G", "HH", "JH", "K", "L", "M", "N", "NG", "P", "R", "S", "SH", "T", "TH", "V", "W", "Y", "Z", "ZH"];
const symbols = [...VOWELS.flatMap((v) => [0, 1, 2].map((s) => v + s)), ...CONS];
// 0x21('!')부터 — '#'(머리말)·공백 제외
const chars = [];
for (let c = 0x21; chars.length < symbols.length; c++) if (c !== 0x23) chars.push(String.fromCharCode(c));
const enc = new Map(symbols.map((s, i) => [s, chars[i]]));

const pron = new Map();
for (const line of fs.readFileSync(dictPath, "utf8").split("\n")) {
  const m = line.match(/^([a-z']+) ([A-Z0-9 ]+?)(\s*#.*)?$/);
  if (!m || pron.has(m[1])) continue; // 첫(주) 발음만, 변형 "(2)"는 정규식에서 빠짐
  pron.set(m[1], m[2].trim().split(" "));
}
const out = [];
const seen = new Set();
for (const line of fs.readFileSync(freqPath, "utf8").split("\n")) {
  const w = line.split(" ")[0]?.trim().toLowerCase();
  if (!w || seen.has(w) || !pron.has(w)) continue;
  seen.add(w);
  out.push(w + " " + pron.get(w).map((p) => enc.get(p)).join(""));
  if (out.length >= MAX) break;
}
const license = fs.readFileSync(new URL("../src/data/CMUDICT_LICENSE", import.meta.url), "utf8").trim().split("\n").map((l) => "# " + l);
const header = [
  "# cmudict-lite (SPEC_031) — CMU Pronouncing Dictionary 일부, 자주 쓰는 낱말 " + out.length + "개",
  "# 생성: node scripts/build-cmudict-lite.mjs <cmudict.dict> <en_50k.txt> " + MAX,
  ...license,
  "#map " + symbols.map((s, i) => s + "=" + chars[i]).join(" "),
];
fs.writeFileSync(new URL("../src/data/cmudict-lite.txt", import.meta.url), header.join("\n") + "\n" + out.join("\n") + "\n");
console.log(`wrote ${out.length} words`);
