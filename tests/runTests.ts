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
import * as storyboardSrc from "../src/services/storyboard.ts";
import * as captionPayloadSrc from "../src/services/captionPayload.ts";
import * as transcriptProcSrc from "../src/workers/transcriptProcessor.ts";
import * as yesterdayQuizSrc from "../src/utils/yesterdayQuiz.ts";
import * as segmentBalanceSrc from "../src/workers/segmentBalance.ts";
import * as aiSrc from "../src/services/aiAnalysis.ts";
import * as loopSrc from "../src/utils/loopControl.ts";
import * as trapLabelsSrc from "../src/utils/trapLabels.ts";
import * as reviewSrc from "../src/utils/reviewQueue.ts";
import * as dictationSrc from "../src/utils/dictationMatch.ts";
import * as soundHintSrc from "../src/services/soundHint.ts";
import * as pronFallbackSrc from "../src/services/pronFallback.ts";
import * as videoDataSrc from "../src/services/videoData.ts";
import * as videoTrashSrc from "../src/services/videoTrash.ts";
import * as diagnosticsSrc from "../src/services/diagnostics.ts";
import * as audioClipSrc from "../src/services/audioClip.ts";
import * as learningSrc from "../src/services/learningStore.ts";
import * as httpSrc from "../src/services/http.ts";
import * as noticesSrc from "../src/services/notices.ts";
import * as karaokeSrc from "../src/utils/karaoke.ts";
import * as todaySrc from "../src/utils/todaySentences.ts";
import * as shadowSrc from "../src/utils/shadowing.ts";
import * as resumeSrc from "../src/utils/resume.ts";
import * as dictCacheSrc from "../src/services/dictCache.ts";
import { cardMetrics } from "./segmentMetrics.ts";
import { DictionaryApiDevProvider, normalizeLookupWord, parseCommonsAudioUrl, parseDictionaryApiDev, phraseCandidates, phraseCandidatesAround, lemmaVariants, pickPronunciation, pickUsIpa } from "../src/services/dictionary.ts";

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
  // SPEC_048: a 3-word sentence right before the next one ("It was great.") folds into it; abbreviations still never split.
  assert.equal(sentenceSegs.length, 3, `Expected 3 cards, got ${sentenceSegs.length}`);
  assert.equal(sentenceSegs[0].text, "It was great. Next week Dr. Kim and I will visit the U.S. office together.");
  assert.equal(sentenceSegs[1].text, "Yes, we will!");
  assert.ok(sentenceSegs[2].words.length >= 23, "Long punctuated sentence without commas must stay intact (<= 28 words)");
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
    : { normalizeLookupWord, parseDictionaryApiDev, DictionaryApiDevProvider, pickPronunciation, parseCommonsAudioUrl, lemmaVariants, phraseCandidates, phraseCandidatesAround, pickUsIpa };
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
      // SPEC_025: 품사는 자르지 않되 같은 품사는 한 번만
      assert.equal(new Set(got.meanings.map((m: any) => m.partOfSpeech)).size, got.meanings.length, `${f}: unique parts of speech`);
      for (const m of got.meanings) assert.ok(m.definitions.length >= 1 && m.definitions.length <= 3, `${f}: ${m.partOfSpeech} 1~3 definitions`);
    }
    dictCount++;
  }
  // SPEC_035: 미국 발음 IPA 고르기(실제 응답) + 파싱 결과 ipaUs
  const usIpa = JSON.parse(fs.readFileSync(path.join(dictDir, "_ipa-us.json"), "utf8"));
  for (const c of usIpa.cases) assert.equal(dictMod.pickUsIpa(c.response), c.expect, `pickUsIpa(${c.word})`);
  assert.equal(dictMod.parseDictionaryApiDev(JSON.parse(fs.readFileSync(path.join(dictDir, "back.json"), "utf8")).response)?.ipaUs, "/bæk/", "parseDictionaryApiDev ipaUs (back)");
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
  // 실패 경로: 서버 상태·send가 던진 오류 → 모달 오류 줄 원인 (data: _errors.json)
  const dictErr = JSON.parse(fs.readFileSync(path.join(dictDir, "_errors.json"), "utf8"));
  for (const c of dictErr.cases) {
    const ep = new dictMod.DictionaryApiDevProvider(async () => {
      if (c.throw) throw new httpSrc.HttpFailure(c.throw.kind, c.throw.message, null);
      return { status: c.status, json: {} };
    });
    let got: unknown;
    let thrown: unknown = undefined;
    try { got = await ep.lookup("word"); } catch (e) { thrown = e; }
    if (c.expect === null) { assert.equal(thrown, undefined, `dict error [${c.name}] 던지면 안 됨`); assert.equal(got, null, `dict error [${c.name}]`); continue; }
    assert.ok(thrown !== undefined, `dict error [${c.name}] 던져야 함`);
    const cause = noticesSrc.failureCause(thrown);
    assert.equal(cause, c.cause, `dict error [${c.name}]`);
    if (c.raw) assert.ok(!cause.includes(c.raw), `dict error [${c.name}] 원문 남음: ${cause}`);
  }
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
  // SPEC_019: 앞 낱말에서 시작하는 구 + 앞 낱말이 없으면 phraseCandidates와 같음(불변식)
  for (const [[t, pre, f], want] of phr.around) assert.deepEqual(dictMod.phraseCandidatesAround(t, pre, f), want, `phraseCandidatesAround(${JSON.stringify(t)}, ${JSON.stringify(pre)}, ${JSON.stringify(f)})`);
  for (const [[t, f]] of phr.phrases) assert.deepEqual(dictMod.phraseCandidatesAround(t, [], f), dictMod.phraseCandidates(t, f), `phraseCandidatesAround(${JSON.stringify(t)}, [], …) == phraseCandidates`);
  log(`  -> PASS: ${norm.cases.length} normalize cases, ${dictCount} response fixtures, provider cache/404, ${commonsCases.length} commons cases, audio → Commons, ${phr.lemma.length} lemma + ${phr.phrases.length} phrase + ${phr.around.length} around cases`);
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
  // SPEC_025: 카드 앞면 뜻은 고른 것 하나(없으면 첫 뜻)
  const pickData = JSON.parse(fs.readFileSync(path.join(ankiDir, "_pick.json"), "utf8"));
  for (const pc of pickData.cases) {
    const got = ankiMod.pickCardMeaning(pc.entry ?? pickData.entry, pc.chosen);
    assert.deepEqual(got, pc.expect, `pickCardMeaning(${JSON.stringify(pc.chosen)})`);
    assert.ok(got.length <= 1, "pickCardMeaning: at most one meaning");
  }
  // SPEC_026: 핀 문장 듣기 카드
  const sentData = JSON.parse(fs.readFileSync(path.join(ankiDir, "_sentence.json"), "utf8"));
  for (const sc of sentData.notes) {
    const got = ankiMod.buildSentenceNote(sc.input, sc.settings ?? sentData.settings);
    assert.deepEqual(got, sc.expect, `buildSentenceNote: ${sc.name}`);
  }
  for (const bc of sentData.blanks) assert.deepEqual(ankiMod.sentenceBlankIndices(bc.words, bc.attempts), bc.expect, `sentenceBlankIndices ${JSON.stringify(bc.attempts)}`);
  for (const tc of sentData.targets) {
    const calls: string[] = [];
    const client = { invoke: async (action: string) => (calls.push(action), tc.replies[action]) };
    assert.deepEqual(await ankiMod.resolveSentenceTarget(client, sentData.settings), tc.expect, `resolveSentenceTarget: ${tc.name}`);
    assert.deepEqual(calls, tc.calls, `resolveSentenceTarget calls: ${tc.name}`);
  }
  assert.equal(DEFAULT_EAR_COACH_SETTINGS.ankiSentenceNoteType, ankiMod.ANKI_SENTENCE_NOTE_TYPE, "default ankiSentenceNoteType");
  // SPEC_036: 원음 — 앞면 템플릿에 TTS 없음, 파일 이름
  assert.ok(!/tts/i.test(ankiMod.ANKI_SENTENCE_FRONT_TEMPLATE) && ankiMod.ANKI_SENTENCE_FRONT_TEMPLATE.includes("{{Picture}}"), "앞면 템플릿: TTS 없음, Picture 있음");
  for (const [vid, st, want] of sentData.audioNames) assert.equal(ankiMod.audioFilename(vid, st), want, `audioFilename(${vid}, ${st})`);
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
  // 회차 2: 발음은 우리가 받아 data로, 실패면 발음 없이 / 오류 문구는 첫 줄만
  const audioData = JSON.parse(fs.readFileSync(path.join(ankiDir, "_audio.json"), "utf8"));
  for (const ac of audioData.cases) {
    const note: any = { deckName: "D", modelName: "M", fields: {}, tags: [], options: { allowDuplicate: false, duplicateScope: "deck" } };
    if (ac.audio) note.audio = ac.audio;
    const got = await ankiMod.inlineAudio(note, async () => {
      if (ac.fetch === "throw") throw new Error("403");
      return new Uint8Array(ac.fetch).buffer;
    });
    if (ac.expect === null) assert.ok(!("audio" in got), `inlineAudio ${JSON.stringify(ac.fetch)}: no audio`);
    else assert.deepEqual(got.audio, ac.expect, `inlineAudio ${JSON.stringify(ac.fetch)}`);
  }
  const prepCalls: string[] = [];
  const prepFake = { invoke: async (a: string, p: any) => (prepCalls.push(`${a}:${p?.note?.audio?.[0]?.data ?? p?.notes?.[0]?.audio?.[0]?.url ?? "-"}`), a === "canAddNotes" ? [true] : 1) };
  await ankiMod.addNoteIfNew(prepFake, { audio: [{ url: "u", filename: "f.ogg", fields: ["Back"] }] }, (n: any) => ankiMod.inlineAudio(n, async () => new Uint8Array([1, 2, 3]).buffer));
  assert.deepEqual(prepCalls, ["canAddNotes:u", "addNote:AQID"], "addNoteIfNew prepare → addNote gets data");
  // 회차 3: 저장 전 덱·노트 타입 확인 + 실제 필드 이름으로 대응
  const targetData = JSON.parse(fs.readFileSync(path.join(ankiDir, "_target.json"), "utf8"));
  for (const tc of targetData.cases) {
    const calls: string[] = [];
    const fake = { invoke: async (a: string) => (calls.push(a), tc.replies[a]) };
    const got = await ankiMod.resolveAnkiTarget(fake, tc.settings === "default" ? ankiDefaults : tc.settings);
    if (tc.expect.message) {
      assert.equal(got.ok, false, `${tc.name}: not ok`);
      assert.equal(got.message, tc.expect.message, `${tc.name}: message`);
    } else {
      assert.equal(got.ok, true, `${tc.name}: ok`);
      assert.deepEqual(roleOrder.map((r) => got.settings.ankiFieldMap[r]), tc.expect.map, `${tc.name}: map`);
    }
    assert.deepEqual(calls, tc.calls, `${tc.name}: calls`);
  }
  // SPEC_016: 기본 덱 happynote2 + 저장된 Default 옮기기
  const migData = JSON.parse(fs.readFileSync(path.join(ankiDir, "_migrate.json"), "utf8"));
  assert.equal(DEFAULT_EAR_COACH_SETTINGS.ankiDeck, migData.defaultDeck, "default ankiDeck");
  for (const [saved, want] of migData.cases) assert.equal(ankiMod.migrateAnkiDeck(saved), want, `migrateAnkiDeck(${JSON.stringify(saved)})`);
  for (const [raw, want] of audioData.messages) {
    assert.equal(ankiMod.ankiStatusMessage(new ankiMod.AnkiConnectError("api", raw)), want, `ankiStatusMessage(${JSON.stringify(raw.slice(0, 30))})`);
  }
  assert.equal(ankiMod.ankiStatusMessage(new ankiMod.AnkiConnectError("connection", "x")), "AnkiConnect Android에 연결하지 못했어요 — 앱에서 서비스를 켜 주세요", "connection message");
  // SPEC_017: 장면 그림 storeMediaFile + 파일 이름
  const snapData = JSON.parse(fs.readFileSync(path.join(ankiDir, "_snapshot.json"), "utf8"));
  for (const sc of snapData.store) {
    const calls: any[] = [];
    const fake = {
      invoke: async (a: string, p: any) => {
        calls.push([a, p]);
        if (sc.reply && typeof sc.reply === "object" && sc.reply.throw) throw new Error(sc.reply.throw);
        return sc.reply;
      },
    };
    const getData = async () => {
      if (sc.data && typeof sc.data === "object" && sc.data.throw) throw new Error(sc.data.throw);
      return sc.data;
    };
    assert.equal(await ankiMod.storeSnapshot(fake, getData, "ear-coach-v-3.jpg"), sc.expect, `storeSnapshot: ${sc.note}`);
    assert.deepEqual(calls, sc.calls, `storeSnapshot calls: ${sc.note}`);
  }
  for (const [args, want] of snapData.filenames) assert.equal(ankiMod.snapshotFilename(...(args as [string, number])), want, `snapshotFilename(${JSON.stringify(args)})`);
  assert.equal(ankiMod.ANKI_MESSAGES.addedNoPicture, "Anki에 저장했어요 (그림 없음)", "addedNoPicture message");
  log(`  -> PASS: ${clozeData.cases.length} cloze cases, ${noteFiles.length} note fixtures, ${remapData.cases.length} remap cases, ${clientData.cases.length} client cases, ${clientData.save.length} save cases, ${audioData.cases.length} audio cases, ${audioData.messages.length} message cases, ${targetData.cases.length} target cases, ${migData.cases.length} migrate cases, ${snapData.store.length} snapshot store cases, ${pickData.cases.length} pick cases, ${sentData.notes.length}+${sentData.blanks.length}+${sentData.targets.length} sentence note/blank/target cases`);
  log("");

  // ---------------------------------------------------------------------------
  log("[Test 13] Storyboard: spec parse, frame at time, spec from responses (data-driven, SPEC_017)");
  const sbMod = process.env.EAR_COACH_STORYBOARD_MODULE ? await import(path.resolve(process.env.EAR_COACH_STORYBOARD_MODULE)) : storyboardSrc;
  const sbDir = path.resolve("tests/fixtures/storyboard");
  const sbSpecs = JSON.parse(fs.readFileSync(path.join(sbDir, "_specs.json"), "utf8"));
  const watchLevels = sbMod.parseStoryboardSpec(sbSpecs.watch.spec);
  assert.equal(watchLevels.length, 4, "watch spec levels");
  const l3 = watchLevels[3];
  assert.deepEqual([l3.level, l3.width, l3.height, l3.count, l3.cols, l3.rows, l3.intervalMs, l3.name], [3, 320, 180, 108, 3, 3, 2000, "M$M"], "watch L3");
  assert.equal(watchLevels[0].intervalMs, 0, "watch L0 interval 0");
  assert.equal(sbMod.parseStoryboardSpec(sbSpecs.android.spec).length, 3, "android spec levels");
  assert.deepEqual(sbMod.parseStoryboardSpec(""), [], "empty spec");
  const specOf = (k: string) => (k === "watch" ? sbSpecs.watch.spec : k === "android" ? sbSpecs.android.spec : k === "watchL0" ? sbSpecs.watch.spec.split("|").slice(0, 2).join("|") : k);
  const frames = JSON.parse(fs.readFileSync(path.join(sbDir, "_frames.json"), "utf8"));
  for (const fc of frames.cases) {
    assert.deepEqual(sbMod.storyboardFrame(specOf(fc.spec), fc.sec, fc.durationSec ?? null), fc.expect, `storyboardFrame: ${fc.note}`);
  }
  const fromHtml = sbMod.storyboardFromWatchHtml(fs.readFileSync(path.join(sbDir, "watch-snippet.html"), "utf8"));
  assert.deepEqual(fromHtml, { spec: sbSpecs.watch.spec, durationSec: sbSpecs.watch.durationSec }, "storyboardFromWatchHtml");
  const fromPr = sbMod.storyboardFromPlayerResponse(JSON.parse(fs.readFileSync(path.join(sbDir, "player-android.json"), "utf8")));
  assert.deepEqual(fromPr, { spec: sbSpecs.android.spec, durationSec: sbSpecs.android.durationSec }, "storyboardFromPlayerResponse");
  assert.equal(sbMod.storyboardFromWatchHtml("<html>no player</html>"), null, "html without storyboard");
  assert.equal(sbMod.storyboardFromPlayerResponse({ videoDetails: {} }), null, "player response without storyboard");
  log(`  -> PASS: ${watchLevels.length} watch levels, ${frames.cases.length} frame cases, html + player response extraction`);
  log("");

  // ---------------------------------------------------------------------------
  log("[Test 14] Caption quality: ASR word timings & pause-based chunks (data-driven, SPEC_018)");
  const cpMod = process.env.EAR_COACH_TRANSCRIPT_SERVICE_MODULE ? await import(path.resolve(process.env.EAR_COACH_TRANSCRIPT_SERVICE_MODULE)) : captionPayloadSrc;
  const tpMod = process.env.EAR_COACH_TRANSCRIPT_MODULE ? await import(path.resolve(process.env.EAR_COACH_TRANSCRIPT_MODULE)) : transcriptProcSrc;
  const trDir = path.resolve("tests/fixtures/transcript");
  const trCases = JSON.parse(fs.readFileSync(path.join(trDir, "cases.json"), "utf8"));
  for (const pc of trCases.parser) {
    const got = cpMod.parseCaptionPayload(pc.payload).map((c: RawTranscriptCue) => ({
      text: c.text,
      words: c.words ? c.words.map((w) => [w.start, w.text]) : null,
    }));
    assert.deepEqual(got, pc.expect, `parseCaptionPayload: ${pc.name}`);
  }
  for (const tc of trCases.tidy) {
    assert.equal(tpMod.tidyAsrWords(tc.words), tc.expect, `tidyAsrWords: ${tc.name}`);
  }
  const trOpts = { speedSpikeWpmThreshold: 180, defaultUnlockStep: 0 as const };
  const fixtureSummary: string[] = [];
  for (const fc of trCases.fixtures) {
    const cues: RawTranscriptCue[] = cpMod.parseCaptionPayload(fs.readFileSync(path.join(trDir, fc.file), "utf8"));
    const segs = tpMod.mergeCuesIntoSegments(cues, trOpts);
    if (fc.mode === "timed") {
      const isBracket = (t: string) => /^\[.*\]$/.test(t) || /^\(.*\)$/.test(t);
      const fillerSet = new Set(["um", "umm", "uh", "uhh", "uhm", "er", "erm", "hmm", "mm", "mhm"]);
      let src = cues
        .filter((c) => !isBracket(c.text.trim()))
        .flatMap((c) => (c.words ?? [{ start: c.start, text: c.text.trim() }]))
        .filter((w) => w.text && !isBracket(w.text))
        .sort((a, b) => a.start - b.start)
        .flatMap((w) => w.text.split(/\s+/).filter(Boolean).map((text) => ({ start: w.start, text })));
      const isFiller = (t: string) => fillerSet.has(t.replace(/^[.,!?;:"']+|[.,!?;:"']+$/g, "").toLowerCase());
      const fillersInSource = src.filter((w) => isFiller(w.text)).length;
      if (fc.fillersBefore !== undefined) {
        assert.equal(fillersInSource, fc.fillersBefore, `${fc.file}: fillers in source`);
      }
      src = src.filter((w) => !isFiller(w.text));
      const wc = segs.map((s: { words: string[] }) => s.words.length);
      assert.ok(Math.max(...wc) <= fc.maxWords, `${fc.file}: max words ${Math.max(...wc)} > ${fc.maxWords}`);
      const ratio = wc.filter((n: number) => n >= fc.minWords).length / wc.length;
      assert.ok(ratio >= fc.minWordsRatio, `${fc.file}: >=${fc.minWords}-word ratio ${ratio.toFixed(2)}`);
      assert.ok(segs.length >= fc.beforeSegments * fc.minSegmentsFactor, `${fc.file}: ${segs.length} segments < ${fc.beforeSegments}x${fc.minSegmentsFactor}`);
      const joined = segs.flatMap((s: { words: string[] }) => s.words);
      assert.deepEqual(
        joined.map((t: string) => t.toLowerCase()),
        src.map((w) => w.text.toLowerCase()),
        `${fc.file}: words preserved in order (fillers removed, case-insensitive)`
      );
      const leftFillers = joined.filter((t: string) => isFiller(t)).length;
      assert.equal(leftFillers, 0, `${fc.file}: ${leftFillers} filler words left in cards`);
      const lowerI = joined.filter((t: string) => /^i(?:'(?:m|ve|ll|d))?$/.test(t)).length;
      assert.equal(lowerI, 0, `${fc.file}: ${lowerI} lowercase i words left`);
      const lowerStart = segs.filter((s: { text: string }) => /^[a-z]/.test(s.text)).length;
      assert.equal(lowerStart, 0, `${fc.file}: ${lowerStart} cards start lowercase`);
      let k = 0;
      for (const s of segs) {
        assert.ok(Math.abs(s.start - src[k].start) <= 0.01, `${fc.file}: seg ${s.index} start ${s.start} != first word ${src[k].start}`);
        for (let j = k + 1; j < k + s.words.length; j++) {
          assert.ok(src[j].start - src[j - 1].start < fc.hardPauseSec + 0.6, `${fc.file}: seg ${s.index} has ${(src[j].start - src[j - 1].start).toFixed(2)}s pause inside`);
        }
        k += s.words.length;
      }
      fixtureSummary.push(`${fc.file} ${fc.beforeSegments}->${segs.length} cards, max ${Math.max(...wc)}w, fillers ${fillersInSource}->0`);
    } else if (fc.mode === "punct") {
      assert.equal(segs.length, fc.segments, `${fc.file}: segment count unchanged`);
      // SPEC_048: long sentences are cut at clause marks, so a card may end with , ; : -- as well as . ? !
      const ends = segs.filter((s: { text: string }) => /(?:[.?!,;:]|--|—)["')\]”’]*$/.test(s.text)).length / segs.length;
      assert.ok(ends >= fc.punctEndRatio, `${fc.file}: punctuation end ratio ${ends.toFixed(2)}`);
      fixtureSummary.push(`${fc.file} ${segs.length} sentences`);
    } else {
      assert.deepEqual(segs.map((s: { text: string }) => s.text), fc.texts, `${fc.file}: punctuated ASR unchanged`);
      fixtureSummary.push(`${fc.file} unchanged (${segs.length})`);
    }
  }
  log(`  -> PASS: ${trCases.parser.length} parser cases; ${trCases.tidy.length} tidy cases; ${fixtureSummary.join("; ")}`);
  log("");

  log("[Test 15] Mobile AI translation: requests, responses, batching (data-driven, SPEC_021)");
  const aiMod = process.env.EAR_COACH_AI_MODULE ? await import(path.resolve(process.env.EAR_COACH_AI_MODULE)) : aiSrc;
  const aiCases = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/ai/cases.json"), "utf8"));
  const dig = (obj: unknown, key: string): unknown =>
    key.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
  const mkSeg = (index: number, text: string, analyzed = false) => {
    const words = text.split(/\s+/).filter(Boolean);
    const seg = { id: `s${index}`, index, start: index, end: index + 1, duration: 1, text, words, wpm: 150, isSpeedSpike: false, isPinned: false, unlockStep: 0 as const } as any;
    seg.analysis = transcriptProcSrc.computeFallbackAnalysis(seg);
    if (analyzed) seg.analysis = { ...seg.analysis, translationKr: `이미 분석 ${index}` };
    return seg;
  };
  for (const rc of aiCases.requests) {
    const req = aiMod.buildAiRequest(rc.config, "PROMPT", rc.plain === true);
    assert.equal(req.url, rc.expect.url, `buildAiRequest ${rc.name}: url`);
    assert.equal(req.method, "POST", `buildAiRequest ${rc.name}: method`);
    assert.ok(!req.url.includes(rc.expect.urlMustNotContain), `buildAiRequest ${rc.name}: key must not be in URL`);
    for (const [k, v] of Object.entries(rc.expect.headers)) assert.equal(req.headers[k], v, `buildAiRequest ${rc.name}: header ${k}`);
    const body = JSON.parse(req.body);
    for (const [k, v] of Object.entries(rc.expect.body)) assert.deepEqual(dig(body, k), v, `buildAiRequest ${rc.name}: body ${k}`);
    for (const k of rc.expect.bodyMustNotHave ?? []) assert.equal(dig(body, k), undefined, `buildAiRequest ${rc.name}: body must not have ${k}`);
    for (const [k, v] of Object.entries(rc.expect.bodyArrayExcludes ?? {})) {
      const arr = dig(body, k);
      assert.ok(Array.isArray(arr) && !arr.includes(v), `buildAiRequest ${rc.name}: ${k} must not include ${v}`);
    }
  }
  const promptText = aiMod.buildAnalysisPrompt("t", [{ index: 0, text: "a b", wpm: 100 }]);
  for (const needle of aiCases.promptMustContain) assert.ok(promptText.includes(needle), `prompt must contain: ${needle}`);
  // SPEC_022: 대소문자·구두점 복원 — 받아들임/거절, 대상 판정
  for (const rc of aiCases.restore) {
    assert.equal(aiMod.acceptRestoredText(rc.words.split(" "), rc.restored), rc.expect, `acceptRestoredText ${rc.name}`);
  }
  for (const nc of aiCases.needsRestore) {
    const words = nc.text.split(/\s+/).filter(Boolean);
    assert.equal(aiMod.needsTextRestore({ text: nc.text, words }), nc.expect, `needsTextRestore ${JSON.stringify(nc.text)}`);
  }
  const pickItem = (it: Record<string, unknown>) => ({
    segmentIndex: it.segmentIndex, traps: it.traps, skeletonWordIndices: it.skeletonWordIndices,
    dictationBlankIndices: it.dictationBlankIndices, translationKr: it.translationKr,
    ...(it.restoredText !== undefined ? { restoredText: it.restoredText } : {}),
    ...(it.chunkWordIndices !== undefined ? { chunkWordIndices: it.chunkWordIndices } : {}),
  });
  for (const pc of aiCases.responses) {
    const segs = pc.segments.map((x: { index: number; text: string }) => mkSeg(x.index, x.text));
    const got = aiMod.parseAiResponse(pc.provider, pc.status, pc.json, segs);
    if (pc.expect.error) {
      assert.ok("error" in got, `parseAiResponse ${pc.name}: expected error ${pc.expect.error}`);
      assert.equal(got.error.kind, pc.expect.error, `parseAiResponse ${pc.name}: error kind`);
    } else {
      assert.ok("items" in got, `parseAiResponse ${pc.name}: ${JSON.stringify((got as any).error)}`);
      assert.deepEqual(got.items.map(pickItem), pc.expect.items, `parseAiResponse ${pc.name}: items`);
    }
  }
  // 묶음 시험은 gemini 기본, run.provider "openai"면 chat/completions 모양(SPEC_051)
  const promptOf = (body: any): string => (body.contents ? body.contents[0].parts[0].text : body.messages[1].content);
  const wrapText = (provider: string, text: string) =>
    provider === "openai" ? { choices: [{ message: { content: text } }] } : { candidates: [{ content: { parts: [{ text }] } }] };
  const okReply = (req: { body: string }, restored: Record<string, string> = {}, provider = "gemini") => {
    const prompt = promptOf(JSON.parse(req.body));
    const sent = JSON.parse(prompt.split("Segments JSON:\n")[1]) as Array<{ index: number; text: string }>;
    const items = sent.map((x) => ({ segmentIndex: x.index, traps: ["LINKING"], phoneticKr: "p", trapExplanation: "e", skeletonWordIndices: [0], dictationBlankIndices: [1], rhythmGuide: x.text, translationKr: `번역 ${x.index}`, restoredText: restored[String(x.index)] ?? "" }));
    return { status: 200, json: wrapText(provider, JSON.stringify({ summaryKr: "", keyListeningPoints: [], items })) };
  };
  for (const run of aiCases.runs) {
    const segs = Array.from({ length: run.segments }, (_, i) => mkSeg(i, run.texts?.[String(i)] ?? `word one two three ${i}`, run.analyzedAt.includes(i)));
    const batchSizes: number[] = [];
    const sleeps: number[] = [];
    let sentAnalyzed = 0;
    let call = 0;
    const provider = run.provider ?? "gemini";
    const jsonModes: string[] = [];
    const result = await aiMod.runAiAnalysis(segs, { provider, apiKey: "TEST", model: "m", baseUrl: "https://x.test/v1" }, {
      title: "t",
      sleep: async (ms: number) => { sleeps.push(ms); },
      fetch: async (req: { body: string }) => {
        const body = JSON.parse(req.body);
        const prompt = promptOf(body);
        const sent = JSON.parse(prompt.split("Segments JSON:\n")[1]) as Array<{ index: number }>;
        batchSizes.push(sent.length);
        if (provider === "openai") jsonModes.push(body.response_format ? "json" : "plain");
        sentAnalyzed += sent.filter((x) => run.analyzedAt.includes(x.index)).length;
        const reply = run.replies[call++];
        if (reply === "ok") return okReply(req, run.restoredTexts, provider);
        if (reply === "bad") return { status: 200, json: wrapText(provider, "not json") };
        if (reply === "groq400") return { status: 400, json: { error: { message: "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.", code: "json_validate_failed", failed_generation: "{\"items\": [" } } };
        return { status: reply, json: { error: { message: `HTTP ${reply}` } } };
      },
    });
    assert.deepEqual(batchSizes, run.expect.batchSizes, `runAiAnalysis ${run.name}: batch sizes`);
    assert.deepEqual(sleeps, run.expect.sleeps, `runAiAnalysis ${run.name}: sleeps`);
    if (run.expect.jsonModes) assert.deepEqual(jsonModes, run.expect.jsonModes, `runAiAnalysis ${run.name}: JSON mode per request`);
    assert.equal(result.analyzed, run.expect.analyzed, `runAiAnalysis ${run.name}: analyzed`);
    assert.equal(result.total, run.expect.total, `runAiAnalysis ${run.name}: total`);
    assert.equal(result.stoppedBy?.kind ?? null, run.expect.stoppedBy, `runAiAnalysis ${run.name}: stoppedBy`);
    assert.equal(sentAnalyzed, run.expect.sentAnalyzed, `runAiAnalysis ${run.name}: already-analyzed segments sent`);
    const filled = segs.filter((sg: any) => /^번역 \d+$/.test(sg.analysis.translationKr)).length;
    assert.equal(filled, run.expect.analyzed, `runAiAnalysis ${run.name}: analysis written into segments`);
    for (const i of run.analyzedAt) assert.equal(segs[i].analysis.translationKr, `이미 분석 ${i}`, `runAiAnalysis ${run.name}: analyzed seg ${i} untouched`);
    for (const [i, text] of Object.entries(run.expect.textsAfter ?? {})) {
      const sg = segs[Number(i)];
      assert.equal(sg.text, text, `runAiAnalysis ${run.name}: seg ${i} text`);
      assert.deepEqual(sg.words, (text as string).split(/\s+/), `runAiAnalysis ${run.name}: seg ${i} words follow text`);
      assert.equal(sg.words.length, (run.texts[i] as string).split(/\s+/).length, `runAiAnalysis ${run.name}: seg ${i} word count kept`);
    }
  }
  // SPEC_057: 요청 throw의 detail 보존·진단 한 줄, 알림 글은 detail과 무관
  for (const sd of aiCases.stopDetail) {
    let stoppedBy = sd.stoppedBy;
    if (sd.throw) {
      const r = await aiMod.runAiAnalysis([{ index: 0, start: 0, end: 1, text: "a b", words: ["a", "b"] } as any], { provider: "gemini", apiKey: "TEST", model: "m" }, {
        title: "t", sleep: async () => {},
        fetch: async () => { throw Object.assign(new Error(sd.throw.message), { name: "HttpFailure", detail: sd.throw.detail }); },
      });
      stoppedBy = r.stoppedBy;
      assert.deepEqual(stoppedBy, sd.expect, `stopDetail ${sd.name}: stoppedBy`);
      const { detail: _d, ...plain } = stoppedBy;
      assert.equal(aiMod.aiResultMessage(r), aiMod.aiResultMessage({ ...r, stoppedBy: plain }), `stopDetail ${sd.name}: 알림 글은 detail과 무관`);
    }
    assert.equal(aiMod.aiStopDiagnostic(stoppedBy), sd.diagnostic, `stopDetail ${sd.name}: 진단 한 줄`);
  }
  log(`  -> PASS: ${aiCases.requests.length} request + ${aiCases.responses.length} response + ${aiCases.runs.length} batching + ${aiCases.restore.length} restore + ${aiCases.needsRestore.length} needsRestore + ${aiCases.stopDetail.length} stopDetail cases`);
  log("");

  log("[Test 16] Loop button modes, tick decisions, auto-follow (data-driven, SPEC_023)");
  const loopMod = process.env.EAR_COACH_LOOP_MODULE ? await import(path.resolve(process.env.EAR_COACH_LOOP_MODULE)) : loopSrc;
  const loopCases = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/loop/cases.json"), "utf8"));
  for (const c of loopCases.cycle) assert.equal(loopMod.nextLoopMode(c.from), c.to, `nextLoopMode ${c.from}`);
  for (const c of loopCases.text) {
    assert.equal(loopMod.loopButtonText(c.mode, c.count, c.mobile, c.seg ?? null), c.expect, `loopButtonText ${c.mode} ${c.count} mobile=${c.mobile}`);
  }
  for (const c of loopCases.tick) assert.deepEqual(loopMod.decideLoopTick(c.in), c.expect, `decideLoopTick ${c.name}`);
  for (const c of loopCases.follow) assert.equal(loopMod.shouldAutoFollow(c.in), c.expect, `shouldAutoFollow ${c.name}`);
  for (const c of loopCases.followTarget) assert.equal(loopMod.followTargetIndex(c.active, c.loop), c.expect, `followTargetIndex ${c.name}`);
  assert.equal(DEFAULT_EAR_COACH_SETTINGS.loopRepeatCount, 3, "default loopRepeatCount");
  assert.equal(DEFAULT_EAR_COACH_SETTINGS.loopGapSeconds, 0, "default loopGapSeconds");
  assert.equal(DEFAULT_EAR_COACH_SETTINGS.autoFollowPlayback, true, "default autoFollowPlayback");
  log(`  -> PASS: ${loopCases.cycle.length} cycle + ${loopCases.text.length} text + ${loopCases.tick.length} tick + ${loopCases.follow.length} follow + ${loopCases.followTarget.length} followTarget cases; defaults 3 / 0s / follow on`);
  log("");

  log("[Test 17] Trap labels — 한국어 이름·SPEED_SPIKE 빼기 (data-driven, SPEC_026·028)");
  const trapMod = process.env.EAR_COACH_TRAP_MODULE ? await import(path.resolve(process.env.EAR_COACH_TRAP_MODULE)) : trapLabelsSrc;
  const trapCases = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/trap-labels/cases.json"), "utf8"));
  for (const [code, want] of trapCases.label) assert.equal(trapMod.trapLabel(code), want, `trapLabel ${code}`);
  for (const [codes, want] of trapCases.list) assert.deepEqual(trapMod.trapLabelList(codes), want, `trapLabelList ${JSON.stringify(codes)}`);
  log(`  -> PASS: ${trapCases.label.length} label + ${trapCases.list.length} list cases`);
  log("");

  log("[Test 18] Pin review queue — 1·3·7·14일, 달력 날짜, 졸업 (data-driven, SPEC_027)");
  const reviewMod = process.env.EAR_COACH_REVIEW_MODULE ? await import(path.resolve(process.env.EAR_COACH_REVIEW_MODULE)) : reviewSrc;
  const rc = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/review/cases.json"), "utf8"));
  const recs = (oks: boolean[]) => oks.map((ok, i) => ({ at: `2026-11-${String(i + 1).padStart(2, "0")}T09:00:00+09:00`, ok }));
  for (const c of rc.due) assert.equal(reviewMod.isReviewDue(c.s, Date.parse(c.now), rc.tz), c.expect, `isReviewDue: ${c.name}`);
  for (const c of rc.days) assert.equal(reviewMod.reviewIntervalDays({ isPinned: true, reviews: recs(c.reviews) }), c.expect, `reviewIntervalDays ${JSON.stringify(c.reviews)}`);
  for (const c of rc.graduate) assert.equal(reviewMod.shouldGraduate({ ...c.s, reviews: recs(c.s.reviews) }), c.expect, `shouldGraduate ${JSON.stringify(c.s)}`);
  assert.deepEqual(reviewMod.dueIndices(rc.queue.segments, Date.parse(rc.queue.now), rc.tz), rc.queue.expect, "dueIndices");
  assert.deepEqual(reviewMod.withReview(undefined, true, "t"), [{ at: "t", ok: true }], "withReview");
  log(`  -> PASS: ${rc.due.length} due + ${rc.days.length} interval + ${rc.graduate.length} graduate cases + queue`);
  log("");

  log("[Test 19] Dictation match — 아포스트로피 무시·같은 말 줄임 (data-driven, SPEC_030)");
  const dictationMod = process.env.EAR_COACH_DICTATION_MODULE ? await import(path.resolve(process.env.EAR_COACH_DICTATION_MODULE)) : dictationSrc;
  const dc = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/dictation/cases.json"), "utf8"));
  for (const [user, expected, want, note] of dc.match) assert.equal(dictationMod.dictationMatches(user, expected), want, `dictationMatches(${JSON.stringify(user)}, ${JSON.stringify(expected)}) ${note}`);
  log(`  -> PASS: ${dc.match.length} cases`);
  log("");

  log("[Test 20] Sound hint — CMUdict + 이어 말하기 규칙 → 한글·IPA (data-driven, SPEC_031)");
  const shMod = process.env.EAR_COACH_SOUNDHINT_MODULE ? await import(path.resolve(process.env.EAR_COACH_SOUNDHINT_MODULE)) : soundHintSrc;
  const cmuText = fs.readFileSync(path.resolve("src/data/cmudict-lite.txt"), "utf8");
  const cmu = shMod.parseCmudictLite(cmuText);
  assert.ok(cmu.size > 20000 && cmu.size <= 30000, `cmudict-lite 낱말 수 ${cmu.size} (20,000 초과 ~ 30,000 이하)`);
  const shRules = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/sound-hint/rules.json"), "utf8"));
  for (const [phrase, want, note] of shRules.hangul) {
    const got = shMod.soundHintForWords(phrase.split(" "), cmu)?.hangul;
    assert.equal(got, want, `soundHint(${JSON.stringify(phrase)}) ${note}`);
  }
  for (const [phrase, want] of shRules.ipa) assert.equal(shMod.soundHintForWords(phrase.split(" "), cmu)?.ipa, want, `ipa(${phrase})`);
  for (const [phrase, note] of shRules.missing) assert.equal(shMod.soundHintForWords(phrase.split(" "), cmu), null, note);
  for (const [seg, want, note] of shRules.chunk) assert.deepEqual(shMod.pickHintChunk(seg), want, `pickHintChunk ${note}`);
  for (const [seg, want, note] of shRules.blanks) assert.deepEqual(shMod.dictationBlanksFor(seg), want, `dictationBlanksFor ${note}`);
  for (const sentence of shRules.coverage) {
    const words = sentence.split(" ");
    const idx = shMod.pickHintChunk({ words });
    assert.ok(shMod.soundHintForWords(idx.map((i: number) => words[i]), cmu), `사전에 모든 낱말: ${sentence}`);
  }
  log(`  -> PASS: ${cmu.size} words, ${shRules.hangul.length} hangul + ${shRules.ipa.length} ipa + ${shRules.chunk.length} chunk + ${shRules.blanks.length} blanks + ${shRules.coverage.length} coverage`);
  const blog = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/sound-hint/blog.json"), "utf8"));
  let ours = 0;
  let base = 0;
  for (const [word, expected, baseline] of blog.words) {
    const got = shMod.soundHintForWords([word], cmu)?.hangul ?? "";
    const sim = Math.max(...expected.map((e: string) => soundHintSrc.hangulSimilarity(got, e)));
    const bsim = Math.max(...expected.map((e: string) => soundHintSrc.hangulSimilarity(baseline, e)));
    ours += sim;
    base += bsim;
    log(`     ${word.padEnd(13)} ${got.padEnd(8)} ~ ${expected.join("/").padEnd(14)} ${sim.toFixed(2)} (철자식 ${baseline} ${bsim.toFixed(2)})`);
  }
  const meanOurs = ours / blog.words.length;
  const meanBase = base / blog.words.length;
  log(`  -> 블로그 근접도 평균 ${meanOurs.toFixed(3)} (철자식 ${meanBase.toFixed(3)}, 기준 ${blog.minMean})`);
  assert.ok(meanOurs >= blog.minMean, `블로그 근접도 평균 ${meanOurs.toFixed(3)} < ${blog.minMean}`);
  assert.ok(meanOurs > meanBase, `블로그 근접도 ${meanOurs.toFixed(3)}가 철자식 ${meanBase.toFixed(3)}보다 높아야 함`);
  // SPEC_035: IPA → ARPAbet + 없는 낱말 채우기(PronFallback, 가짜 fetch)
  const ipaData = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/sound-hint/ipa.json"), "utf8"));
  for (const [ipa, arpa, hangul] of ipaData.convert) {
    const got = shMod.ipaToArpabet(ipa);
    assert.equal(got?.join(" "), arpa, `ipaToArpabet(${ipa})`);
    assert.equal(shMod.soundHintForWords(["x"], new Map([["x", got]]))?.hangul, hangul, `IPA 한글(${ipa})`);
  }
  for (const [word, ipa] of ipaData.sameAsCmu) assert.equal(shMod.ipaToArpabet(ipa)?.join(" "), cmu.get(word)?.join(" "), `ipaToArpabet(${ipa}) == CMUdict ${word}`);
  for (const [ipa, note] of ipaData.invalid) assert.equal(shMod.ipaToArpabet(ipa), null, `ipaToArpabet null: ${note}`);
  const pfMod = process.env.EAR_COACH_PRONFALLBACK_MODULE ? await import(path.resolve(process.env.EAR_COACH_PRONFALLBACK_MODULE)) : pronFallbackSrc;
  const pfCalls: string[] = [];
  const pf = new pfMod.PronFallback(cmu, async (w: string) => {
    pfCalls.push(w);
    return ipaData.fallback.ipa[w] ?? null;
  });
  for (const c of ipaData.fallback.cases) {
    pfCalls.length = 0;
    assert.equal(shMod.soundHintForWords(c.words, pf)?.hangul ?? null, c.before, `PronFallback before: ${c.note}`);
    assert.equal(await pf.ensure(c.words), c.added, `PronFallback added: ${c.note}`);
    assert.deepEqual(pfCalls, c.calls, `PronFallback calls: ${c.note}`);
    assert.equal(shMod.soundHintForWords(c.words, pf)?.hangul ?? null, c.after, `PronFallback after: ${c.note}`);
  }
  log(`  -> PASS: ipa ${ipaData.convert.length} convert + ${ipaData.invalid.length} invalid + ${ipaData.fallback.cases.length} fallback`);
  log("");

  log("[Test 21] Video data list & delete — 노트·sidecar·플러그인 사본 합집합, 휴지통으로 (data-driven, SPEC_033)");
  const vdMod = process.env.EAR_COACH_VIDEODATA_MODULE ? await import(path.resolve(process.env.EAR_COACH_VIDEODATA_MODULE)) : videoDataSrc;
  const vd = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/video-data/cases.json"), "utf8"));
  const makeStore = (files: Record<string, any>, trashed: string[]) => ({
    listFiles: async (dir: string) => Object.keys(files).filter((p) => p.startsWith(dir + "/")),
    stat: async (p: string) => (files[p] ? { size: files[p].size, mtime: files[p].mtime } : null),
    read: async (p: string) => {
      if (!files[p]) throw new Error(`no file ${p}`);
      return files[p].content ?? "";
    },
    trash: async (p: string) => {
      trashed.push(p);
      delete files[p];
    },
    notes: async () => vd.notes.filter((n: any) => files[n.path]),
  });
  const vdFiles = structuredClone(vd.files);
  const vdTrashed: string[] = [];
  const vdStore = makeStore(vdFiles, vdTrashed);
  const vdList = await vdMod.listVideoData(vdStore, vd.dirs);
  assert.deepEqual(vdList, vd.expectList, "listVideoData: 합집합·제목 대체·정렬·크기");
  const target = vdList.find((i: any) => i.videoId === vd.delete.videoId);
  for (const p of vd.delete.goneBefore) delete vdFiles[p];
  const done = await vdMod.deleteVideoData(vdStore, target);
  assert.deepEqual(done, vd.delete.expectTrashed, "deleteVideoData: 있는 파일만 옮김");
  assert.deepEqual(vdTrashed, vd.delete.expectTrashed, "trash 호출은 그 영상 파일만");
  const after = await vdMod.listVideoData(vdStore, vd.dirs);
  assert.deepEqual(after.map((i: any) => i.videoId), vd.delete.expectRemainingIds, "지운 뒤 목록");
  for (const [p, id, title] of vd.names) {
    assert.equal(vdMod.videoIdFromNoteName(p), id, `videoIdFromNoteName(${p})`);
    assert.equal(vdMod.titleFromNoteName(p), title, `titleFromNoteName(${p})`);
  }
  for (const [n, want] of vd.bytes) assert.equal(vdMod.formatBytes(n), want, `formatBytes(${n})`);
  log(`  -> PASS: ${vdList.length} videos listed, ${done.length} trashed, ${vd.names.length} names + ${vd.bytes.length} sizes`);
  log("");

  log("[Test 22] Video trash — 지우기로 옮긴 파일만 기록·영구 삭제, .trash 밖 거부 (data-driven, SPEC_034)");
  const vtMod = process.env.EAR_COACH_VIDEOTRASH_MODULE ? await import(path.resolve(process.env.EAR_COACH_VIDEOTRASH_MODULE)) : videoTrashSrc;
  const vt = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/video-trash/cases.json"), "utf8"));
  for (const [before, after, want] of vt.diff) assert.deepEqual(vtMod.newTrashEntries(before, after), want, `newTrashEntries ${JSON.stringify(after)}`);
  for (const [rec, added, want] of vt.add) assert.deepEqual(vtMod.addTrashRecords(rec, added), want, "addTrashRecords: 중복·.trash 밖·.. 빼기");
  for (const [p, want] of vt.safe) assert.equal(vtMod.isSafeTrashPath(p), want, `isSafeTrashPath(${p})`);
  const vtFiles: Record<string, number> = { ...vt.files };
  const vtRemoved: string[] = [];
  const vtStore = {
    listFiles: async (dir: string) => Object.keys(vtFiles).filter((p) => p.startsWith(dir + "/")),
    stat: async (p: string) => (p in vtFiles ? { size: vtFiles[p] } : null),
    remove: async (p: string) => {
      if (vt.failRemove.includes(p)) throw new Error("locked");
      vtRemoved.push(p);
      delete vtFiles[p];
    },
  };
  const vtSt = await vtMod.trashStatus(vtStore, vt.recorded);
  assert.deepEqual({ count: vtSt.paths.length, size: vtSt.size }, vt.expectStatus, "trashStatus: 기록 중 있는 .trash 파일만");
  const vtRes = await vtMod.emptyVideoTrash(vtStore, vt.recorded);
  assert.deepEqual(vtRes.removed, vt.expectRemoved, "emptyVideoTrash removed");
  assert.deepEqual(vtRemoved, vt.expectRemoved, "remove 호출은 기록·존재·.trash 밑만");
  assert.deepEqual(vtRes.remaining, vt.expectRemaining, "실패한 경로는 기록에 남음");
  assert.deepEqual(Object.keys(vtFiles).sort(), vt.expectLeft, "남의 휴지통 노트·.trash 밖 파일은 그대로");
  log(`  -> PASS: ${vt.diff.length} diff + ${vt.safe.length} safe cases, removed ${vtRes.removed.length}, kept ${vt.expectLeft.length}`);
  log("");

  log("[Test 23] Audio clip — 유튜브 itag 140 sidx 조각 고르기·창·WAV·받기 순서 (data-driven, SPEC_036)");
  const acMod = process.env.EAR_COACH_AUDIOCLIP_MODULE ? await import(path.resolve(process.env.EAR_COACH_AUDIOCLIP_MODULE)) : audioClipSrc;
  const acDir = path.resolve("tests/fixtures/audio-clip");
  const ac = JSON.parse(fs.readFileSync(path.join(acDir, "cases.json"), "utf8"));
  const acHead = new Uint8Array(fs.readFileSync(path.join(acDir, ac.sidx.file)));
  const acSidx = acMod.parseSidx(acHead, ac.sidx.offset);
  assert.ok(acSidx, "parseSidx: 실제 sidx");
  assert.equal(acSidx.timescale, ac.sidx.timescale, "sidx timescale");
  assert.equal(acSidx.fragments.length, ac.sidx.count, "sidx 조각 수");
  for (const fx of ac.sidx.fragments) {
    const fr = acSidx.fragments[fx.i];
    assert.deepEqual([fr.byteStart, fr.byteEnd], [fx.byteStart, fx.byteEnd], `sidx 조각 ${fx.i} 바이트`);
    assert.ok(Math.abs(fr.end - fr.start - ac.sidx.fragmentDurationApprox) < 0.05, `sidx 조각 ${fx.i} 길이 ${fr.end - fr.start}`);
  }
  assert.equal(acMod.parseSidx(acHead, 0), null, "sidx 아닌 위치 → null");
  const acSyn = acMod.parseSidx(new Uint8Array(Buffer.from(ac.sidxSynthetic.hex, "hex")), ac.sidxSynthetic.offset);
  assert.deepEqual(acSyn?.fragments, ac.sidxSynthetic.expect, "합성 sidx v1: ept·first_offset 반영");
  for (const rc of ac.ranges) {
    const got = acMod.fragmentsForRange(acSidx, rc.a, rc.b);
    if (rc.expect === null) assert.equal(got, null, `fragmentsForRange ${rc.a}-${rc.b}`);
    else assert.deepEqual([got.first, got.last, got.byteStart, got.byteEnd], [rc.first, rc.last, rc.byteStart, rc.byteEnd], `fragmentsForRange ${rc.a}-${rc.b}`);
  }
  for (const [s0, e0, want] of ac.windows) assert.deepEqual(acMod.clipWindow(s0, e0), want, `clipWindow(${s0}, ${e0})`);
  for (const pc of ac.pick) {
    const fmts = ac.formats
      .filter((f: any) => !(pc.drop ?? []).includes(f.itag))
      .map((f: any) => ((pc.cipher ?? []).includes(f.itag) ? { ...f, url: undefined, signatureCipher: "s=x" } : f));
    const got = acMod.pickAudioFormat(fmts);
    assert.equal(got?.itag ?? null, pc.expectItag, `pickAudioFormat: ${pc.name}`);
  }
  const w = acMod.encodeWav(new Float32Array(ac.wav.samples), ac.wav.rate);
  const wdv = new DataView(w.buffer);
  const wstr = (o: number) => String.fromCharCode(...w.subarray(o, o + 4));
  assert.deepEqual([wstr(0), wstr(8), wstr(12), wstr(36)], ["RIFF", "WAVE", "fmt ", "data"], "WAV 머리 글자");
  assert.deepEqual([wdv.getUint32(4, true), wdv.getUint16(20, true), wdv.getUint16(22, true), wdv.getUint32(24, true), wdv.getUint16(34, true), wdv.getUint32(40, true)], [ac.wav.riffLen, 1, 1, ac.wav.rate, 16, ac.wav.dataLen], "WAV 머리 값(PCM 1채널 16비트)");
  assert.deepEqual(Array.from({ length: ac.wav.samples.length }, (_, i) => wdv.getInt16(44 + i * 2, true)), ac.wav.int16, "WAV 샘플");
  // 받기 순서: player POST → 머리(0~indexEnd) → 조각, 두 번째는 조각만(캐시), 조각 실패 → null
  const acFrag = new Uint8Array(fs.readFileSync(path.join(acDir, "itag140-frag1.m4a"))).subarray(723);
  const acPlayer = JSON.stringify({ streamingData: { adaptiveFormats: ac.formats } });
  const acReqs: string[] = [];
  const acDecodes: number[][] = [];
  const acClip = acMod.createAudioClipper({
    request: async (r: any) => {
      if (r.method === "POST") {
        acReqs.push("POST");
        assert.ok(JSON.parse(r.body).context.client.clientName === "ANDROID" && JSON.parse(r.body).videoId === ac.videoId, "player 요청 본문");
        return { status: 200, text: acPlayer };
      }
      const m = /[?&]range=(\d+-\d+)$/.exec(r.url);
      acReqs.push(m ? m[1] : r.url);
      if (m?.[1] === `0-${acHead.length - 1}`) return { status: 200, arrayBuffer: acHead.slice().buffer };
      return { status: 200, arrayBuffer: acFrag.slice().buffer };
    },
    decode: async (bytes: ArrayBuffer, from: number, to: number, rate: number) => {
      const u = new Uint8Array(bytes);
      assert.equal(String.fromCharCode(...u.subarray(4, 8)), "ftyp", "디코더에 초기화 바이트가 앞에");
      assert.equal(u.length, 723 + acFrag.length, "초기화 + 조각 길이");
      acDecodes.push([from, to, rate]);
      return new Float32Array(Math.round((to - from) * rate));
    },
  });
  const acB64 = (await acClip(ac.videoId, ac.clipper.start, ac.clipper.end)).data;
  assert.ok(typeof acB64 === "string" && acB64.startsWith("UklGR"), "결과는 WAV base64(RIFF)");
  assert.deepEqual(acReqs, ["POST", ...ac.clipper.expectRanges], "받기 순서");
  assert.ok(Math.abs(acDecodes[0][0] - ac.clipper.expectDecode[0]) < 0.001 && Math.abs(acDecodes[0][1] - ac.clipper.expectDecode[1]) < 0.001 && acDecodes[0][2] === 22050, `디코드 구간 ${JSON.stringify(acDecodes[0])}`);
  acReqs.length = 0;
  await acClip(ac.videoId, ac.clipper.start, ac.clipper.end);
  assert.deepEqual(acReqs, [ac.clipper.expectRanges[1]], "두 번째는 캐시(조각만)");
  // SPEC_052: 실패 이유 — 매번 새 클리퍼(캐시 없음), 요청 종류 POST·HEAD(0~indexEnd)·FRAG
  for (const fc of ac.failures) {
    const reqs: string[] = [];
    const f = fc.failOn;
    let fragFails = 0;
    const clip = acMod.createAudioClipper({
      request: async (r: any) => {
        if (f.throw) {
          reqs.push(r.method === "POST" ? "POST" : "GET");
          throw new Error("offline");
        }
        if (r.method === "POST") {
          reqs.push("POST");
          return f.post ? { status: f.post } : { status: 200, text: acPlayer };
        }
        const m = /[?&]range=(\d+-\d+)$/.exec(r.url);
        if (m?.[1] === `0-${acHead.length - 1}`) {
          reqs.push("HEAD");
          return f.head ? { status: f.head } : { status: 200, arrayBuffer: acHead.slice().buffer };
        }
        reqs.push("FRAG");
        if (f.frag) return { status: f.frag };
        if (f.fragOnce && fragFails++ === 0) return { status: f.fragOnce };
        return { status: 200, arrayBuffer: acFrag.slice().buffer };
      },
      decode: async (_b: ArrayBuffer, from: number, to: number, rate: number) => {
        if (f.decode) throw new Error("bad audio");
        return new Float32Array(Math.round((to - from) * rate));
      },
    });
    const out = await clip(ac.videoId, ac.clipper.start, ac.clipper.end);
    if (fc.expectReason === null) assert.ok(typeof out.data === "string" && out.data.startsWith("UklGR"), `${fc.name}: 성공 ${JSON.stringify(out).slice(0, 80)}`);
    else assert.deepEqual(out, { data: null, reason: fc.expectReason }, `${fc.name}: 이유`);
    assert.deepEqual(reqs, fc.expectRequests, `${fc.name}: 요청 순서`);
  }
  log(`  -> PASS: sidx ${acSidx.fragments.length} fragments, ${ac.ranges.length} ranges, ${ac.windows.length} windows, ${ac.pick.length} picks, WAV header, clipper order+cache, ${ac.failures.length} failure reasons`);
  log("");

  log("[Test 24] Diagnostics — 최근 오류 링버퍼·연속 묶음·비밀 가리기·보고 글 (data-driven, SPEC_038)");
  const dgMod = process.env.EAR_COACH_DIAGNOSTICS_MODULE ? await import(path.resolve(process.env.EAR_COACH_DIAGNOSTICS_MODULE)) : diagnosticsSrc;
  const dg = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/diagnostics/cases.json"), "utf8"));
  let dgTick = 0;
  const dgClock = () => new Date(Date.UTC(2026, 10, 23, 0, 0, dgTick++)).toISOString();
  const dgRing = new dgMod.DiagnosticsLog(dg.ring.max, dgClock);
  for (let i = 0; i < dg.ring.push; i++) dgRing.record("단계", new Error(`오류 ${i}`));
  const dgList = dgRing.list();
  assert.equal(dgList.length, dg.ring.expectSize, "링버퍼 상한");
  assert.equal(dgList[0].message, dg.ring.expectFirstMessage, "오래된 것부터 버림");
  assert.equal(dgList[dgList.length - 1].message, dg.ring.expectLastMessage, "최신이 끝");
  assert.ok(dgList[0].detail && dgList[0].detail.split("\n").length <= 3, "스택 앞 3줄까지");
  const dgCol = new dgMod.DiagnosticsLog(50, dgClock);
  for (const [st, m] of dg.collapse.records) dgCol.record(st, new Error(m));
  assert.deepEqual(dgCol.list().map((e: any) => [e.stage, e.count]), dg.collapse.expect, "연달아 같은 오류만 묶음");
  for (const c of dg.redact) assert.equal(dgMod.redactDiagnostics(c.in, c.secrets), c.out, `redact ${c.in}`);
  for (const c of dg.describe) {
    const v = c.kind === "error" ? new Error(c.value) : c.kind === "httpFailure" ? Object.assign(new Error(c.value), { name: "HttpFailure", detail: c.detail }) : c.value;
    assert.equal(dgMod.describeError(v).message, c.expect, `describeError ${c.kind}`);
  }
  const dgRep = new dgMod.DiagnosticsLog(50, dgClock);
  for (const [st, m] of dg.report.records) dgRep.record(st, m);
  const dgText = dgMod.formatDiagnosticsReport(dg.report.env, dgRep.list(), dg.report.secrets);
  assert.ok(dgText.startsWith(dg.report.expectStartsWith), `보고 머리:\n${dgText}`);
  for (const c of dg.report.expectContains) assert.ok(dgText.includes(c), `보고에 「${c}」:\n${dgText}`);
  for (const c of dg.report.mustNotContain) assert.ok(!dgText.includes(c), `보고에 비밀 「${c}」가 남음:\n${dgText}`);
  assert.equal(dgMod.formatDiagnosticsReport(dg.report.env, [], dg.report.secrets), dg.report.emptyExpect, "오류 없음 보고");
  log(`  -> PASS: ring ${dgList.length}/${dg.ring.push}, ${dg.redact.length} redact, ${dg.describe.length} describe, report ${dgText.split("\n").length} lines`);
  log("");

  // 25. SPEC_039: 플러그인 연결 — main.ts를 가짜 obsidian으로 onload, 기대값은 tests/fixtures/wiring/expected.json
  log("[Test 25] Plugin wiring after feature split (data-driven, SPEC_039)");
  const { spawnSync } = await import("node:child_process");
  const wiringArgs = ["tests/wiring/runWiringCheck.mjs", ...(process.env.EAR_COACH_MAIN ? ["--main", process.env.EAR_COACH_MAIN] : [])];
  const wiring = spawnSync(process.execPath, wiringArgs, { encoding: "utf8" });
  assert.equal(wiring.status, 0, `wiring check failed:\n${wiring.stdout}${wiring.stderr}`);
  log(`  -> PASS: ${wiring.stdout.trim()}`);
  log("");

  log("[Test 26] Learning store — 핀·빈칸·재생 위치·퀴즈 한 파일, 상한·깨진 파일·새 판 읽기 전용·쓰기 줄 세움 (data-driven, SPEC_040)");
  const lsMod = process.env.EAR_COACH_LEARNING_MODULE ? await import(path.resolve(process.env.EAR_COACH_LEARNING_MODULE)) : learningSrc;
  const ls = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/learning/cases.json"), "utf8"));
  for (const sc of ls.scenarios) {
    let tick = 0;
    const clock = () => new Date(Date.UTC(2026, 10, 23, 0, 0, tick++)).toISOString();
    const file = { text: sc.file as string | null, writes: 0, n: 0 };
    const delays: number[] = sc.writeDelaysMs ?? [];
    const store = new lsMod.LearningStore(
      {
        read: async () => file.text,
        write: async (t: string) => {
          const d = delays[file.n++] ?? 0;
          if (d) await new Promise((r) => setTimeout(r, d));
          file.text = t;
          file.writes++;
        },
      },
      clock
    );
    const args = (a: any[]) => a.map((x) => (x === null ? undefined : x));
    if (sc.repeat?.op === "setPosition") {
      for (let i = 1; i <= sc.repeat.count; i++) await store.setPosition(`${sc.repeat.videoIdPrefix}${i}`, sc.repeat.seconds, sc.repeat.step);
    } else if (sc.repeat?.op === "recordBlankAndQuiz") {
      for (let i = 0; i < sc.repeat.count; i++) {
        await store.recordBlank("vidAAAAAAAA", i, `w${i}`, false);
        await store.recordQuiz("vidAAAAAAAA", 10, i);
      }
    }
    if (sc.concurrent) await Promise.all(sc.ops.map(([op, ...a]: any[]) => store[op](...args(a))));
    else for (const [op, ...a] of sc.ops) await store[op](...args(a));
    await store.flush();
    await new Promise((r) => setTimeout(r, 60));
    const e = sc.expect, tag = `[${sc.name}]`;
    const saved = file.text && !e.fileUnchanged ? JSON.parse(file.text) : null;
    if (e.pins) assert.deepEqual(await store.pins(), e.pins, `${tag} pins`);
    if (e.pinCount !== undefined) assert.equal((await store.pins()).length, e.pinCount, `${tag} pinCount`);
    if (e.writes !== undefined) assert.equal(file.writes, e.writes, `${tag} writes`);
    if (e.wrongBlanks) assert.deepEqual((await store.wrongBlanks()).map((b: any) => [b.videoId, b.word]), e.wrongBlanks, `${tag} wrongBlanks`);
    if (e.wrongBlanksSince) assert.deepEqual((await store.wrongBlanks(e.wrongBlanksSince.since)).map((b: any) => [b.videoId, b.word]), e.wrongBlanksSince.expect, `${tag} wrongBlanks since`);
    if (e.positionCount !== undefined) assert.equal(Object.keys(saved.positions).length, e.positionCount, `${tag} positionCount`);
    for (const id of e.positionMissing ?? []) assert.equal(await store.position(id), null, `${tag} position ${id} 버려짐`);
    for (const k of ["position", "positionKept"]) if (e[k]) assert.deepEqual(await store.position(e[k].videoId), e[k].value, `${tag} ${k}`);
    if (e.blankCount !== undefined) {
      assert.equal(saved.blanks.length, e.blankCount, `${tag} blankCount`);
      assert.equal(saved.blanks[0].word, e.firstBlankWord, `${tag} 오래된 빈칸부터 버림`);
      assert.equal(saved.quizzes.length, e.quizCount, `${tag} quizCount`);
      assert.equal(saved.quizzes[0].correct, e.firstQuizCorrect, `${tag} 오래된 퀴즈부터 버림`);
    }
    if (e.quizzes) assert.deepEqual((await store.quizzes(e.quizzes.videoId)).map((q: any) => q.correct), e.quizzes.correct, `${tag} quizzes`);
    if (e.savedSchemaVersion !== undefined) assert.equal(saved.schemaVersion, e.savedSchemaVersion, `${tag} schemaVersion`);
    if (e.readOnly !== undefined) assert.equal(store.isReadOnly(), e.readOnly, `${tag} readOnly`);
    if (e.fileUnchanged) assert.equal(file.text, sc.file, `${tag} 새 판 파일을 덮음`);
    if (e.savedPinTexts) assert.deepEqual(saved.pins.map((p: any) => p.text), e.savedPinTexts, `${tag} 마지막 상태가 파일에`);
  }
  log(`  -> PASS: ${ls.scenarios.length} scenarios (same pin <0.5s, latest blank result, caps 2000/500/200, broken file, schema 2 read-only, serialized writes).`);
  log("");

  log("[Test 27] HTTP policy — 시간 제한·잠깐 실패 재시도·오프라인 구분 (data-driven, SPEC_041)");
  const httpMod = process.env.EAR_COACH_HTTP_MODULE ? await import(path.resolve(process.env.EAR_COACH_HTTP_MODULE)) : httpSrc;
  const hc = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/http/cases.json"), "utf8"));
  for (const sc of hc.scenarios) {
    const tag = `[${sc.name}]`;
    const policy = typeof sc.policy === "string" ? httpMod.HTTP_POLICIES[sc.policy] : sc.policy;
    assert.ok(policy, `${tag} policy ${sc.policy}`);
    let attempts = 0;
    const sleeps: number[] = [];
    const online = [...(sc.online ?? [])];
    const request = () => {
      const st = sc.steps[Math.min(attempts++, sc.steps.length - 1)];
      if (st.hang) return new Promise(() => {});
      if (st.throw) return Promise.reject(new Error(st.throw));
      if (st.throwStatus) return Promise.reject(Object.assign(new Error(st.msg), { status: st.throwStatus }));
      return Promise.resolve({ status: st.status });
    };
    const deps = { sleep: async (ms: number) => void sleeps.push(ms), isOnline: () => (online.length > 0 ? online.shift() : true) };
    let got: any = null;
    let err: any = null;
    try {
      // 시간 제한이 안 걸리면 매달린 약속만 남아 node가 조용히 끝나므로, 2초 감시로 실패시킨다
      let guard: ReturnType<typeof setTimeout> | undefined;
      const watchdog = new Promise((_, rej) => (guard = setTimeout(() => rej(new Error("WATCHDOG: 2초 안에 끝나지 않음")), 2000)));
      try {
        got = await Promise.race([httpMod.sendWithPolicy(request, policy, deps), watchdog]);
      } finally {
        clearTimeout(guard);
      }
    } catch (e) {
      err = e;
    }
    assert.ok(!String(err?.message ?? "").startsWith("WATCHDOG"), `${tag} 시간 제한이 걸리지 않음`);
    const e = sc.expect;
    if (e.error) {
      assert.ok(err, `${tag} 실패해야 함 (받은 응답 ${JSON.stringify(got)})`);
      assert.equal(err.name, "HttpFailure", `${tag} HttpFailure`);
      assert.equal(err.kind, e.error, `${tag} kind`);
      if (e.message !== undefined) assert.equal(err.message, e.message, `${tag} message`);
      if (e.errStatus !== undefined) assert.equal(err.status, e.errStatus, `${tag} status`);
      if (e.detail !== undefined) assert.equal(err.detail, e.detail, `${tag} detail`);
    } else {
      assert.ok(!err, `${tag} 실패하면 안 됨: ${err?.message}`);
      assert.equal(got.status, e.status, `${tag} status`);
    }
    assert.equal(attempts, e.attempts, `${tag} attempts`);
    assert.deepEqual(sleeps, e.sleeps, `${tag} sleeps`);
  }
  for (const u of hc.unreachable ?? []) {
    assert.equal(typeof httpMod.isUnreachableError, "function", "isUnreachableError export");
    assert.equal(httpMod.isUnreachableError(u.text), u.expect, `[isUnreachableError ${JSON.stringify(u.text)}]`);
  }
  log(`  -> PASS: ${(hc.unreachable ?? []).length} unreachable texts (SPEC_056).`);
  log(`  -> PASS: ${hc.scenarios.length} scenarios (retry 408/429/5xx, no retry 404·AI·Anki, timeout, offline, backoff).`);
  log("");

  log("[Test 28] Notices — 실패 원인 한 줄·해요체·원문 숨김·「다시」 자리 (data-driven, SPEC_042)");
  const ntMod = process.env.EAR_COACH_NOTICES_MODULE ? await import(path.resolve(process.env.EAR_COACH_NOTICES_MODULE)) : noticesSrc;
  const nt = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/notices/cases.json"), "utf8"));
  const makeErr = (d: any): unknown => {
    if (d.known !== undefined) return new ntMod.KnownFailure(d.known);
    if (d.http) return new httpSrc.HttpFailure(d.http.kind, d.http.message, d.http.status ?? null);
    if (d.statusObj !== undefined) return { status: d.statusObj };
    if (d.ai) return { ...d.ai };
    if (d.error !== undefined) return new Error(d.error);
    if (d.text !== undefined) return d.text;
    return null;
  };
  for (const c of nt.cause) {
    const got = ntMod.failureCause(makeErr(c.err));
    assert.equal(got, c.want, `failureCause [${c.name}]`);
    if (c.raw) assert.ok(!got.includes(c.raw), `[${c.name}] 원문 「${c.raw}」이 알림에 남음: ${got}`);
    assert.ok(!/https?:|status|\?/.test(got), `[${c.name}] 원인에 URL·status: ${got}`);
  }
  for (const c of nt.notice) assert.equal(ntMod.failureNotice(c.what, makeErr(c.err)), c.want, `failureNotice ${c.what}`);
  assert.equal(ntMod.RETRY_NOTICE_MS, nt.retry.ms, "RETRY_NOTICE_MS");
  assert.equal(ntMod.RETRY_LABEL, nt.retry.label, "RETRY_LABEL");
  // 해요체: 문구 상수·결과
  const polite: string[] = [
    ...Object.values(ntMod.NOTICE_CAUSES).map((v: any) => (typeof v === "function" ? v(15) : v)),
    ...Object.values(ankiSrc.ANKI_MESSAGES).map(String),
    ...Object.values(aiSrc.AI_MESSAGES).map((v: any) => (typeof v === "function" ? v(3, 20) : v)),
    ankiSrc.ankiStatusMessage(new ankiSrc.AnkiConnectError("connection", "x")),
  ];
  for (const r of nt.aiResult) {
    const msg = aiSrc.aiResultMessage(r as any);
    polite.push(msg);
    if (r.want) assert.equal(msg, r.want, `aiResultMessage ${r.stoppedBy?.kind}`);
  }
  for (const t of polite) for (const f of nt.politeScan.forbidden) assert.ok(!t.includes(f), `해요체 아님: ${t}`);
  // 소스 검사: new Notice( 줄 + 다음 N줄
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));
  let noticeSites = 0;
  for (const f of walk(path.resolve(nt.politeScan.dir))) {
    const lines = fs.readFileSync(f, "utf8").split("\n");
    lines.forEach((ln, i) => {
      if (!ln.includes(nt.politeScan.trigger)) return;
      noticeSites++;
      // 여러 줄 호출만 다음 줄을 본다(한 줄 호출이 닫히면 그 줄만)
      const open = (ln.split("(").length - ln.split(")").length) > 0;
      const chunk = open ? lines.slice(i, i + 1 + nt.politeScan.following).join("\n") : ln;
      for (const bad of nt.politeScan.forbidden) assert.ok(!chunk.includes(bad), `${path.relative(".", f)}:${i + 1} 해요체 아님: ${ln.trim()}`);
    });
  }
  // 원문 숨김
  for (const f of nt.rawScan.files) {
    fs.readFileSync(path.resolve(f), "utf8").split("\n").forEach((ln, i) => {
      if (!nt.rawScan.triggers.some((t: string) => ln.includes(t))) return;
      for (const bad of nt.rawScan.forbidden) assert.ok(!ln.includes(bad), `${f}:${i + 1} 알림에 원문: ${ln.trim()}`);
    });
  }
  // 「다시」 자리
  let retrySites = 0;
  for (const [f, n] of Object.entries(nt.retrySites)) {
    if (f.startsWith("_")) continue;
    const cnt = fs.readFileSync(path.resolve(f), "utf8").split("notifyRetry(").length - 1;
    assert.ok(cnt >= (n as number), `${f}: notifyRetry ${cnt}곳 < ${n}`);
    retrySites += cnt;
  }
  log(`  -> PASS: ${nt.cause.length} cause cases, ${nt.notice.length} notice cases, ${polite.length} message constants 해요체, ${noticeSites} Notice sites scanned, ${retrySites} retry sites.`);
  log("");

  log("[Test 29] Karaoke — 낱말 시작 시각 붙이기·재생 시각 → 칠할 낱말 (data-driven, SPEC_043)");
  const kaMod = process.env.EAR_COACH_KARAOKE_MODULE ? await import(path.resolve(process.env.EAR_COACH_KARAOKE_MODULE)) : karaokeSrc;
  const ka = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/karaoke/cases.json"), "utf8"));
  for (const c of ka.active) {
    assert.equal(kaMod.activeWordIndex(c.seg, c.t), c.expect, `activeWordIndex: ${c.name}`);
  }
  for (const c of ka.attach) {
    const segs = c.segs.map((s: any, i: number) => ({ ...s, index: i, text: s.words.join(" ") }));
    kaMod.attachWordStarts(segs, c.cues);
    assert.deepEqual(segs.map((s: any) => s.wordStarts ?? null), c.expect, `attachWordStarts: ${c.name}`);
  }
  // 실제 자막: 문장 나누기 뒤 붙는 비율 + 불변식(길이·줄지 않음·범위 안). 붙이기는 변이 모듈로 다시 한다.
  const kaSummary: string[] = [];
  for (const r of ka.real) {
    const cues: RawTranscriptCue[] = captionPayloadSrc.parseCaptionPayload(fs.readFileSync(path.resolve("tests/fixtures/transcript", r.file), "utf8"));
    const segs = mergeCuesIntoSegments(cues, { speedSpikeWpmThreshold: 180, defaultUnlockStep: 0 });
    kaMod.attachWordStarts(segs, cues);
    const timed = segs.filter((s) => s.wordStarts);
    for (const s of timed) {
      const ws = s.wordStarts!;
      assert.equal(ws.length, s.words.length, `${r.file} #${s.index}: wordStarts 길이`);
      for (let i = 0; i < ws.length; i++) {
        assert.ok(ws[i] >= s.start - 0.5 && ws[i] <= s.end + 0.5, `${r.file} #${s.index}: ${s.words[i]}@${ws[i]} 범위 밖 [${s.start}, ${s.end}]`);
        if (i > 0) assert.ok(ws[i] >= ws[i - 1], `${r.file} #${s.index}: 시각이 줄어듦 (${s.words[i]})`);
      }
    }
    if (r.minRatio !== undefined) assert.ok(timed.length / segs.length >= r.minRatio, `${r.file}: 붙은 카드 ${timed.length}/${segs.length} < ${r.minRatio}`);
    if (r.maxCount !== undefined) assert.ok(timed.length <= r.maxCount, `${r.file}: 붙은 카드 ${timed.length} > ${r.maxCount}`);
    kaSummary.push(`${r.file} ${timed.length}/${segs.length}`);
  }
  log(`  -> PASS: ${ka.active.length} active cases, ${ka.attach.length} attach cases, real: ${kaSummary.join(", ")}.`);
  log("");

  log("[Test 30] Today sentences — 차례 핀 + 지난날 틀린 빈칸 문장 최대 5개 (data-driven, SPEC_044)");
  const tdMod = process.env.EAR_COACH_TODAY_MODULE ? await import(path.resolve(process.env.EAR_COACH_TODAY_MODULE)) : todaySrc;
  const td = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/today/cases.json"), "utf8"));
  const tdNow = Date.parse(td.now);
  for (const c of td.wrong) {
    assert.deepEqual(tdMod.wrongBlankSegmentIndices(td.segments, c.blanks, "v1", tdNow, td.tz), c.expect, `wrongBlankSegmentIndices: ${c.name}`);
  }
  for (const c of td.pick) {
    assert.deepEqual(tdMod.pickTodaySentences(c.due, c.wrong), c.expect, `pickTodaySentences: ${c.name}`);
  }
  assert.equal(tdMod.TODAY_SENTENCES_MAX, 5, "TODAY_SENTENCES_MAX = 5");
  log(`  -> PASS: ${td.wrong.length} wrong-blank cases, ${td.pick.length} pick cases.`);
  log("");

  log("[Test 31] Card length quality — 너무 짧은·너무 긴·말이 걸린 카드·시간·자르는 자리 (data-driven, SPEC_048·049)");
  const slMod = process.env.EAR_COACH_SEGMENT_MODULE ? await import(path.resolve(process.env.EAR_COACH_SEGMENT_MODULE)) : transcriptProcSrc;
  const sl = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/segment-length/cases.json"), "utf8"));
  const slOpts = { speedSpikeWpmThreshold: 180, defaultUnlockStep: 0 as const };
  const slWords = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const slSummary: string[] = [];
  for (const r of sl.real) {
    const cues: RawTranscriptCue[] = captionPayloadSrc.parseCaptionPayload(fs.readFileSync(path.resolve("tests/fixtures/transcript", r.file), "utf8"));
    const segs = slMod.mergeCuesIntoSegments(cues, slOpts) as Array<{ text: string }>;
    const wc = segs.map((s) => slWords(s.text));
    const max = Math.max(...wc);
    const short = wc.filter((n) => n <= sl.shortWords).length / segs.length;
    const long = wc.filter((n) => n > sl.longWords).length / segs.length;
    const dangling = segs.slice(0, -1).filter((s) => segmentBalanceSrc.isDanglingTail(s.text.trim().split(/\s+/).pop() ?? "")).length / segs.length;
    const letterless = segs.filter((s) => !/[\p{L}\p{N}]/u.test(s.text)).length;
    assert.ok(max <= r.maxWords, `${r.file}: 가장 긴 카드 ${max}낱말 > ${r.maxWords}`);
    assert.ok(short <= r.maxShortRatio, `${r.file}: 짧은 카드(<=${sl.shortWords}낱말) ${short.toFixed(3)} > ${r.maxShortRatio}`);
    assert.ok(long <= r.maxLongRatio, `${r.file}: 긴 카드(>${sl.longWords}낱말) ${long.toFixed(3)} > ${r.maxLongRatio}`);
    assert.ok(dangling <= r.maxDanglingRatio, `${r.file}: 말이 걸린 카드 ${dangling.toFixed(3)} > ${r.maxDanglingRatio}`);
    assert.equal(letterless, 0, `${r.file}: 글자 없는 카드 ${letterless}개`);
    // SPEC_049: time and cut quality (definitions in tests/segmentMetrics.ts, lists from the data).
    const m = cardMetrics(segs as Array<{ start: number; end: number; text: string }>, {
      shortWords: sl.shortWords, longWords: sl.longWords, minCardSec: sl.minCardSec, maxCardSec: sl.maxCardSec, manual: r.kind === "manual", lists: sl.cut,
    });
    if (!r.timeExempt) {
      assert.ok(m.underSec <= r.maxUnderSecRatio, `${r.file}: ${sl.minCardSec}초보다 짧은 카드 ${m.underSec} > ${r.maxUnderSecRatio}`);
      assert.ok(m.overSec <= r.maxOverSecRatio, `${r.file}: ${sl.maxCardSec}초보다 긴 카드 ${m.overSec} > ${r.maxOverSecRatio}`);
    }
    assert.ok(m.phrasal <= r.maxPhrasalRatio, `${r.file}: 구동사 쪼갬 ${m.phrasal} > ${r.maxPhrasalRatio}`);
    assert.ok(m.filler <= r.maxFillerRatio, `${r.file}: 말버릇 쪼갬 ${m.filler} > ${r.maxFillerRatio}`);
    assert.ok(m.properNum <= r.maxProperNumRatio, `${r.file}: 숫자·고유명 쪼갬 ${m.properNum} > ${r.maxProperNumRatio}`);
    assert.ok(m.badCut <= r.maxBadCutRatio, `${r.file}: 나쁜 자름 ${m.badCut} > ${r.maxBadCutRatio}`);
    const b9 = r.before049;
    slSummary.push(`${r.file} [049] cards ${b9.cards}->${m.cards}, <${sl.minCardSec}s ${b9.underSec}->${m.underSec}, >${sl.maxCardSec}s ${b9.overSec}->${m.overSec}, phrasal ${b9.phrasal}->${m.phrasal}, filler ${b9.filler}->${m.filler}, properNum ${b9.properNum}->${m.properNum}, badCut ${b9.badCut}->${m.badCut}`);
    slSummary.push(`${r.file} ${r.before.cards}->${segs.length} cards, max ${r.before.maxWords}->${max}w, short ${r.before.short}->${short.toFixed(3)}, long ${r.before.long}->${long.toFixed(3)}, dangling ${r.before.dangling}->${dangling.toFixed(3)}`);
  }
  // SPEC_049: the code's cut lists are the data's lists (the metric must not drift from the fix).
  assert.deepEqual([...segmentBalanceSrc.PHRASAL_PARTICLES], sl.cut.particles, "PHRASAL_PARTICLES = cut.particles");
  assert.deepEqual([...segmentBalanceSrc.PHRASAL_VERBS], sl.cut.phrasalVerbs, "PHRASAL_VERBS = cut.phrasalVerbs");
  assert.deepEqual(segmentBalanceSrc.PHRASAL_IRREGULAR, sl.cut.irregularVerbs, "PHRASAL_IRREGULAR = cut.irregularVerbs");
  assert.deepEqual(segmentBalanceSrc.FILLER_PAIRS, sl.cut.fillerPairs, "FILLER_PAIRS = cut.fillerPairs");
  assert.deepEqual([...segmentBalanceSrc.DANGLING_TAIL_WORDS], sl.cut.danglingTails, "DANGLING_TAIL_WORDS = cut.danglingTails");
  for (const c of sl.cases) {
    const cues: RawTranscriptCue[] = c.asr
      ? c.asr.map((line: [number, string][]) => ({
          start: line[0][0],
          duration: Number((line[line.length - 1][0] - line[0][0] + 0.5).toFixed(3)),
          text: line.map((w) => w[1]).join(" "),
          words: line.map(([start, text]) => ({ start, text })),
        }))
      : c.cues.map(([start, duration, text]: [number, number, string]) => ({ start, duration, text }));
    const got = (slMod.mergeCuesIntoSegments(cues, slOpts) as Array<{ text: string }>).map((s) => s.text);
    assert.deepEqual(got, c.expect, `card length: ${c.name}`);
  }
  log(`  -> PASS: ${sl.cases.length} synthetic cases; ${slSummary.join("; ")}.`);
  log("");

  log("[Test 32] Shadowing — 녹음 한도·녹음 형식·버튼 글자·실패 이유 (data-driven, SPEC_045)");
  const sdMod = process.env.EAR_COACH_SHADOWING_MODULE ? await import(path.resolve(process.env.EAR_COACH_SHADOWING_MODULE)) : shadowSrc;
  const sdc = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/shadowing/cases.json"), "utf8"));
  assert.equal(sdMod.SHADOW_EXTRA_SEC, sdc.constants.SHADOW_EXTRA_SEC, "SHADOW_EXTRA_SEC");
  assert.equal(sdMod.SHADOW_MAX_SEC, sdc.constants.SHADOW_MAX_SEC, "SHADOW_MAX_SEC");
  assert.equal(sdMod.SHADOW_MAX_SEC, audioClipSrc.CLIP_MAX_SEC, "SHADOW_MAX_SEC = CLIP_MAX_SEC");
  for (const c of sdc.limit) {
    const d = c.duration === "NaN" ? NaN : c.duration;
    const got = sdMod.shadowLimitSec(d);
    assert.ok(Math.abs(got - c.expect) < 1e-9, `shadowLimitSec: ${c.name} → ${got}`);
  }
  for (const c of sdc.mime) {
    const asked: string[] = [];
    const got = sdMod.pickRecorderMime((m: string) => {
      asked.push(m);
      if ((c.throws ?? []).includes(m)) throw new Error("boom");
      return c.supported.includes(m);
    });
    assert.equal(got, c.expect, `pickRecorderMime: ${c.name}`);
  }
  for (const c of sdc.label) assert.equal(sdMod.shadowRecordingLabel(c.remaining), c.expect, `shadowRecordingLabel(${c.remaining})`);
  for (const c of sdc.failure) {
    const reason = sdMod.shadowFailureReason(c.err);
    assert.equal(reason, c.expect, `shadowFailureReason: ${c.name}`);
    if (reason) assert.ok(!reason.includes("니다"), `해요체: ${reason}`);
  }
  log(`  -> PASS: ${sdc.limit.length} limit, ${sdc.mime.length} mime, ${sdc.label.length} label, ${sdc.failure.length} failure cases.`);
  log("");

  log("[Test 33] Resume — 이어 보기 위치·저장 간격 (data-driven, SPEC_046)");
  const rsMod = process.env.EAR_COACH_RESUME_MODULE ? await import(path.resolve(process.env.EAR_COACH_RESUME_MODULE)) : resumeSrc;
  const rsc = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/resume/cases.json"), "utf8"));
  for (const [k, v] of Object.entries(rsc.constants)) assert.equal(rsMod[k], v, k);
  for (const c of rsc.resumePoint) assert.equal(rsMod.resumePoint(c.pos, c.lastEnd), c.expect, `resumePoint: ${c.name}`);
  for (const c of rsc.shouldSave) assert.equal(rsMod.shouldSavePosition(c.last, c.now), c.expect, `shouldSavePosition: ${c.name}`);
  log(`  -> PASS: ${rsc.resumePoint.length} resumePoint, ${rsc.shouldSave.length} shouldSave cases.`);
  log("");

  log("[Test 34] Dictionary cache — 한 번 찾은 낱말은 네트워크 없이 (data-driven, SPEC_047)");
  const dcMod = process.env.EAR_COACH_DICTCACHE_MODULE ? await import(path.resolve(process.env.EAR_COACH_DICTCACHE_MODULE)) : dictCacheSrc;
  const dcc = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/dict-cache/cases.json"), "utf8"));
  for (const [k, v] of Object.entries(dcc.constants)) assert.equal(dcMod[k], v, k);
  const fakeEntry = (w: string) => ({ word: w, phonetic: null, ipaUs: null, audioUrl: null, meanings: [{ partOfSpeech: "noun", definitions: [{ definition: `def of ${w}`, example: null }] }], sourceUrl: null });
  for (const sc of dcc.scenarios) {
    const file = { text: (sc.file ?? null) as string | null, writes: 0 };
    const memFile = { read: async () => file.text, write: async (t: string) => { file.writes++; file.text = t; } };
    let clock = Date.parse("2026-11-24T00:00:00.000Z");
    let respond: string | undefined;
    let calls = 0;
    const inner = {
      name: "fake",
      lookup: async (w: string) => {
        calls++;
        if (respond === "ok") return fakeEntry(w);
        if (respond === "404") return null;
        throw new Error(respond ? `network ${respond}` : `unexpected network: ${w}`);
      },
    };
    const make = () => new dcMod.CachedDictionaryProvider(inner, memFile, { normalize: normalizeLookupWord, now: () => clock });
    let prov = make();
    if (sc.fill) {
      respond = "ok";
      for (let i = 0; i < sc.fill; i++) { clock += 1000; await prov.lookup(`w${i}`); }
      await prov.flush();
    }
    const keysNow = () => Object.keys(file.text ? JSON.parse(file.text).entries ?? {} : {});
    for (const [i, st] of sc.steps.entries()) {
      const tag = `${sc.name} #${i + 1}`;
      if (st.reopen) { await prov.flush(); prov = make(); }
      if (st.advanceDays) clock += st.advanceDays * 86400000;
      respond = st.respond;
      calls = 0;
      let got: any;
      let threw = false;
      try { got = await prov.lookup(st.lookup); } catch { threw = true; }
      await prov.flush();
      assert.equal(calls, st.calls, `${tag}: network calls`);
      if (st.expect === "throw") assert.ok(threw, `${tag}: should throw`);
      else {
        assert.ok(!threw, `${tag}: threw`);
        if (st.expect === null) assert.equal(got, null, `${tag}: null`);
        else assert.deepEqual(got, fakeEntry(normalizeLookupWord(st.lookup)), `${tag}: entry`);
      }
      for (const k of st.absentNow ?? []) assert.ok(!keysNow().includes(k), `${tag}: ${k} should not be saved`);
    }
    await prov.flush();
    if (sc.keys || sc.absent || sc.keyCount !== undefined) {
      const ks = keysNow();
      for (const k of sc.keys ?? []) assert.ok(ks.includes(k), `${sc.name}: file has ${k}`);
      for (const k of sc.absent ?? []) assert.ok(!ks.includes(k), `${sc.name}: file lacks ${k}`);
      if (sc.keyCount !== undefined) assert.equal(ks.length, sc.keyCount, `${sc.name}: key count`);
    }
    if (sc.writes?.min !== undefined) assert.ok(file.writes >= sc.writes.min, `${sc.name}: writes ${file.writes} >= ${sc.writes.min}`);
    if (sc.writes?.max !== undefined) assert.ok(file.writes <= sc.writes.max, `${sc.name}: writes ${file.writes} <= ${sc.writes.max}`);
  }
  {
    // 실제 응답: DictionaryApiDevProvider(+Commons) → 캐시 → 파일 다시 읽기 → 같은 결과, 네트워크 0번
    const realRaw = JSON.parse(fs.readFileSync(path.resolve(dcc.real.response), "utf8")).response;
    const realCommons = JSON.parse(fs.readFileSync(path.resolve(dcc.real.commons), "utf8")).response;
    let net = 0;
    const api = new DictionaryApiDevProvider(async (url: string) => {
      net++;
      return url.includes("commons.wikimedia.org") ? { status: 200, json: realCommons } : { status: 200, json: realRaw };
    });
    const f = { text: null as string | null };
    const mf = { read: async () => f.text, write: async (t: string) => { f.text = t; } };
    const p1 = new dcMod.CachedDictionaryProvider(api, mf, { normalize: normalizeLookupWord });
    const first = await p1.lookup(dcc.real.word);
    await p1.flush();
    assert.ok(first && first.meanings.length > 0, "real: first lookup");
    const before = net;
    const offline = { name: "offline", lookup: async () => { throw new Error("offline"); } };
    const p2 = new dcMod.CachedDictionaryProvider(offline, mf, { normalize: normalizeLookupWord });
    assert.deepEqual(await p2.lookup(dcc.real.word.toUpperCase()), first, "real: JSON 왕복 같은 결과");
    assert.equal(net, before, "real: 다시 찾기 네트워크 0번");
    log(`  -> real: ${first.word} ${first.phonetic} ${first.meanings.length} meanings, audio ${first.audioUrl}, file ${f.text!.length} bytes`);
  }
  log(`  -> PASS: ${dcc.scenarios.length} scenarios + real response round trip.`);
  log("");

  log("[Test 35] Yesterday quiz — 날 고르기·문장 고르기·채점 (data-driven, SPEC_050)");
  const yqMod = process.env.EAR_COACH_QUIZ_MODULE ? await import(path.resolve(process.env.EAR_COACH_QUIZ_MODULE)) : yesterdayQuizSrc;
  const yq = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/yesterday-quiz/cases.json"), "utf8"));
  const yqNow = Date.parse(yq.now);
  for (const c of yq.day) assert.deepEqual(yqMod.pickQuizDay(c.act, yqNow, yq.tz), c.expect, `pickQuizDay: ${c.name}`);
  for (const c of yq.banner) assert.equal(yqMod.quizBannerText(c.daysAgo, c.count), c.expect, `quizBannerText ${c.daysAgo}`);
  for (const c of yq.pick) assert.deepEqual(yqMod.pickQuizSegments(yq.segments, c.marks, c.max), c.expect, `pickQuizSegments: ${c.name}`);
  for (const c of yq.grade) {
    const g = yqMod.gradeQuizAnswer(c.answer, c.expected, dictationSrc.dictationMatches);
    const got = { correct: g.correct, total: g.total, pass: g.pass, missed: g.words.filter((w: { ok: boolean }) => !w.ok).map((w: { text: string }) => w.text) };
    assert.deepEqual(got, c.expect, `gradeQuizAnswer: ${c.name}`);
  }
  log(`  -> PASS: ${yq.day.length} day cases, ${yq.pick.length} pick cases, ${yq.grade.length} grade cases.`);
  log("");

  log("[Test 36] Share text — 공유 글에서 유튜브 주소 찾기 (data-driven, SPEC_053)");
  const shareMod = process.env.EAR_COACH_SHARE_MODULE ? await import(path.resolve(process.env.EAR_COACH_SHARE_MODULE)) : await import("../src/utils/youtubeUrlParser.ts");
  const shareCases = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/share/cases.json"), "utf8"));
  for (const c of shareCases.cases) {
    const got = shareMod.findYouTubeInShare(c.text);
    const norm = got ? { url: got.url, videoId: shareMod.parseYouTubeUrl(got.url)?.videoId, ...(got.timestampSeconds !== undefined ? { timestampSeconds: got.timestampSeconds } : {}) } : null;
    assert.deepEqual(norm, c.expect, `findYouTubeInShare: ${c.name}`);
  }
  log(`  -> PASS: ${shareCases.cases.length} share cases.`);
  log("");

  log("[Test 37] Weakness dashboard — 다시 켜도 기록 지키기 (data-driven, SPEC_055)");
  const weakMod = process.env.EAR_COACH_WEAKNESS_MODULE ? await import(path.resolve(process.env.EAR_COACH_WEAKNESS_MODULE)) : await import("../src/utils/weaknessDashboard.ts");
  const weakCases = JSON.parse(fs.readFileSync(path.resolve("tests/fixtures/weakness/cases.json"), "utf8"));
  const weakRows = (md: string) => md.split("\n").filter((l) => l.startsWith("- **[")).map((l) => (l.match(/\|\|(.*)\|\| \$/) ?? [])[1]);
  const weakCount = (md: string, trap: string) => {
    const label = weakMod.WEAKNESS_TRAP_LABELS[trap];
    const row = md.split("\n").find((l) => l.startsWith(`| ${label} |`));
    return Number((row?.match(/\*\*(\d+)회\*\*/) ?? [])[1]);
  };
  for (const c of weakCases.cases) {
    let entries: any[] = [];
    for (const st of c.steps) {
      if (st.record) entries = weakMod.upsertWeaknessEntry(entries, st.record);
      if (st.restart) entries = weakMod.parseWeaknessDashboard(weakMod.renderWeaknessDashboard(entries, "2026-11-25T00:00:00.000Z"));
    }
    const md = weakMod.renderWeaknessDashboard(entries, "2026-11-25T00:00:00.000Z");
    assert.deepEqual(weakRows(md), c.expect.rows, `weakness rows: ${c.name}`);
    for (const [trap, n] of Object.entries(c.expect.counts)) assert.equal(weakCount(md, trap), n, `weakness count ${trap}: ${c.name}`);
    if (c.expect.heard) assert.equal(weakMod.parseWeaknessDashboard(md)[1]?.userHeard, c.expect.heard, `weakness heard: ${c.name}`);
    assert.deepEqual(weakMod.parseWeaknessDashboard(md), entries, `weakness 숨은 기록 그대로 되읽힘: ${c.name}`);
  }
  for (const c of weakCases.parse) assert.equal(weakMod.parseWeaknessDashboard(c.markdown).length, c.expectCount, `weakness parse: ${c.name}`);
  {
    const lim = weakCases.limits;
    let many: any[] = [];
    for (let i = 0; i < lim.entries; i++) many = weakMod.upsertWeaknessEntry(many, { videoId: "v", videoTitle: "V", notePath: "n", segmentStart: i, segmentText: `s${i}`, phoneticKr: "", traps: ["LINKING"], recordedAt: "2026-11-25" });
    const md = weakMod.renderWeaknessDashboard(many, "2026-11-25T00:00:00.000Z");
    assert.equal(weakRows(md).length, lim.visibleMax, "weakness 보이는 줄 상한");
    assert.equal(weakMod.parseWeaknessDashboard(md).length, lim.storedMax, "weakness 저장 상한");
    for (const h of weakCases.headings) assert.ok(md.split("\n").includes(h), `weakness 제목 유지: ${h}`);
    const empty = weakMod.renderWeaknessDashboard([], "2026-11-25T00:00:00.000Z");
    assert.ok(empty.includes("- 아직 등록된 취약 문장이 없습니다."), "weakness 빈 목록 문구");
  }
  log(`  -> PASS: ${weakCases.cases.length} restart cases, ${weakCases.parse.length} parse cases, limits.`);
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
