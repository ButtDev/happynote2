---
id: SPEC_020
title: 자동 자막 글자 다듬기 — um/uh 빼기·I 대문자·카드 첫 글자 대문자
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: [SPEC_018]
parent: SPEC_018
---

# SPEC 020 — 자동 자막 글자 다듬기 — um/uh 빼기·I 대문자·카드 첫 글자 대문자

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
사람 선택 「자막 품질 진행」(2026-11-21). 자막 품질 나머지 중 첫 조각이다. SPEC_018의 시각 단어 모드(구두점 없는 자동 자막)로 만든 카드는 전부 소문자이고 군말이 그대로 남는다. 실제 TED 자동 자막 픽스처에는 단독 `um/uh` 등 군말 38개, 소문자 `i`/`i'm`/`i've` 59개가 있다(`good morning how are you` / `i'm leaving um there have been`). 이번에는 **시각 단어 모드에서만** 군말 낱말을 빼고, `i` 계열을 `I`로, 카드 첫 글자를 대문자로 바꾼다. 수동 CC·구두점 있는 자동 자막의 결과는 바꾸지 않는다. 고유명사 대문자·구두점 복원(AI 몫)과 트랙 선택은 하지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/workers/transcriptProcessor.ts` — 상수 `ASR_FILLER_WORDS`, 순수 함수 `isFillerWord(word)`·`tidyAsrWords(words)`. `collectTimedWords`가 군말을 버리고, `mergeTimedWords`가 카드 글자를 `tidyAsrWords`로 만든다.
- `tests/fixtures/transcript/cases.json` — `tidy` 사례(입력 낱말 → 기대 글자) 추가, TED 자동 자막 사례에 `fillersBefore: 38`.
- `tests/runTests.ts` — Test 14: `tidy` 사례, 시각 모드 불변식(군말 0개·카드 첫 글자 대문자·소문자 `i` 계열 0개, 단어 순서는 원본에서 군말을 뺀 것과 대소문자 무시로 같음).

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `ASR_FILLER_WORDS = ["um", "umm", "uh", "uhh", "uhm", "er", "erm", "hmm", "mm", "mhm"]`.
- `isFillerWord(word)`: 앞뒤 문장부호(`.,!?;:"'`)를 떼고 소문자로 바꾼 값이 `ASR_FILLER_WORDS`에 있으면 참.
- `tidyAsrWords(words: string[]): string` — 군말이 아닌 낱말만, `i`→`I`, `i'm`·`i've`·`i'll`·`i'd`(앞 `i`만)→`I'm`·`I've`·`I'll`·`I'd`, 첫 낱말의 첫 글자(영문 소문자일 때)를 대문자, 공백 하나로 이음.
- `collectTimedWords`: 군말 낱말은 단어 목록에 넣지 않는다(쉼은 남은 낱말 시각으로 계산되므로 군말 자리에서 끊길 수 있음). 카드 `start`는 첫 남은 낱말 시각.
- 다른 경로(구두점 있음, 단어 시각 없음)는 이전 코드 그대로.

## 4. 범위 밖
- 자막 트랙 고르기(다음 조각), 고유명사·문장 중간 대문자, 구두점 복원(AI 번역 SPEC), 수동 CC·구두점 있는 자막의 군말, 화면 변경, 저장된 노트의 기존 카드 다시 만들기, 설정 추가.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] `cases.json` `tidy` 사례 6개 이상(군말 빼기·`i` 단독·`i'm`류·첫 글자 대문자·이미 대문자·문장부호 붙은 군말 `um,`·`umbrella`/`error` 같은 비슷한 낱말은 그대로) 전부 통과 (`npm test` Test 14) [자동]
2. [x] TED 자동 자막 픽스처: 카드 글자 속 군말 낱말 0개(원본 38개), 소문자 `i`·`i'm`·`i've`·`i'll`·`i'd` 0개, 모든 카드 첫 글자가 대문자 [자동]
3. [x] 같은 픽스처: 카드 낱말을 이으면 원본 낱말에서 군말을 뺀 순서와 같음(대소문자 무시), 카드 `start` = 첫 남은 낱말 시각(±0.01), SPEC_018 불변식(최대 18단어·4단어+ 90%·카드 안 쉼) 그대로 통과 [자동]
4. [x] TED 수동 CC(273문장)·Rick 구두점 자동 자막(글자 그대로) 결과 불변 [자동]
5. [x] 변이: 군말 빼기를 끈 사본, 대문자화를 끈 사본으로 각각 Test 14 실패 [자동]
6. [x] 다듬은 TED 카드 실제 예 3개를 실행 기록에 적는다(관찰) [자동]
7. [x] `verify.mjs --set regression` ok [자동]
8. [ ] Android 실기기에서 자동 자막만 있는 영상을 새로 열어 카드 글자를 본다 — um/uh가 없고 첫 글자·I가 대문자면 OK [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
- 1~4: `npm test` Test 14 (`tests/fixtures/transcript/cases.json`).
- 5: `EAR_COACH_TRANSCRIPT_MODULE=<망가뜨린 사본> npm test` 실패 출력.
- 6: node로 TED 픽스처 카드 출력.
- 7: `node .claude/harness/verify.mjs --set regression`.

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT로 새 버전 받기 → 자동 자막만 있는 영상 URL을 새로 열기(이미 만든 노트는 옛 카드 그대로).
2. 카드 글자를 보고 버튼.

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 군말은 카드 글자에서 뺀다(소리에는 남음): 받아쓰기·Anki 문장에서 학습 내용이 아니고 카드 단어 수만 늘려서. 대안: 남기거나 흐리게 표시 — 화면 변경이 필요해 범위 밖. 목록은 상수라 쉽게 바꿈.
- `ah`·`oh`·`like`·`you know`는 뜻이 있는 경우가 많아 군말 목록에 넣지 않음.
- 시각 단어 모드에만 적용: 수동 CC·구두점 자막은 사람이 다듬은 글자라 그대로 둠.
- (실행 중 추가) srv3 `<s>` 하나에 두 낱말이 든 경우(`a place` 등 실제 5곳+)를 낱말마다 따로 센다 — 군말을 빼자 19낱말 카드가 생겨 SPEC_018 최대 18 불변식이 잡음. 대안: 상한 검사를 글자 대신 `<s>` 수로 — 화면 카드 길이와 어긋나서 안 씀.

## 실행 기록
- 2026-11-21 회차 1: IMPLEMENTED — 1 ✅ `npm test` Test 14 `9 tidy cases` PASS · 2 ✅ 같은 Test 14 `ted-asr.srv3.xml 70->312 cards, max 18w, fillers 38->0`(군말 0·소문자 i 0·소문자 시작 카드 0 단언) · 3 ✅ 같은 Test 14 낱말 순서(군말 뺌·대소문자 무시)·첫 낱말 시각·카드 안 쉼 단언 통과 · 4 ✅ `ted-manual.srv3.xml 273 sentences`·`rick-asr.srv3.xml unchanged (43)` · 5 ✅ 변이: `isFillerWord` false 사본·첫 글자 대문자 끈 사본 → 각각 `AssertionError tidyAsrWords: filler dropped` · 6 ✅ 실제 예(전→후): `it's been i've been … in fact i'm leaving` / `um` → `It's been I've been blown away by the whole thing in fact I'm leaving`(um 카드 사라짐) · `uh which are rather relevant to what i want…` → `Which are rather relevant to what I want to talk about one is the extraordinary` · `good morning how are you` → `Good morning how are you` · 7 ✅ `verify.mjs --set regression --json` ok(harness·build·test·ui) · 8 ⏳ 실기기
