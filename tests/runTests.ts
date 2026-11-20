import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildYouTubeEmbedParams,
  buildYouTubeEmbedUrl,
  formatSecondsToTimestamp,
  generateBookmarkletCode,
  parseTimestampToSeconds,
  parseYouTubeUrl,
} from "../src/utils/youtubeUrlParser.ts";
import { SegmentTimeIndex } from "../src/utils/binarySearch.ts";
import { mergeCuesIntoSegments } from "../src/workers/transcriptProcessor.ts";
import { TranscriptWorkerManager } from "../src/workers/WorkerPoolManager.ts";
import { AgyCliService } from "../src/services/AgyCliService.ts";
import { DEFAULT_EAR_COACH_SETTINGS } from "../src/types/settings.ts";
import {
  isDesktopApp,
  isMobileApp,
  requireDesktopModule,
  setPlatformMobileOverrideForTest,
} from "../src/utils/platform.ts";
import type { RawTranscriptCue } from "../src/types/transcript.ts";
import { clampLandscapeLeftPercent, landscapeLeftPercentFromPointer } from "../src/utils/landscapeSplit.ts";
import * as ankiSrc from "../src/services/anki.ts";
import { DictionaryApiDevProvider, normalizeLookupWord, parseCommonsAudioUrl, parseDictionaryApiDev, phraseCandidates, lemmaVariants, pickPronunciation } from "../src/services/dictionary.ts";

const logs: string[] = [];
function log(line: string) {
  console.log(line);
  logs.push(line);
}

async function runAllTests() {
  log("==============================================================");
  log("Obsidian Ear-Coach (YouTube + Obsidian + agy CLI) Test Report");
  log(`Executed At: ${new Date().toISOString()}`);
  log("==============================================================\n");

  // 1. Test YouTube URL & Timestamp Parser
  log("[Test 1] YouTube URL & Timestamp Parser");
  const u1 = parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2m22s");
  assert.ok(u1);
  assert.equal(u1.videoId, "dQw4w9WgXcQ");
  assert.equal(u1.timestampSeconds, 142);

  const u2 = parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=85");
  assert.ok(u2);
  assert.equal(u2.videoId, "dQw4w9WgXcQ");
  assert.equal(u2.timestampSeconds, 85);

  const u3 = parseYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ");
  assert.ok(u3);
  assert.equal(u3.videoId, "dQw4w9WgXcQ");

  assert.equal(parseTimestampToSeconds("02:22"), 142);
  assert.equal(parseTimestampToSeconds("1h02m03s"), 3723);
  assert.equal(formatSecondsToTimestamp(142), "02:22");
  assert.ok(generateBookmarkletCode().includes("obsidian://ear-coach?url="));
  log("  -> PASS: Standard URLs, Shorts, youtu.be, timestamps, and bookmarklet verified.\n");

  // 2. Test Transcript Sentence Merging, WPM & Phonetic Trap Heuristics
  log("[Test 2] Transcript Processor & Phonetic Trap Detection");
  const sampleCues: RawTranscriptCue[] = [
    { start: 10.0, duration: 1.2, text: "I am going to" },
    { start: 11.2, duration: 1.3, text: "tell you why I bought a car." },
    { start: 14.5, duration: 1.0, text: "Did you eat yet or should have waited?" },
  ];

  const segments = mergeCuesIntoSegments(sampleCues, {
    speedSpikeWpmThreshold: 170,
    defaultUnlockStep: 0,
    pinnedTimestamps: [11.5],
  });

  assert.equal(segments.length, 2);
  assert.equal(segments[0].text, "I am going to tell you why I bought a car.");
  assert.equal(segments[0].isPinned, true);
  assert.ok(segments[0].analysis);
  assert.ok(segments[0].analysis.traps.includes("WEAK_FORM"));
  assert.ok(segments[0].analysis.traps.includes("FLAP_T"));
  assert.ok(segments[1].analysis?.traps.includes("LINKING"));
  log(`  -> PASS: Merged ${sampleCues.length} cues into ${segments.length} sentences with accurate phonetic traps (${segments[0].analysis.traps.join(", ")}).\n`);

  // 2-B. Sentence-Boundary Splitting (Mid-cue periods, abbreviations, long & short sentences)
  log("[Test 2-B] Sentence-Level Segmentation Quality");
  const mixedSentenceCues: RawTranscriptCue[] = [
    { start: 0.0, duration: 4.0, text: "It was great. Next week Dr. Kim and I" },
    { start: 4.0, duration: 2.5, text: "will visit the U.S. office together." },
    { start: 7.0, duration: 1.5, text: "Yes, we will!" },
    {
      start: 9.0,
      duration: 6.0,
      text: "Even when a single punctuated sentence becomes quite long with twenty-five words or more it should stay together as one coherent sentence card.",
    },
  ];
  const sentenceSegs = mergeCuesIntoSegments(mixedSentenceCues, {
    speedSpikeWpmThreshold: 175,
    defaultUnlockStep: 0,
  });
  assert.equal(sentenceSegs.length, 4, `Expected 4 exact sentences, got ${sentenceSegs.length}`);
  assert.equal(sentenceSegs[0].text, "It was great.");
  assert.equal(sentenceSegs[1].text, "Next week Dr. Kim and I will visit the U.S. office together.");
  assert.equal(sentenceSegs[2].text, "Yes, we will!");
  assert.ok(sentenceSegs[3].words.length >= 23, "Long punctuated sentence must stay intact");
  log("  -> PASS: Mid-cue sentence split, abbreviation protection (Dr., U.S.), short sentences, and long sentences verified.\n");

  // 2-C. Punctuation-Free ASR Timeline Overlap, Rolling Deduplication & Non-Clipped Conjunctions
  log("[Test 2-C] Punctuation-Free ASR Timeline Normalization & Rolling Deduplication");
  const asrCues: RawTranscriptCue[] = [
    { start: 0.0, duration: 5.0, text: "I went to the store yesterday" },
    { start: 2.1, duration: 4.5, text: "store yesterday and bought some fresh apples for my family" },
    { start: 6.0, duration: 2.2, text: "then we came back home" },
  ];
  const asrSegs = mergeCuesIntoSegments(asrCues, {
    speedSpikeWpmThreshold: 175,
    defaultUnlockStep: 0,
  });
  assert.equal(asrSegs.length, 1, "16-word ASR utterance with overlapping cues must stay as 1 natural sentence");
  assert.equal(
    asrSegs[0].text,
    "I went to the store yesterday and bought some fresh apples for my family then we came back home"
  );
  assert.ok(asrSegs[0].end >= 8.0, "Normalized end time must cover final cue");
  log("  -> PASS: Rolling overlap deduplication, overlapping cue clamping, and smooth ASR merging verified.\n");

  // 3. Large Dataset Performance & Binary Search Memoization Benchmark
  log("[Test 3] High-Volume Dataset Performance & Memoized Binary Search (5,000 cues)");
  const largeCues: RawTranscriptCue[] = [];
  for (let i = 0; i < 5000; i++) {
    largeCues.push({
      start: i * 2.5,
      duration: 2.2,
      text: i % 3 === 2 ? "We are going to make it work today." : "When you want to learn fast",
    });
  }

  const t0 = performance.now();
  const largeSegments = mergeCuesIntoSegments(largeCues, {
    speedSpikeWpmThreshold: 180,
    defaultUnlockStep: 0,
    pinnedTimestamps: [125, 2500],
  });
  const mergeElapsedMs = performance.now() - t0;

  const index = new SegmentTimeIndex(largeSegments);
  const t1 = performance.now();
  let hits = 0;
  // Simulate 10,000 playback time ticks (sequential + random seeks)
  for (let tick = 0; tick < 10000; tick++) {
    const timeSec = (tick * 0.25) % (largeCues.length * 2.5);
    const idx = index.findActiveSegmentIndex(timeSec);
    if (idx >= 0) hits++;
  }
  const searchElapsedMs = performance.now() - t1;

  assert.ok(largeSegments.length > 1500);
  assert.ok(hits > 5000);
  assert.ok(mergeElapsedMs < 500, `Merge took too long: ${mergeElapsedMs}ms`);
  assert.ok(searchElapsedMs < 50, `Search took too long: ${searchElapsedMs}ms`);
  log(
    `  -> PASS: 5,000 cues merged into ${largeSegments.length} segments in ${mergeElapsedMs.toFixed(2)}ms; 10,000 time-sync lookups completed in ${searchElapsedMs.toFixed(2)}ms.\n`
  );

  // 4. Test AgyCliService Connection & Worker Session Parsing
  log("[Test 4] AgyCliService & Web Worker Session Parsing");
  const agyService = new AgyCliService(() => "agy", () => "");
  const agyAvailable = await agyService.checkAgyAvailable();
  assert.equal(agyAvailable, true, "Local agy CLI should be reachable");

  const sampleSessionMarkdown = `
# Sample Title
\`\`\`ear-coach-session
{
  "videoId": "test1234",
  "title": "Test Title",
  "segments": [],
  "pinnedTimestamps": [10]
}
\`\`\`
`;
  const workerManager = new TranscriptWorkerManager();
  const parsedSession = await workerManager.parseSessionAsync(sampleSessionMarkdown);
  assert.equal(parsedSession?.videoId, "test1234", "Worker session parsing must succeed");
  assert.equal(parsedSession?.pinnedTimestamps[0], 10, "Pinned timestamp must match");
  workerManager.destroy();
  log("  -> PASS: Local agy CLI responsive & Worker session parsing verified.\n");

  // 5. File Size & Zero-Blur Policy Verification
  log("[Test 5] File Line Limit (< 900 lines) & Zero-Blur CSS Audit");
  const srcFiles: string[] = [];
  function walkDir(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(full);
      else if (entry.name.endsWith(".ts")) srcFiles.push(full);
    }
  }
  walkDir(path.resolve("src"));

  for (const file of srcFiles) {
    const content = fs.readFileSync(file, "utf8");
    const lineCount = content.split(/\r?\n/).length;
    const rel = path.relative(process.cwd(), file);
    assert.ok(lineCount < 900, `${rel} exceeded 900 lines (${lineCount})`);
    log(`  - ${rel}: ${lineCount} lines (OK)`);
  }

  const cssContent = fs.readFileSync(path.resolve("styles.css"), "utf8");
  // Ensure no CSS property uses blur() or backdrop-filter
  const cssCodeWithoutComments = cssContent.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/backdrop-filter|filter:\s*blur/i.test(cssCodeWithoutComments), false);
  log("  -> PASS: All source files are under 900 lines and styles.css has 0 blur effects.\n");

  // 6. Mobile Compatibility & Platform Isolation Verification
  log("[Test 6] Mobile Compatibility & Desktop/Mobile Separation Audit");
  const manifest = JSON.parse(fs.readFileSync(path.resolve("manifest.json"), "utf8"));
  assert.equal(manifest.isDesktopOnly, false, "manifest.json must allow mobile installation");
  assert.equal(DEFAULT_EAR_COACH_SETTINGS.mobileListHeightPercent, 50, "Mobile list height must default to 50%");

  try {
    setPlatformMobileOverrideForTest(true);
    assert.equal(isMobileApp(), true);
    assert.equal(isDesktopApp(), false);
    const mobileAgyAvailable = await agyService.checkAgyAvailable();
    assert.equal(mobileAgyAvailable, false, "agy CLI must be disabled on mobile");
    assert.throws(
      () => requireDesktopModule("child_process"),
      /not available on mobile/,
      "requireDesktopModule must block Node built-ins on mobile"
    );
  } finally {
    setPlatformMobileOverrideForTest(null);
  }
  assert.equal(isDesktopApp(), true, "Platform override must restore desktop mode cleanly");

  const bundlePath = path.resolve("main.js");
  if (fs.existsSync(bundlePath)) {
    const bundleCode = fs.readFileSync(bundlePath, "utf8");
    const forbiddenStaticRequires = [
      /require\(["']child_process["']\)/,
      /require\(["']fs\/promises["']\)/,
      /require\(["']path["']\)/,
      /require\(["']os["']\)/,
      /require\(["']util["']\)/,
    ];
    for (const pattern of forbiddenStaticRequires) {
      assert.equal(
        pattern.test(bundleCode),
        false,
        `main.js must not contain static ${pattern} that crashes mobile WebView`
      );
    }
    log("  -> PASS: main.js contains zero static Node.js built-in require() calls.");
  }
  log("  -> PASS: Mobile guard, manifest.json (isDesktopOnly: false), and platform isolation verified.\n");

  // 7. Removed temporary features (SPEC_012) — data in tests/fixtures/removed-features/
  //    EAR_COACH_ROOT로 검사 대상 폴더를 바꿀 수 있다(변이 시험용).
  log("[Test 7] Removed Temporary Features (data-driven)");
  const removedDir = path.resolve("tests/fixtures/removed-features");
  const scanRoot = path.resolve(process.env.EAR_COACH_ROOT ?? ".");
  const listFiles = (p: string): string[] => {
    if (!fs.existsSync(p)) return [];
    if (fs.statSync(p).isFile()) return [p];
    return fs.readdirSync(p).flatMap((n) => listFiles(path.join(p, n)));
  };
  for (const f of fs.readdirSync(removedDir).filter((n) => n.endsWith(".json")).sort()) {
    const c = JSON.parse(fs.readFileSync(path.join(removedDir, f), "utf8"));
    const targets = (c.files as string[]).flatMap((t) => listFiles(path.join(scanRoot, t)));
    assert.ok(targets.length > 0, `${f}: no files to scan under ${scanRoot}`);
    for (const file of targets) {
      const text = fs.readFileSync(file, "utf8");
      for (const word of c.forbidden as string[]) {
        assert.ok(!text.includes(word), `${f}: "${word}" still in ${path.relative(scanRoot, file)}`);
      }
    }
    log(`  -> PASS: ${f} (${c.name}) — ${targets.length} files clean`);
  }
  log("");

  // 8. YouTube embed params (SPEC_007) — data in tests/fixtures/youtube-embed/
  log("[Test 8] YouTube Embed Params: mobile hides native controls (data-driven)");
  const embedDir = path.resolve("tests/fixtures/youtube-embed");
  for (const f of fs.readdirSync(embedDir).filter((n) => n.endsWith(".json")).sort()) {
    const c = JSON.parse(fs.readFileSync(path.join(embedDir, f), "utf8"));
    for (const k of c.cases) {
      const tag = `mobile=${k.mobile}${k.ytOverlay ? " ytOverlay" : ""}`;
      const params = buildYouTubeEmbedParams(c.origin, k.mobile, k.ytOverlay ?? false);
      for (const [key, val] of Object.entries(k.expectParams)) {
        assert.equal(params[key], val, `${f} ${tag}: param ${key}`);
      }
      for (const key of k.absentParams) {
        assert.equal(key in params, false, `${f} ${tag}: param ${key} must be absent`);
      }
      const url = buildYouTubeEmbedUrl(c.videoId, c.origin, k.mobile, k.ytOverlay ?? false);
      for (const part of k.expectUrlIncludes) {
        assert.ok(url.includes(part), `${f} ${tag}: url missing "${part}" in ${url}`);
      }
      log(`  -> PASS: ${f} ${tag}`);
    }
  }
  log("");

  log("[Test 9] Landscape split ratio: clamp & pointer → percent (data-driven, SPEC_011)");
  const splitCases = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/landscape-split/cases.json"), "utf8"));
  assert.equal(DEFAULT_EAR_COACH_SETTINGS.mobileLandscapeLeftPercent, 58, "landscape left default 58");
  for (const k of splitCases.clamp) {
    assert.equal(clampLandscapeLeftPercent(k.in), k.out, `clamp ${JSON.stringify(k.in)}`);
  }
  for (const k of splitCases.pointer) {
    assert.equal(landscapeLeftPercentFromPointer(k.clientX, k.left, k.width), k.out, `pointer x=${k.clientX} left=${k.left} w=${k.width}`);
  }
  log(`  -> PASS: ${splitCases.clamp.length + splitCases.pointer.length} landscape-split cases`);
  log("");

  // 10. No static Node built-in imports on the mobile path — data in tests/fixtures/mobile-imports/
  //     EAR_COACH_ROOT로 검사 대상 폴더를 바꿀 수 있다(변이 시험용).
  log("[Test 10] Mobile path: no static Node built-in import/require (data-driven)");
  const mi = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/mobile-imports/rules.json"), "utf8"));
  const forbiddenMods = new Set<string>(mi.forbidden);
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
  const staticNodeImports = (code: string): string[] => {
    const text = stripComments(code);
    const found: string[] = [];
    const patterns = [
      /(?:^|[\n;])\s*(?:import|export)\s+(?!type\s)[^;'"]*?\sfrom\s*["'](?:node:)?([\w/]+)["']/g,
      /(?:^|[\n;])\s*import\s*["'](?:node:)?([\w/]+)["']/g,
      /(?<![\w.$])require\(\s*["'](?:node:)?([\w/]+)["']\s*\)/g,
    ];
    for (const re of patterns) {
      for (const m of text.matchAll(re)) if (forbiddenMods.has(m[1])) found.push(m[1]);
    }
    return found.sort();
  };
  for (const k of mi.detectorCases) {
    assert.deepEqual(staticNodeImports(k.code), [...k.violations].sort(), `detector case: ${JSON.stringify(k.code)}`);
  }
  const miRoot = path.resolve(process.env.EAR_COACH_ROOT ?? ".");
  const miSrc: string[] = [];
  const walkTs = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkTs(full);
      else if (e.name.endsWith(".ts")) miSrc.push(full);
    }
  };
  walkTs(path.join(miRoot, mi.srcDir));
  assert.ok(miSrc.length > 0, `no .ts files under ${path.join(miRoot, mi.srcDir)}`);
  for (const file of miSrc) {
    const bad = staticNodeImports(fs.readFileSync(file, "utf8"));
    assert.deepEqual(bad, [], `${path.relative(miRoot, file)}: static Node import ${bad.join(", ")} — use requireDesktopModule()`);
  }
  log(`  -> PASS: ${mi.detectorCases.length} detector cases, ${miSrc.length} src files clean`);
  const miBundle = path.join(miRoot, mi.bundle);
  if (fs.existsSync(miBundle)) {
    const bundleCode = fs.readFileSync(miBundle, "utf8");
    const bad = [...bundleCode.matchAll(/(?<![\w.$])require\(\s*["'](?:node:)?([\w/]+)["']\s*\)/g)]
      .map((m) => m[1])
      .filter((m) => forbiddenMods.has(m));
    assert.deepEqual(bad, [], `${mi.bundle}: static require of Node built-ins ${bad.join(", ")}`);
    log(`  -> PASS: ${mi.bundle} has no static require() of ${forbiddenMods.size} Node built-ins`);
  }
  log("");

  // 11. Dictionary (SPEC_013) — data in tests/fixtures/dictionary/ (실제 dictionaryapi.dev 응답)
  //     EAR_COACH_DICT_MODULE로 대상 모듈을 바꿀 수 있다(변이 시험용).
  log("[Test 11] Dictionary: normalize word & parse dictionaryapi.dev (data-driven, SPEC_013)");
  const dictMod = process.env.EAR_COACH_DICT_MODULE
    ? await import(path.resolve(process.env.EAR_COACH_DICT_MODULE))
    : { normalizeLookupWord, parseDictionaryApiDev, DictionaryApiDevProvider, pickPronunciation, parseCommonsAudioUrl, lemmaVariants, phraseCandidates };
  const dictDir = path.resolve("tests/fixtures/dictionary");
  const norm = JSON.parse(fs.readFileSync(path.join(dictDir, "_normalize.json"), "utf8"));
  for (const [raw, want] of norm.cases) {
    assert.equal(dictMod.normalizeLookupWord(raw), want, `normalizeLookupWord(${JSON.stringify(raw)})`);
  }
  let dictCount = 0;
  for (const f of fs.readdirSync(dictDir).filter((n) => n.endsWith(".json") && !n.startsWith("_")).sort()) {
    const c = JSON.parse(fs.readFileSync(path.join(dictDir, f), "utf8"));
    const got = dictMod.parseDictionaryApiDev(c.response);
    if (c.expect === null) {
      assert.equal(got, null, `${f}: expected null`);
    } else {
      assert.ok(got, `${f}: parsed null`);
      assert.equal(got.word, c.expect.word, `${f}: word`);
      assert.equal(got.phonetic, c.expect.phonetic, `${f}: phonetic`);
      assert.equal(got.audioUrl, c.expect.audioUrl, `${f}: audioUrl`);
      if ("commonsPageId" in c.expect) assert.equal(dictMod.pickPronunciation(c.response).commonsPageId, c.expect.commonsPageId, `${f}: commonsPageId`);
      assert.deepEqual(got.meanings.map((m: any) => m.partOfSpeech), c.expect.partsOfSpeech, `${f}: partsOfSpeech`);
      assert.equal(got.meanings[0].definitions[0].definition, c.expect.firstDefinition, `${f}: firstDefinition`);
      assert.ok(got.meanings.length <= 3, `${f}: at most 3 parts of speech`);
      for (const m of got.meanings) assert.ok(m.definitions.length >= 1 && m.definitions.length <= 3, `${f}: ${m.partOfSpeech} 1~3 definitions`);
    }
    dictCount++;
  }
  // 제공자: 404 → null, 캐시(같은 단어 두 번이면 fetch 1회), 정리된 단어로 URL
  const fetched: string[] = [];
  const helloRaw = JSON.parse(fs.readFileSync(path.join(dictDir, "hello.json"), "utf8")).response;
  const prov = new dictMod.DictionaryApiDevProvider(async (url: string) => {
    fetched.push(url);
    return url.endsWith("/hello") ? { status: 200, json: helloRaw } : { status: 404, json: {} };
  });
  assert.equal((await prov.lookup("Hello,"))?.word, "hello", "provider hello");
  await prov.lookup("HELLO");
  assert.equal(await prov.lookup("qwzxv"), null, "provider 404 → null");
  assert.deepEqual(fetched.filter((u) => u.includes("dictionaryapi.dev")), ["https://api.dictionaryapi.dev/api/v2/entries/en/hello", "https://api.dictionaryapi.dev/api/v2/entries/en/qwzxv"], "provider fetch once per word");
  // 발음: Commons imageinfo 응답 → upload.wikimedia.org 파일(SPEC_013 회차 2, mp3 404 대응)
  const commonsDir = path.join(dictDir, "commons");
  const commonsCases = fs.readdirSync(commonsDir).filter((n) => n.endsWith(".json")).sort();
  for (const f of commonsCases) {
    const c = JSON.parse(fs.readFileSync(path.join(commonsDir, f), "utf8"));
    assert.equal(dictMod.parseCommonsAudioUrl(c.response), c.expect, `commons/${f}`);
  }
  // 제공자: 사전 응답의 curid로 Commons를 부르고 audioUrl을 바꾼다. Commons 실패면 원래 주소 유지.
  const runRaw = JSON.parse(fs.readFileSync(path.join(dictDir, "run.json"), "utf8"));
  const runCommons = JSON.parse(fs.readFileSync(path.join(commonsDir, "run-us.json"), "utf8"));
  const audioFetched: string[] = [];
  const provA = new dictMod.DictionaryApiDevProvider(async (url: string) => {
    audioFetched.push(url);
    if (url.includes("commons.wikimedia.org")) return { status: 200, json: runCommons.response };
    return { status: 200, json: runRaw.response };
  });
  assert.equal((await provA.lookup("run"))?.audioUrl, runCommons.expect, "provider audioUrl → Commons");
  assert.ok(audioFetched[1]?.includes(`pageids=${runRaw.expect.commonsPageId}`), "provider asks Commons with curid");
  const provB = new dictMod.DictionaryApiDevProvider(async (url: string) => {
    if (url.includes("commons.wikimedia.org")) throw new Error("offline");
    return { status: 200, json: runRaw.response };
  });
  assert.equal((await provB.lookup("run"))?.audioUrl, runRaw.expect.audioUrl, "provider keeps audioUrl when Commons fails");
  // SPEC_014: 원형 후보·구동사 후보
  const phr = JSON.parse(fs.readFileSync(path.join(dictDir, "_phrases.json"), "utf8"));
  for (const [w, want] of phr.lemma) assert.deepEqual(dictMod.lemmaVariants(w), want, `lemmaVariants(${JSON.stringify(w)})`);
  for (const [[t, f], want] of phr.phrases) assert.deepEqual(dictMod.phraseCandidates(t, f), want, `phraseCandidates(${JSON.stringify(t)}, ${JSON.stringify(f)})`);
  log(`  -> PASS: ${norm.cases.length} normalize cases, ${dictCount} response fixtures, provider cache/404, ${commonsCases.length} commons cases, audio → Commons, ${phr.lemma.length} lemma + ${phr.phrases.length} phrase cases`);
  log("");

  // 12. Anki (SPEC_015) — data in tests/fixtures/anki/. EAR_COACH_ANKI_MODULE로 대상 모듈을 바꿀 수 있다(변이 시험용).
  log("[Test 12] Anki: cloze, note build, field remap, AnkiConnect response (data-driven, SPEC_015)");
  const ankiMod = process.env.EAR_COACH_ANKI_MODULE ? await import(path.resolve(process.env.EAR_COACH_ANKI_MODULE)) : ankiSrc;
  const ankiDir = path.resolve("tests/fixtures/anki");
  const clozeData = JSON.parse(fs.readFileSync(path.join(ankiDir, "_cloze.json"), "utf8"));
  for (const [args, want] of clozeData.cases) {
    assert.equal(ankiMod.clozeSentence(...(args as [string, string, string?])), want, `clozeSentence(${JSON.stringify(args)})`);
  }
  const ankiDefaults = {
    ankiDeck: DEFAULT_EAR_COACH_SETTINGS.ankiDeck,
    ankiNoteType: DEFAULT_EAR_COACH_SETTINGS.ankiNoteType,
    ankiFieldMap: DEFAULT_EAR_COACH_SETTINGS.ankiFieldMap,
    ankiTags: DEFAULT_EAR_COACH_SETTINGS.ankiTags,
  };
  const noteFiles = fs.readdirSync(ankiDir).filter((n) => n.endsWith(".json") && !n.startsWith("_")).sort();
  for (const f of noteFiles) {
    const c = JSON.parse(fs.readFileSync(path.join(ankiDir, f), "utf8"));
    const got = ankiMod.buildAnkiNote(c.input, c.settings === "default" ? ankiDefaults : c.settings);
    assert.equal(got.deckName, c.expect.deckName, `${f}: deckName`);
    assert.equal(got.modelName, c.expect.modelName, `${f}: modelName`);
    assert.deepEqual(got.fields, c.expect.fields, `${f}: fields`);
    assert.deepEqual(got.tags, c.expect.tags, `${f}: tags`);
    assert.deepEqual(got.options, c.expect.options, `${f}: options`);
    assert.equal(got.options.allowDuplicate, false, `${f}: allowDuplicate=false`);
    if (c.expect.audio === null) assert.equal(got.audio, undefined, `${f}: no audio`);
    else {
      assert.equal(got.audio?.[0]?.url, c.expect.audio[0].url, `${f}: audio[0].url`);
      assert.deepEqual(got.audio, c.expect.audio, `${f}: audio`);
    }
  }
  const remapData = JSON.parse(fs.readFileSync(path.join(ankiDir, "_remap.json"), "utf8"));
  const roleOrder = ["sentence", "picture", "meaning", "word", "ipa", "audio", "source"];
  for (const rc of remapData.cases) {
    const got = ankiMod.remapFieldsForModel(rc.fields, rc.map === "default" ? DEFAULT_EAR_COACH_SETTINGS.ankiFieldMap : rc.map);
    assert.deepEqual(roleOrder.map((r) => got[r]), rc.expect, `remapFieldsForModel(${JSON.stringify(rc.fields)})`);
  }
  const clientData = JSON.parse(fs.readFileSync(path.join(ankiDir, "_client.json"), "utf8"));
  for (const cc of clientData.cases) {
    const sent: any[] = [];
    const client = new ankiMod.AnkiConnectClient(async (body: string) => {
      sent.push(JSON.parse(body));
      if (cc.reply.throw) throw new Error(cc.reply.throw);
      return cc.reply;
    });
    const label = `client ${cc.action} ${JSON.stringify(cc.reply)}`;
    if ("result" in cc.expect) {
      assert.deepEqual(await client.invoke(cc.action, {}), cc.expect.result, label);
    } else {
      let err: any = null;
      try {
        await client.invoke(cc.action, {});
      } catch (e) {
        err = e;
      }
      assert.ok(err, `${label}: should throw`);
      assert.equal(err.kind, cc.expect.error, `${label}: error kind`);
      if (cc.expect.message) assert.equal(err.message, cc.expect.message, `${label}: message`);
    }
    assert.deepEqual(sent, [{ action: cc.action, version: 6, params: {} }], `${label}: request body`);
  }
  for (const sc of clientData.save) {
    const calls: string[] = [];
    const fake = { invoke: async (a: string) => (calls.push(a), a === "canAddNotes" ? sc.canAdd : 1) };
    assert.equal(await ankiMod.addNoteIfNew(fake, { deckName: "D" }), sc.expect, `addNoteIfNew canAdd=${JSON.stringify(sc.canAdd)}`);
    assert.deepEqual(calls, sc.calls, `addNoteIfNew calls canAdd=${JSON.stringify(sc.canAdd)}`);
  }
  assert.equal(ankiMod.ankiStatusMessage(new ankiMod.AnkiConnectError("connection", "x")), "AnkiConnect Android에 연결하지 못했습니다 — 앱에서 서비스를 켜 주세요", "connection message");
  log(`  -> PASS: ${clozeData.cases.length} cloze cases, ${noteFiles.length} note fixtures, ${remapData.cases.length} remap cases, ${clientData.cases.length} client cases, ${clientData.save.length} save cases`);
  log("");

  log("==============================================================");
  log("ALL TESTS PASSED SUCCESSFULLY!");
  log("==============================================================");

  fs.mkdirSync(path.resolve("docs"), { recursive: true });
  fs.writeFileSync(path.resolve("docs/test_result.txt"), logs.join("\n"), "utf8");
}

runAllTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
