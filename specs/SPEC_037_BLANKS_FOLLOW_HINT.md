---
id: SPEC_037
title: 빈칸 받아쓰기 낱말을 소리 힌트 덩어리와 항상 맞추기
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: [SPEC_032]
---

# SPEC 037 — 빈칸 = 힌트 덩어리

> 2026-11-22 사람(사진 2장): 「빈칸이랑 힌트가 아직 안맞네」 — 문장 "I haven't sprinted in a long time and and all of a sudden became incredibly nervous…"에서 빈칸은 haven't sprinted in a long(5칸), 힌트는 all of a sudden [얼 러 버 써런].

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
빈칸 받아쓰기가 고르는 낱말을 **화면에 그릴 때** 소리 힌트 덩어리(`pickHintChunk`)에 맞춘다. 원인: SPEC_032는 AI 응답 정리(`sanitizeItems`)에서만 빈칸을 `chunkWordIndices`에 맞췄는데, AI가 `chunkWordIndices`를 빼먹으면 빈칸은 그대로 두고, 힌트는 설명 글 속 영어 구(`explanationChunk`)로 다른 곳을 잡는다. 그릴 때 같은 덩어리 함수로 맞추면 저장 데이터(이미 분석한 영상 포함)를 고치지 않고 둘이 항상 일치한다. 빈칸 수는 최대 4.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/services/soundHint.ts`: `dictationBlanksFor(seg)` 추가(순수).
- `src/ui/components/MicroDictationBox.ts`: `analysis.dictationBlankIndices ?? [0]` 대신 `dictationBlanksFor(segment)`.
- `tests/fixtures/sound-hint/rules.json`: `blanks` 사례(사진 문장 포함).
- `tests/runTests.ts`: Test 20에 `blanks` 사례 돌리기.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
`dictationBlanksFor(seg: HintSegmentLike): number[]`
1. `chunk = pickHintChunk(seg)` (낱말 번호, 연속).
2. `blanks` = `analysis.dictationBlankIndices` 중 문장 범위 안 번호, 없으면 `[0]`.
3. `inside` = `blanks` 중 `chunk` 범위 안 번호. 있으면 `inside` 앞 4개.
4. 없으면 `chunk` 앞 4개.
5. 오름차순, 중복 없음.

## 4. 범위 밖
- AI 프롬프트·`sanitizeItems` 변경, 저장 데이터 고치기(옛 데이터 호환 작업 안 함 — 그릴 때 맞추므로 필요 없음).
- 힌트 덩어리 고르는 순서(`pickHintChunk`) 변경.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] Test 20 `blanks`: 사진 문장(chunk 없음, 설명 "all of a sudden…", AI 빈칸 1~5) → all of a sudden 4칸, chunk 안 빈칸은 유지, 5개 이상은 4개, 빈칸 없음+짧은 문장 → [0], chunk 있음+빈칸 밖 → chunk 앞 4개 + 변이(정렬 안 함 사본 → 사진 문장 실패) [자동]
2. [x] `MicroDictationBox.ts`가 `dictationBlanksFor`를 쓰고 `dictationBlankIndices ?? [0]`이 남지 않음(grep) [자동]
3. [x] 회귀 `verify.mjs --set regression` [자동]
4. [ ] 실기기: BRAT 업데이트 뒤 사진의 「1등이 전부가 아니라더니」 영상 00:35 카드에서 「빈칸」 칸과 「힌트」의 덩어리(all of a sudden)가 같은 낱말인지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1 → `npm test` Test 20 + 변이 `EAR_COACH_SOUNDHINT_MODULE`. 2 → grep. 3 → `verify.mjs --set regression`.

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 업데이트. 2. 그 영상 00:35 카드 빈칸·힌트 단계 보고 버튼.

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 화면 검사 첫 빈칸 낱말을 실제 그린 입력칸(aria-label)에서 읽음 · 이유: 빈칸을 그릴 때 정하므로 저장 값과 다를 수 있음 · 대안: 검사도 dictationBlanksFor 호출(번들 의존).
- 그릴 때 맞춤 · 이유: 이미 분석한 영상도 바로 맞고, 힌트와 같은 함수라 어긋날 수 없음 · 대안: `sanitizeItems`에서 `explanationChunk`로 맞춤(새 분석만 고쳐짐).
- 빈칸 최대 4 · 이유: 힌트 덩어리가 보통 2~4낱말(all of a sudden)이라 통째로 비우는 게 힌트와 같음 · 대안: 3(프롬프트 「2-3」, sudden이 남음).

## 실행 기록
- 2026-11-22 회차 1: IMPLEMENTED — 1 ✅ Test 20 「35 hangul + 5 ipa + 10 chunk + 5 blanks + 5 coverage」 PASS(사진 문장 → [9,10,11,12] = all of a sudden), 변이(.scratch/mut 정렬 안 함 `return blanks`) → 「dictationBlanksFor 사진 문장(11-22)…」 AssertionError · 2 ✅ `src/ui/components/MicroDictationBox.ts:27` `new Set(dictationBlanksFor(this.segment))`, `dictationBlankIndices ?? [0]` grep 0건 · 3 ✅ `verify.mjs --set regression --json` harness·build·test·ui ok — 처음 ui 실패 「portrait: typing advance did not move to next blank (at 0, word=So, n=2)」: 화면 검사가 저장된 `dictationBlankIndices`로 첫 빈칸 낱말을 추정해서, 실제 그린 첫 빈칸(aria-label)으로 읽게 고침(`tests/ui/runUiCheck.mjs:1013`, 검사 약화 아님 — 틀린 답 머묾·맞힌 답 이동 판정 그대로) · 4 ⏳ 실기기
