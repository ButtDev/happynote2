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
import {
  formatLayoutDiagMarkdown,
  summarizeLayoutDiag,
} from "../src/utils/layoutDiagnostics.ts";
import { clampLandscapeLeftPercent, landscapeLeftPercentFromPointer } from "../src/utils/landscapeSplit.ts";

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

  // 7. Layout diagnostics text (SPEC_005) — data in tests/fixtures/layout-diag/
  log("[Test 7] Layout Diagnostics Summary & Markdown (data-driven)");
  const diagDir = path.resolve("tests/fixtures/layout-diag");
  for (const f of fs.readdirSync(diagDir).filter((n) => n.endsWith(".json")).sort()) {
    const c = JSON.parse(fs.readFileSync(path.join(diagDir, f), "utf8"));
    const summaryLines = summarizeLayoutDiag(c.diag).split("\n");
    for (const line of c.expectSummaryLines) {
      assert.ok(summaryLines.includes(line), `${f}: summary missing line "${line}"\n--- got ---\n${summaryLines.join("\n")}`);
    }
    const md = formatLayoutDiagMarkdown(c.diag, c.generatedAt);
    for (const part of c.expectMarkdownIncludes) {
      assert.ok(md.includes(part), `${f}: markdown missing "${part}"`);
    }
    log(`  -> PASS: ${f} (${c.name})`);
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
