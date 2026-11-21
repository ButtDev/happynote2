---
id: SPEC_018
title: 자동 자막(ASR) 카드 끊기 — 단어 시각·쉼으로 짧은 덩어리
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 018 — 자동 자막(ASR) 카드 끊기 — 단어 시각·쉼으로 짧은 덩어리

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
OVERVIEW 7.3 「자막 품질」 첫 조각. 2026-11-21 실제 자막으로 재현함: TED `iG9CE55wbtY` 자동 자막(구두점 없음, 마침표 2개뿐)이 지금 코드에서 **70개 카드, 대부분 49~55단어**로 묶이고 문장 중간에서 끊긴다(`…one is the extraordinary evidence of human` / `creativity in all of…`). 같은 영상의 수동 CC는 273개 문장 카드로 잘 나온다. 원인 둘: (1) 구두점 판정이 「문장 끝 조각 2개 이상」이면 참이라 자동 자막도 구두점 모드(한도 55단어·28초)로 감, (2) srv3/json3 자동 자막엔 단어별 시작 시각(`<s t>`·`tOffsetMs`)이 있는데 파서가 버려서 말의 쉼으로 끊지 못함. 이번에 판정을 비율로 고치고, 단어 시각을 살려 구두점 없는 자동 자막을 쉼 기준 짧은 카드로 끊는다. 수동 CC·구두점 있는 자동 자막의 결과는 바꾸지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/types/transcript.ts` — `RawTranscriptCue.words?: RawCueWord[]`(선택).
- `src/services/TranscriptService.ts` — srv3 `<p t><s t>…</s></p>`와 json3 `segs[].tOffsetMs`에서 단어 시각을 `words`로 채움(글자 `text`는 이전과 같음).
- `src/workers/transcriptProcessor.ts` — 구두점 판정 비율만, 구두점 없음 + 단어 시각 있음이면 `mergeTimedWords`로 끊기.
- `tests/fixtures/transcript/`(새) — 실제 srv3 응답 잘라 둔 것 3개 + `cases.json`(사례·불변식).
- `tests/runTests.ts` — Test 14(데이터 기반), 변이용 `EAR_COACH_TRANSCRIPT_MODULE`·`EAR_COACH_TRANSCRIPT_SERVICE_MODULE`.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `interface RawCueWord { start: number; text: string }` — `start`는 초(절대 시각).
- `parseTrackPayload`: srv3 `<p t="T">` 안에 `<s>`가 있으면 단어 `start = (T + (s.t ?? 0))/1000`, 글자는 엔티티 풀고 앞뒤 공백 뺌. json3 `ev.segs[i]`는 `start = (ev.tStartMs + (seg.tOffsetMs ?? 0))/1000`. 단어가 2개 이상일 때만 `words`를 넣는다.
- 구두점 판정 `hasSentencePunctuation = 조각 수 > 0 && 문장 끝 조각 / 조각 수 ≥ 0.1` (「2개 이상」 조건 삭제).
- 시각 단어 모드: `!hasSentencePunctuation` 이고 대괄호 아닌 자막 조각의 80% 이상에 `words`가 있을 때. 이때 `mergeTimedWords(cues, options)`가 카드를 만든다:
  - 단어 목록: 시각순, 롤링 겹침은 이미 정리된 `text`와 같은 단어 수만큼 뒤쪽 `words`를 씀. `[Music]` 같은 대괄호 단어 버림.
  - 단어 끝 = `min(다음 단어 start, start + 0.6)`(마지막은 그 자막 끝까지, 최대 0.6초). 쉼 = 다음 단어 start − 이 단어 끝.
  - 끊기: 쉼 ≥ `ASR_PAUSE_SEC = 0.25`(시작~시작 0.85초 이상)이고 덩어리 ≥ `ASR_MIN_WORDS = 4`이면 끊음. 쉼 ≥ 1.2초는 단어 수와 관계없이 끊음. 덩어리가 `ASR_MAX_WORDS = 18`에 닿으면 그 안 6번째 단어 뒤부터 가장 긴 쉼 자리에서 끊고 나머지는 다음 덩어리로.
  - 카드 `start` = 첫 단어 start, `end` = 마지막 단어 끝 + 0.15(다음 카드 start − 0.02를 넘지 않음). 나머지 필드(`words`·`wpm`·`analysis`·`id`)는 기존 `flushBuffer`와 같은 규칙.
- 다른 경로(구두점 있음, 단어 시각 없음)는 이전 코드 그대로.

## 4. 범위 밖
- 트랙 선택 순서 변경, 번역 자막·다른 언어, 「um/uh」 지우기, 대문자·구두점 복원(AI 번역 SPEC에서), 화면 변경, 저장된 노트의 기존 카드 다시 만들기.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] TED 자동 자막 픽스처: 카드 단어 수 최대 ≤ 18, 4단어 이상 카드 비율 ≥ 90%, 카드 수가 이전(같은 구간) 대비 3배 이상. [자동]
2. [ ] 같은 픽스처: 모든 카드 글자를 이으면 원본 단어 순서와 같음(빠짐·중복 0), 카드 `start` = 첫 단어 시각(±0.01). [자동]
3. [ ] 같은 픽스처: 카드 안 단어 사이 쉼 ≥ 1.2초 0개. [자동]
4. [ ] TED 수동 CC 픽스처: 카드 90% 이상이 `.?!`로 끝나고 카드 수가 이전 코드 결과와 같음(구두점 모드 그대로). [자동]
5. [ ] Rick 자동 자막(구두점 있음) 픽스처: 카드 수·글자가 이전 코드 결과와 같음. [자동]
6. [ ] 파서: srv3·json3 사례에서 `words` 시각이 기대값과 같고, `<s>` 없는 수동 자막엔 `words`가 없음. [자동]
7. [ ] 변이: 쉼 끊기를 끈 사본으로 Test 14가 실패함. [자동]
8. [ ] 회귀(빌드·시험·화면 검사) 통과. [자동]
9. [ ] Android 실기기에서 **자동 자막만 있는 영상**(평소 보는 브이로그 등, 새로 연 영상)을 열고 카드 끊김을 본다 — 한 카드가 한 숨에 듣기 좋은 길이로 끊겼으면 OK. [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
- 1~6: `npm test` Test 14 (`tests/fixtures/transcript/cases.json` 불변식). 4·5의 「이전 결과」는 바꾸기 전 코드로 만든 수치를 `cases.json`에 적어 둔다.
- 7: `EAR_COACH_TRANSCRIPT_MODULE=<망가뜨린 사본> npm test` 실패 출력.
- 8: `node .claude/harness/verify.mjs --set regression`.

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT로 새 버전 받기 → 자동 자막만 있는 영상 URL을 새로 열기(이미 만든 노트는 옛 카드 그대로).
2. 카드 몇 개를 재생해 듣고 버튼.

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 최대 18단어·최소 4단어·쉼 0.25초(시작~시작 0.85초): 유튜브 CC 한 화면(2줄)이 대략 8~16단어이고 받아쓰기 카드는 한 숨 길이가 좋아서. 대안: 26단어(기존 ASR 한도) — 실제로 문장 중간 끊김이 커서 안 씀. 수치는 상수라 쉽게 바꿈.
- 단어 끝을 시작+0.6초로 추정: srv3는 단어 시작만 주기 때문. 대안: 글자 수 비례 추정 — 차이가 작아 단순한 쪽.

- (실행 중 추가) 파서를 `src/services/captionPayload.ts`(`parseCaptionPayload`, obsidian import 없음)로 옮김 — `TranscriptService`는 `obsidian`을 import해 node 시험에서 못 불러서. `parseTrackPayload`는 그대로 남아 위임. 대안: 시험용 복사본 — 실제 코드를 안 시험하게 됨.
- (실행 중 추가) 단어 시각이 있고 시간상 겹치지 않는 자막끼리는 롤링 중복 제거를 건너뜀 — TED 자동 자막에서 실제 반복된 말(「do you do you」 등 3곳)이 지워지고 있었음(조건 2 시험이 잡음). 겹치는 롤링 자막·시각 없는 자막은 이전 그대로.

## 실행 기록
- 2026-11-21 회차 1: IMPLEMENTED — 1 ✅ Test 14 `ted-asr.srv3.xml 70->311 cards, max 18w`(4단어+ 비율 ≥0.9 단언 통과) · 2 ✅ 같은 Test 14 단어 순서·첫 단어 시각 단언 통과 · 3 ✅ 카드 안 쉼 단언 통과 · 4 ✅ `ted-manual.srv3.xml 273 sentences`(이전 273) · 5 ✅ `rick-asr.srv3.xml unchanged (43)` 글자 비교 · 6 ✅ parser 3사례 통과 · 7 ✅ 변이: 쉼 상수 999 → `seg 0 has 1.88s pause inside` 실패, words 안 넣음 → `parseCaptionPayload: srv3 ASR <s> word times` 실패 · 8 ✅ `verify.mjs --set regression` ok(harness·build·test·ui, ui overlap 0) · 9 ⏳ 실기기
