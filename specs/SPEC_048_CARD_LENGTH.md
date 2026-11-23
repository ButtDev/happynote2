---
id: SPEC_048
title: 문장 끊기 품질 — 너무 짧은·너무 긴 카드 고치기 + 길이 품질 시험
status: DONE
iterations: 1
max_iterations: 3
depends_on: [SPEC_018]
---

# SPEC 048 — 문장 끊기 품질 — 너무 짧은·너무 긴 카드 고치기 + 길이 품질 시험

## 1. 목표
사람 요청(2026-11-23): 「문장끊기 품질에 대한 테스트도 하자, 어떤건 너무 짧고 어떤건 너무 길어」. 실제 자막 3개(TED 자동·TED 수동·Rick 구두점 자동)에서 카드 길이 품질을 수치로 재는 시험(Test 31)을 만들고, 시험이 잡은 문제를 `transcriptProcessor`에서 고친다. AI 문장 복원(SPEC_022)·자막 받기는 건드리지 않는다.

## 2. 파일
- 새 `src/workers/segmentBalance.ts` — import 없는 순수 함수: `DANGLING_TAIL_WORDS`, `isDanglingTail`, `rebalanceTimedChunks`(자동 자막), `mergeShortSentences`(구두점 자막)
- `src/workers/transcriptProcessor.ts` — 자동 자막: 끊은 뒤 `rebalanceTimedChunks`. 구두점 자막: 쉼표·세미콜론·콜론·`--`에서 조각을 나누고(`splitFragmentAtClauses`), 긴 문장을 절 경계에서 자르고, 끝에 `mergeShortSentences`
- 새 `tests/fixtures/segment-length/cases.json`, `tests/runTests.ts` Test 31(변이 `EAR_COACH_SEGMENT_MODULE`)
- 바뀐 기대값: Test 2-B(「It was great.」가 다음 문장과 합쳐짐), Test 14(수동 자막 카드 273→283, 카드 끝 구두점에 `, ; : --` 포함, Rick 문장 목록)

## 3. 정의
- 카드 낱말 수 = 글자·숫자가 든 토큰 수. 짧은 카드 ≤3낱말, 긴 카드 >20낱말.
- 말이 걸린 카드 = 마지막 낱말이 구두점 없는 기능어(a·the·to·of·in·and·because·my·it's…)로 끝남.
- 자동 자막(`ASR_*`): 걸린 낱말은 다음 카드 앞으로, 3낱말 이하 덩어리는 가까운 이웃에 붙임(넘치면 가장 긴 쉼에서 다시 자름, 양쪽 ≥4). 두 낱말 시작 차가 `ASR_JOIN_MAX_START_GAP_SEC` 1.75초 이상이면 절대 합치지 않음(카드 안에 긴 침묵 금지 — Test 14 불변식).
- 구두점 자막: `PUNCT_MAX_WORDS` 28(전 55), 최대 16초(전 28), 절 경계 자르기 `PUNCT_CLAUSE_MIN_WORDS` 16·`PUNCT_SOFT_MAX_WORDS` 20, 짧은 문장 합치기 `SHORT_SENTENCE_WORDS` 3·합친 길이 ≤`SHORT_MERGE_MAX_WORDS` 16·쉼 <`SHORT_MERGE_MAX_GAP_SEC` 0.6초, 더 짧은 이웃 우선. `(Audience)` 같은 화자 표시 줄은 합치지 않음. 글자 없는 카드(따옴표만)는 앞 카드에 붙임.

## 4. 범위 밖
AI 문장 복원, 이미 저장된 영상의 카드 다시 자르기(호환 작업 안 함 — 새 영상부터), 화면.

## 5. 완료 조건
1. [x] 실제 자막 3개 길이 품질 시험: 최대 낱말(자동 18·수동 28), 짧은 카드 비율, 긴 카드 비율, 말이 걸린 카드 비율, 글자 없는 카드 0 [자동]
2. [x] 합성 사례 6개(걸린 낱말 옮기기·침묵이면 그대로·한 낱말 붙이기·인사말 짝·화자 표시 따로·따옴표만 카드·긴 문장 쉼표 자르기) 글자 그대로 [자동]
3. [x] 옛 코드로 Test 31이 실패(변이) [자동]
4. [x] 회귀 통과(낱말 순서 보존·카드 안 긴 침묵 없음 등 Test 14 불변식 유지) [자동]
5. [x] Android에서 **새 영상**을 열고 카드 몇 개를 넘겨 보며 너무 짧은·너무 긴 카드가 줄었는지 보고 버튼 [수동]

## 6. 자동 검증
1·2 Test 31, 3 `EAR_COACH_SEGMENT_MODULE=<옛 transcriptProcessor> npm test`, 4 `verify.mjs --set regression`.

## 8. 가결정
- 짧은 기준 3낱말 · 사람이 말한 「너무 짧다」를 인사말·되묻기(「Isn't it?」) 수준으로 봄 · 대안 2낱말(덜 합침)
- 수동 자막 상한 28낱말·20낱말 넘으면 쉼표에서 자르기 · 한 화면 카드에 두 줄 안팎 · 대안 상한 25
- 자동 자막은 1.75초 넘는 침묵을 넘어 합치지 않음 · 반복 듣기에 빈 소리가 끼지 않게(SPEC_018 규칙 유지) · 대안 침묵 무시(짧은 카드가 더 줄지만 루프에 공백)
- 쉼표 자르기 시각은 글자 수 비례 보간 · 수동 자막엔 낱말 시각이 없음 · 대안 자르지 않기

## 실행 기록
- 2026-11-23 실행 1: Test 31 PASS — ted-asr 카드 312→305, 짧은 0.077→0.056, 말 걸림 0.125→0.052 / ted-manual 273→283, 최대 52→26낱말, 짧은 0.136→0.028, 긴 0.15→0.035, 따옴표만 카드 1→0 / rick 짧은 0.093→0.025. 변이(옛 코드): `ted-asr.srv3.xml: 짧은 카드(<=3낱말) 0.077 > 0.06`으로 실패. `verify.mjs --set regression` ok(harness·build·test·ui).
- 실제 예: 「Good morning.」「How are you?」 → 「Good morning. How are you?」 / 33낱말 「One is the extraordinary … range of it.」 → 16 + 17낱말 / 자동 자막 「…is he still」「Wrong」 → 「…is he still wrong」.
- 2026-11-23 사람 확인: 5 OK (`[Button pressed: SPEC_048 5 OK]`, log/confirmations.jsonl) → DONE.
