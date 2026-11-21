---
id: SPEC_022
title: 자동 자막 고유명사 대문자·구두점 복원 — 모바일 AI 묶음 요청에 칸 추가
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: [SPEC_020, SPEC_021]
---

# SPEC 022 — 자동 자막 고유명사 대문자·구두점 복원 — 모바일 AI 묶음 요청에 칸 추가

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
사람 선택 「고유명사·구두점 복원 진행」(2026-11-21). 구두점 없는 자동 자막(SPEC_018 시각 단어 모드) 카드는 SPEC_020 뒤에도 `I went to new york with sarah last year it was great`처럼 고유명사가 소문자이고 마침표가 없다. 이번에는 SPEC_021 모바일 AI 묶음 요청(20장씩)에 칸 `restoredText`(같은 낱말·같은 순서, 대소문자·구두점만 고친 문장)를 더 받아, **구두점이 하나도 없는 카드에만**, 낱말이 원래와 같을 때(대소문자·앞뒤 구두점 무시 비교)만 카드 글자(`text`·`words`)를 바꾼다. 다르면 버리고 원래 글자를 둔다. 요청 수는 늘지 않는다. 데스크톱 `agy` 경로, 이미 해석이 있는 카드, 구두점이 있는 자막은 바꾸지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/services/aiAnalysis.ts` — 프롬프트 8번째 칸 `restoredText`, Gemini `responseSchema`에 `restoredText`(필수 아님), 순수 함수 `needsTextRestore(seg)`·`acceptRestoredText(words, restored)`, `AiItem.restoredText?`, `runAiAnalysis`가 받아들인 문장으로 `seg.text`·`seg.words`를 바꿈.
- `tests/fixtures/ai/cases.json` — `restore` 사례(받아들임·거절), 응답 사례(`restoredText` 있음/구두점 있는 카드는 무시), 묶음 실행 사례 1개.
- `tests/runTests.ts` — Test 15가 `restore` 사례와 묶음 실행의 글자 바뀜을 읽어 확인.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `needsTextRestore(seg: Pick<TranscriptSegment,"text"|"words">): boolean` — `text`에 `. , ! ? ; :` 가 하나도 없고 `words.length >= 2`이면 true.
- `acceptRestoredText(words: string[], restored: unknown): string | null` — `restored`가 문자열이고, 공백으로 나눈 낱말 수가 `words`와 같고, 낱말마다 `소문자 + 앞뒤의 글자·숫자·' 아닌 문자 제거` 결과가 같으면 앞뒤 공백을 다듬은 문장, 아니면 `null`. 빈 낱말(문장부호만 있는 토큰)이 생기면 `null`.
- 프롬프트 8번 줄: `8. restoredText: the SAME words in the SAME order, only fixing capitalization (proper nouns, sentence starts, "I") and adding punctuation (. , ? !). Never add, remove, merge, split or respell words. Use "" if the segment already has punctuation.`
- 적용: `needsTextRestore(seg)`가 true이고 `acceptRestoredText`가 문자열을 돌려주면 `seg.text = 그 문장`, `seg.words = 그 문장.split(/\s+/)`. 낱말 수가 같으므로 `skeletonWordIndices`·`dictationBlankIndices`·`userDictationAttempts` 번호는 그대로 맞는다.

## 4. 범위 밖
- 이미 해석이 채워진 카드 다시 보내기(복원만을 위한 추가 요청), 데스크톱 `agy` 경로, 구두점 있는 자막 다듬기, 낱말 철자·축약형 고치기(`dont`→`don't`), 카드 다시 나누기·합치기, 화면·설정 변경, 자막 트랙 고르기.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] `restore` 사례 6개 이상 통과: 고유명사·마침표 받아들임, 물음표·쉼표 받아들임, 낱말 바뀜 거절, 낱말 빠짐/더함 거절, 축약형 바뀜(`dont`→`don't`) 거절, 문자열 아님·빈 문자열 거절 (`npm test` Test 15) [자동]
2. [x] `needsTextRestore`: 구두점 없는 카드 true, `.`/`?`/`,` 있는 카드 false, 낱말 1개 false (Test 15) [자동]
3. [x] 응답 사례: `restoredText`가 맞는 구두점 없는 카드는 `AiItem.restoredText`가 그 문장, 구두점 있는 카드·낱말 다른 문장은 `restoredText` 없음 (Test 15) [자동]
4. [x] 묶음 실행: 구두점 없는 카드는 `text`·`words`가 복원 문장으로 바뀌고 낱말 수 그대로, 구두점 있는 카드는 글자 그대로, 요청 수는 이전과 같음 (Test 15) [자동]
5. [x] gemini 요청 본문 `responseSchema`에 `restoredText` 속성이 있고 `required`에는 없음, 프롬프트에 `restoredText` 줄 있음 (Test 15 requests 사례) [자동]
6. [x] 변이: 낱말 비교를 끈 사본, `needsTextRestore`가 늘 true인 사본으로 각각 Test 15 실패 [자동]
7. [x] `verify.mjs --set regression` ok, `main.ts` 900줄 한도 시험 통과 [자동]
8. [ ] Android 실기기: BRAT 새 버전에서 **새로** 만든 구두점 없는 자동 자막 영상 노트를 열어 AI 해석이 채워진 뒤, 카드 영어 문장에 고유명사 대문자·마침표가 붙었는지와 학습에 쓸 만한지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
- 1~5: `npm test` Test 15 (`tests/fixtures/ai/cases.json` `restore`·`responses`·`runs`·`requests`, 합성 응답 — 저장소에 키가 없어 실제 AI 응답은 못 받음).
- 6: `EAR_COACH_AI_MODULE=<망가뜨린 사본> npm test` 실패 출력.
- 7: `node .claude/harness/verify.mjs --set regression`.

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT로 새 버전 → Obsidian 다시 시작(설정의 AI 키는 그대로).
2. 구두점 없는 자동 자막 영상(예: 자동 자막만 있는 TED·브이로그)으로 새 노트 만들기 → 「🤖 AI 번역·분석 완료」 알림까지 기다림.
3. 카드 영어 문장을 몇 장 보고 버튼.

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 대상 판정은 카드 글자에 구두점이 하나도 없는지로(`needsTextRestore`): 세그먼트에 「자동 자막」 표시가 없고, 기존 노트에도 쓸 수 있어서. 대안: 세션에 자막 종류 표시 추가 — 저장 형식이 바뀌고 기존 노트엔 없음.
- 낱말이 하나라도 다르면 문장 전체를 버림: 낱말 번호로 찾는 받아쓰기 빈칸·강세 단어·받아쓰기 기록이 어긋나지 않게. 대안: 맞는 낱말만 골라 고치기 — 정렬이 복잡하고 틀릴 위험.
- `restoredText`는 Gemini 스키마에서 필수 아님: 빠진 응답 때문에 해석 전체가 실패하지 않게.
- 원래 소문자 글자는 따로 보관하지 않음: 낱말이 같다는 것만 받아들이므로 소리·시각 정보는 그대로이고, 다시 만들기(Re-segment)로 언제든 원래 자막을 얻음.

## 실행 기록
- 2026-11-21 회차 1: IMPLEMENTED — 1 ✅ `npm test` Test 15 `10 restore` 사례(고유명사·마침표, 물음표·쉼표, 앞뒤 공백 다듬기 받아들임 / 낱말 바뀜·빠짐·더함·dont→don't·단독 —·null·빈 문자열 거절) · 2 ✅ 같은 Test 15 `5 needsRestore`(구두점 없음 true, `.`·`?`·`,` false, 1낱말 false) · 3 ✅ 응답 사례 「restoredText: kept only…」(구두점 없는 카드만 restoredText, 구두점 카드·walked 문장은 없음) · 4 ✅ 묶음 실행 「restore: …」(요청 1번 3장, 0번 카드 → `We flew to Tokyo with Ken.`·낱말 수 6 그대로, 구두점 카드 `It was fun.` 그대로, 낱말 다른 2번 원문 그대로) · 5 ✅ requests gemini: `responseSchema…properties.restoredText.type = STRING`, `required`에 없음, `promptMustContain` 3줄 · 6 ✅ 변이: 낱말 비교 지운 사본 → `acceptRestoredText word changed -> reject` 실패, needsTextRestore 늘 true 사본 → `needsTextRestore "I went to New York."` 실패 · 7 ✅ `verify.mjs --set regression --json` harness·build·test·ui 모두 ok, main.ts 891줄(변경 없음) · 8 ⏳ 실기기(실제 AI 복원 문장은 키가 없어 못 봄 — 위 결과는 합성 응답)
