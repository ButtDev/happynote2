---
id: SPEC_011
title: 가로 화면 좌우 비율 조절 바
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: []
parent: SPEC_004
---

# SPEC 011 — 가로 화면 좌우 비율 조절 바

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
사람 원문 「[Button pressed: SPEC_004 8 메모] 비율조절바 가로에서도 살려」. 세로의 위아래 조절 바(`.ear-coach-mobile-resizer`)는 가로에서 `display:none`이다(SPEC_002). 가로에서는 같은 요소를 영상 열과 목록 열 사이 세로 막대로 보여 주고, 좌우로 끌면 영상 열 폭(=목록 폭)이 바뀌며 값을 설정에 저장한다. 세로 동작·기본 배치는 바꾸지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/types/settings.ts` — `mobileLandscapeLeftPercent` 추가.
- `src/utils/landscapeSplit.ts`(새) — 순수 함수 `clampLandscapeLeftPercent`, `landscapeLeftPercentFromPointer`.
- `src/ui/EarCoachView.ts` — `setupMobileTouchResizer`가 가로면 좌우로 처리, 컨테이너에 CSS 변수 `--ear-coach-landscape-left` 설정.
- `styles.css` — 가로에서 조절 바를 열 사이 막대(그리드 영역 `resizer`)로, 왼쪽 열 폭에 변수 반영.
- `tests/fixtures/landscape-split/cases.json` + `tests/runTests.ts` Test 9.
- `tests/ui/runUiCheck.mjs`·`tests/ui/cases.json` — `landscapeResizer` 규칙.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 설정 `mobileLandscapeLeftPercent: number`, 기본 `58`.
- `clampLandscapeLeftPercent(pct)` = 반올림 후 `[30, 70]`로 자름(숫자가 아니면 58).
- `landscapeLeftPercentFromPointer(clientX, containerLeft, containerWidth)` = `clamp((clientX − containerLeft) / max(200, containerWidth) × 100)`.
- 왼쪽 열 폭 = `min(var(--ear-coach-landscape-left) × 1cqw, 영상 맞춤 폭)` — 영상 높이 상한을 넘는 폭은 회색 띠만 생기므로 지금처럼 자른다. 즉 끌어서 영상을 줄이고 목록을 넓히는 쪽이 실제 범위.
- 막대: 가로에서 폭 12px, `cursor: col-resize`, 가운데 알약 4×44(세로). 두 번 누르면 58로.
- UI 규칙 `landscapeResizer: true`: 막대가 보이고 폭 ≥ 10·높이 ≥ 200, 막대를 왼쪽으로 150px 끌면 목록 폭 +100 이상·영상 16:9 유지, 다시 그리면 같은 폭(설정 값으로 복원).

## 4. 범위 밖
- 세로 조절 바 동작, 데스크톱 튜터 리사이저, 영상 높이 상한을 넘겨 영상을 키우는 것.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] Test 9: `landscape-split` 데이터 전부 일치 [자동]
2. [x] ui 가로 `landscapeResizer` ok, 기존 가로·세로 규칙 전부 ok(세로 조절 바 그대로) [자동]
3. [x] 변이: ① 자르기 범위를 바꾼 사본 → Test 9 실패 ② 가로 막대 `display:none` 사본 → `landscapeResizer` 실패 [자동]
4. [x] `landscape.png`에서 영상과 목록 사이 막대가 보이고 기본 배치(목록 폭 ≥ 330, 툴바 넘침 없음) 유지 [자동]
5. [x] `verify.mjs --set regression` → `verify: ok` [자동]
6. [ ] Android 실기기 가로에서 가운데 막대를 좌우로 끌어 비율이 바뀌고, 다시 열어도 유지되는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·3①. `npm test` Test 9, 변이 사본은 `.scratch/mut/s011` · 2·3②. `ui` + `.scratch/ui/report.json` · 4. 스크린샷 Read · 5. `verify.mjs --set regression`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 업데이트 → 가로에서 막대를 끌어 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 기본 58% = 지금 가로 배치(SPEC_004)와 같음 · 이유: 업데이트 직후 화면이 안 바뀜 · 대안: 50%.
- 범위 30~70%, 영상 맞춤 폭 상한 유지 · 이유: 더 넓히면 회색 띠만 생김 · 대안: 상한 해제.
- 세로 값(`mobileListHeightPercent`)과 따로 저장 · 이유: 방향마다 뜻이 다름.

## 실행 기록
- 2026-11-21 회차 1: IMPLEMENTED — 1 ✅ Test 9 `PASS: 11 landscape-split cases` · 2 ✅ ui 가로 `landscapeResizer` before 막대 {x517,w12,h369} 목록 362 → 왼쪽 150px 끌기 after 목록 505(+143)·영상 357×201·저장 42 = CSS 변수 42·컨트롤 넘침 0 → 두 번 눌러 reset 58·목록 362, 세로 포함 나머지 규칙 ok · 3 ✅ ① MIN 30→20 사본 → `AssertionError clamp 10` exit 1 ② 가로 막대 `display:none` 사본 → `landscapeResizer failed` exit 1 · 4 ✅ landscape.png: 영상·목록 사이 세로 막대와 알약 보임, 기본 배치 그대로(목록 362 ≥ 330, 툴바·단계·컨트롤 넘침 0); landscape-resized.png: 영상 작아지고 목록 넓어짐, 재생 줄은 두 줄로 · 5 ✅ `verify --set regression` harness/build/test/ui ok · 6 ⏳ 실기기
  - 가결정: 막대는 12px 그리드 열(목록 374→362) · 이유: 영상 위에 겹치면 overlay 규칙·터치 충돌 · 대안: 영상 열 오른쪽 여백에 겹쳐 두기. `maxVideoSideGap` 오른쪽은 툴바 대신 막대 왼쪽까지 잼(막대는 의도된 칸, 기준 12 그대로). 좁을 때 재생 줄 `flex-wrap: wrap`(기본 폭에선 한 줄, 높이 34). 화면 검사 드래그는 합성 PointerEvent(모바일 컨텍스트에서 `page.mouse`가 막대에 안 닿음), `tests/ui/entry.ts`에 설정 노출 한 줄 추가(파일 목록 밖).
