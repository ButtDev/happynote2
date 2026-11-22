---
id: SPEC_043
title: 노래방식 낱말 하이라이트 — 재생 중 정답 문장 낱말을 단어 시각대로 차례로 강조
status: READY
iterations: 0
max_iterations: 3
depends_on: [SPEC_018]
---

# SPEC 043 — 노래방식 낱말 하이라이트

> 2026-11-23 사람: 백로그 「노래방식 단어 하이라이트」 → 「하이라이트 지금 진행」(`log/confirmations.jsonl`). 낮에 main에서 진행, 회귀 통과 뒤 BRAT 배포·⏳.

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
자동 자막(ASR)은 낱말마다 시작 시각(`RawTranscriptCue.words`)이 있지만 문장 카드(`TranscriptSegment`)로 합칠 때 사라진다. 합친 뒤 카드 낱말(`seg.words`)마다 시작 시각을 원본 낱말 흐름에서 찾아 `seg.wordStarts`로 붙인다(모든 낱말을 찾았을 때만, 아니면 붙이지 않음). 재생 중 지금 문장 카드가 3단계(정답 문장)이고 `wordStarts`가 있으면, 재생 시각에 해당하는 낱말 하나를 강조한다. 단어 시각이 없는 카드(수동 자막·옛 영상)는 지금 그대로다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/utils/karaoke.ts`(새): 순수 함수 `attachWordStarts`, `activeWordIndex`. obsidian import 없음.
- `src/types/transcript.ts`: `TranscriptSegment.wordStarts?: number[]`.
- `src/workers/transcriptProcessor.ts`: `mergeCuesIntoSegments` 끝에서 `attachWordStarts(segments, cues)`(두 경로 모두).
- `src/ui/components/SegmentCard.ts`: 3단계 낱말 span에 `data-wi`, `setPlaybackTime(t)`, 강조 끄기(`setActiveHighlight(false)`일 때).
- `src/ui/components/VirtualSegmentList.ts`: `setPlaybackTime(segmentIdx, t)` → 그 카드로 전달.
- `src/ui/EarCoachView.ts`: `handlePlaybackTimeUpdate`에서 `virtualList.setPlaybackTime(activeIdx, timeSec)` 한 줄.
- `styles.css`: `.ear-coach-word.is-karaoke`.
- 시험: `tests/fixtures/karaoke/cases.json`(새), `tests/runTests.ts` Test 29, `tests/ui/cases.json`·`tests/ui/runUiCheck.mjs` `expect.karaoke`.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `TranscriptSegment.wordStarts?: number[]` — 길이 = `words.length`, 초 단위 절대 시각, 줄지 않음.
- `attachWordStarts(segments: TranscriptSegment[], cues: RawTranscriptCue[]): void` — 원본 낱말 흐름 = `cue.words`(없으면 붙이지 않음)를 공백으로 나눠 시각순으로. 카드 낱말을 `bareWord`(소문자, 앞뒤 구두점 뺌) 비교로 앞에서부터 찾고, 사이에 원본 낱말을 최대 `KARAOKE_MAX_SKIP = 3`개 건너뛸 수 있음(군말 빠짐). 찾는 범위는 `seg.start - 0.5` ~ `seg.end + 0.5`. 하나라도 못 찾으면 그 카드엔 붙이지 않음.
- `activeWordIndex(seg, t): number` — `wordStarts`가 없거나 `t < seg.start` 또는 `t >= seg.end`면 `-1`, 아니면 `wordStarts[i] <= t`인 마지막 `i`(첫 낱말 전이면 `-1`).
- 강조 클래스 `is-karaoke`: 배경 `var(--text-highlight-bg)`, 글자 굵기·크기 그대로(줄바꿈이 바뀌지 않게).
- 강조는 3단계 카드의 `.ear-coach-full-script` 안 `.ear-coach-word[data-wi]`에만 붙는다. 한 번에 최대 1개.

## 4. 범위 밖
- 0~2단계(가린 문장·빈칸·힌트) 강조, 낱말 끝 시각·부분 채우기 애니메이션.
- 단어 시각이 없는 자막의 시각 추정, 옛 영상 다시 처리(사람 11-22: 호환 작업 안 함).
- 설정 켜기·끄기 칸(되돌릴 수 있게 가결정만).
- 학습 기록 연결.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] Test 29 `activeWordIndex` 사례(시각 없음·문장 전·첫 낱말 전·가운데·마지막 낱말·문장 끝) 기대값과 같음 + 변이 실패 [자동]
2. [ ] Test 29 `attachWordStarts` 합성 사례(군말 빠짐·구두점·대문자 I·못 찾음 → 없음·cue.words 없음 → 없음) 기대값과 같음 + 변이 실패 [자동]
3. [ ] Test 29 실제 자막 불변식: `ted-asr`·`rick-asr`를 `mergeCuesIntoSegments`로 처리하면 카드 90% 이상에 `wordStarts`가 붙고, 붙은 카드는 모두 길이 = `words.length`, 줄지 않음, `[start-0.5, end+0.5]` 안. `ted-manual`은 0장 [자동]
4. [ ] 화면 검사 `expect.karaoke`(세로·가로): 3단계 카드에 시각을 넣고 재생 위치를 낱말 2개에 차례로 두면 `.is-karaoke`가 1개씩, 그 낱말 글자와 같음, 다른 문장으로 가면 0개. 카드 높이가 강조 전후 같음. `karaoke-<뷰>.png` 열어 봄 [자동]
5. [ ] 회귀 `verify.mjs --set regression` [자동]
6. [ ] 실기기: BRAT 업데이트 뒤 **새 영상**(자동 자막)을 열고 한 문장을 3단계로 펼친 채 재생하면 낱말이 소리에 맞춰 차례로 칠해지는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
- 1~3: `npm test` Test 29(`tests/fixtures/karaoke/cases.json`), 변이 `EAR_COACH_KARAOKE_MODULE`로 망가뜨린 사본.
- 4: `ui` 항목(`tests/ui/runUiCheck.mjs`), 스크린샷 열어 관찰 기록.
- 5: `node .claude/harness/verify.mjs --set regression --json`.

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT에서 Ear-Coach 업데이트.
2. 자동 자막 영상 하나를 새로 연다(옛 영상엔 시각이 없음).
3. 아무 문장의 3단계(정답)를 누르고 ▶ 재생 → 낱말이 소리에 맞춰 칠해지는지 본다.

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 시각 붙이기를 합친 뒤 한 번(`attachWordStarts`)으로 · 문장 나누기 두 경로(구두점 있음/없음)를 건드리지 않고 같이 덮음 · 대안: `mergeTimedWords` 안에서만 붙이기(구두점 있는 ASR은 빠짐).
- 모두 찾았을 때만 붙임 · 틀린 낱말을 칠하는 것보다 안 칠하는 게 낫다 · 대안: 못 찾은 낱말은 앞뒤로 보간.
- 3단계에서만, 설정 칸 없이 항상 켬 · 다른 단계는 글자가 가려져 있음, 칸을 늘리지 않음 · 대안: 설정 토글.
- 강조 모양 = 배경색만 · 굵게 하면 폭이 바뀌어 줄이 흔들림 · 대안: 밑줄·글자색.

## 실행 기록
