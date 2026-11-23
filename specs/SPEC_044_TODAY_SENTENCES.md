---
id: SPEC_044
title: 오늘의 문장 워밍업 — 차례인 핀·지난날 틀린 빈칸 문장 최대 5개 + 빈칸 결과 기록
status: READY
iterations: 0
max_iterations: 3
depends_on: [SPEC_027, SPEC_040]
---

# SPEC 044 — 오늘의 문장 워밍업

> 2026-11-23 사람: 백로그 「오늘의 5문장」 → 재료 없을 때 「5문장 없으면 안 보이기」, 「5문장 지금 진행」(`log/confirmations.jsonl`). 낮에 main에서, 회귀 통과 뒤 BRAT 배포·⏳.

## 1. 목표
영상을 열면 **그 영상에서** 오늘 다시 볼 문장(간격이 된 핀 문장 + 오늘 전에 틀린 빈칸이 있는 문장)을 최대 5개 골라, 툴바 위 한 줄 「☀️ 오늘의 문장 N개 · 시작 · ✕」로 알린다. 「시작」은 기존 「⏰」 목록을 이 문장들로 열고 첫 문장을 블라인드로 재생한다. 재료가 0개면 줄도 ⏰도 안 보이고, 1~4개면 있는 만큼만. 이를 위해 빈칸 받아쓰기 결과(틀림·맞힘)를 학습 기록(`learningStore.recordBlank`)에 남긴다. 다른 영상의 문장을 모으는 전역 워밍업은 하지 않는다.

## 2. 파일
- 새 `src/utils/todaySentences.ts`(순수) + Test 30 + `tests/fixtures/today/cases.json`, 변이용 `EAR_COACH_TODAY_MODULE`.
- 새 `src/ui/warmupBanner.ts`(줄 그리기).
- `src/ui/components/MicroDictationBox.ts`: 빈칸 결과 콜백.
- `src/ui/components/SegmentCard.ts`: 콜백 전달.
- `src/ui/EarCoachView.ts`: 틀린 빈칸 문장 불러오기, ⏰ 목록 = 오늘의 문장, 줄 표시, 기록 연결.
- `styles.css`: `.ear-coach-warmup`.
- `tests/ui/entry.ts`(가짜 `learning.recordBlank`·`wrongBlanks`), `tests/ui/runUiCheck.mjs`·`tests/ui/cases.json` `expect.todaySentences`·`expect.blankRecord`.

## 3. 정의
- `TODAY_SENTENCES_MAX = 5`.
- `wrongBlankSegmentIndices(segments, blanks, videoId, nowMs, tzOffsetMin): number[]` — `blanks`(= `learning.wrongBlanks()`, 최근 결과가 틀림인 것, 새것부터) 중 이 영상 + 오늘(달력 날짜, 지역 시간) 전에 기록된 것만, 시작 시각 차이 0.5초(`SAME_PIN_SEC`) 미만인 문장 번호, 중복 없이 blanks 순서.
- `pickTodaySentences(dueIdx, wrongIdx, max = 5): number[]` — 차례인 핀(원래 순서) 먼저, 그 뒤 틀린 빈칸 문장, 중복 빼고 max개.
- 빈칸 기록: 빈칸이 맞음으로 바뀔 때 `recordBlank(videoId, seg.start, 정답 낱말, true)`, 입력칸을 떠날 때(`change`) 비어 있지 않고 틀리면 `false`. 같은 칸에서 같은 결과를 연달아 두 번 쓰지 않는다.
- 줄 `.ear-coach-warmup`: 글자 `☀️ 오늘의 문장 N개`, 버튼 `시작`, `✕`(aria-label `오늘은 닫기`). 전체(ALL) 목록일 때만 보이고, ✕를 누르면 이 화면에서 다시 안 보임.
- ⏰ 필터(`data-filter="DUE"`) 목록·숫자 = 오늘의 문장. 누르면 그 문장들 블라인드(0단계)부터. 복습 기록(SPEC_027 `reviews`)은 지금처럼 차례인 핀에만.

## 4. 범위 밖
여러 영상을 모은 전역 워밍업, 1분 타이머, 알림·푸시, 빈칸 통계 화면, 옛 핀(learning.json에 없는 것) 옮기기.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] Test 30 `wrongBlankSegmentIndices` 사례(오늘 것 빠짐·다른 영상 빠짐·0.5초 안 맞춤·못 찾음·중복)와 `pickTodaySentences` 사례(핀 먼저·중복·5개 상한·0개 → 빈 배열) 기대값과 같음 + 변이 실패 [자동]
2. [ ] 화면 검사 `expect.todaySentences`(세로·가로): 차례 핀 1 + 어제 틀린 빈칸 문장 1(+ 오늘 틀림·다른 영상·핀과 겹침 각 1) → 줄 「☀️ 오늘의 문장 2개」, ⏰ 「⏰ 2」, 「시작」 → ⏰ 활성·목록 = 기대 문장 2개·첫 카드 블라인드·줄 사라짐, 재료 0개로 바꾸면 줄·⏰ 둘 다 없음, ✕ 누르면 줄 없음. 툴바 넘침 없음. `today-<뷰>.png` 열어 봄 [자동]
3. [ ] 화면 검사 `expect.blankRecord`: 빈칸에 틀린 말 입력 후 떠남 → `recordBlank(…, false)` 1번, 정답 입력 → `true` 1번(낱말 = 정답 낱말, start = 문장 시작). 변이(콜백 안 부름) 실패 [자동]
4. [ ] 회귀 `verify.mjs --set regression`(기존 `reviewQueue` 검사 포함) [자동]
5. [ ] 실기기: BRAT 업데이트 뒤 영상 하나에서 빈칸에 일부러 틀린 말을 넣고 칸을 떠난 뒤, **내일** 그 영상을 다시 열어 맨 위 「☀️ 오늘의 문장」 줄 → 「시작」을 눌러 그 문장이 블라인드로 나오는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법
- 1: `npm test` Test 30(`tests/fixtures/today/cases.json`), 변이 `EAR_COACH_TODAY_MODULE`로 망가뜨린 사본.
- 2·3: `ui` 항목(`tests/ui/runUiCheck.mjs`), 스크린샷 열어 관찰 기록. 3 변이는 MicroDictationBox 콜백을 빈 함수로 바꾼 사본으로 한 번.
- 4: `node .claude/harness/verify.mjs --set regression --json`.

## 7. 수동 검증
1. BRAT으로 업데이트.
2. 아무 영상이나 열고 카드 하나를 1단계(빈칸)로 열어 빈칸에 틀린 말을 넣고 다른 곳을 누른다.
3. 다음 날 같은 영상을 연다 → 툴바 위 「☀️ 오늘의 문장 1개」 → 「시작」 → 그 문장이 블라인드로 나오면 OK.

## 8. 가결정
- 범위 = 지금 연 영상만 · 이유: 다른 영상 문장은 영상을 바꿔 열어야 해 화면·흐름이 커짐, SPEC_027도 지금 영상만 · 대안: 전역 워밍업 화면(새 SPEC).
- 「어제 틀린」 = 오늘 전에 틀리고 아직 맞히지 않은 빈칸(날짜 상한 없음) · 이유: 어제 안 열었으면 그제 틀린 것도 남아야 함, 맞히면 최근 결과가 맞힘이라 빠짐 · 대안: 어제 하루만.
- 틀림 = 칸을 떠날 때 틀린 글자가 남아 있음 · 이유: 입력 중엔 글자마다 틀림이라 기록하면 넘침, 정답 단계만 열어 본 것은 시도 안 한 것 · 대안: 힌트·정답 단계를 열면 틀림.
- 알림 줄 = 툴바 맨 위 한 줄(목록 안이 아님) · 이유: 가상 목록 위치 계산을 안 건드림 · 대안: 목록 첫 카드 자리.
- 5개 고르는 순서 = 핀 먼저 · 이유: 사람이 직접 「안 들림」으로 고른 문장이 더 중요 · 대안: 틀린 빈칸 먼저.

## 실행 기록
