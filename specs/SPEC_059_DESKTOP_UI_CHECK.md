---
id: SPEC_059
title: 데스크톱 안 깨짐 화면 검사 — 1280×800 데스크톱 뷰 한 장
status: DONE
iterations: 1
max_iterations: 2
depends_on: []
---

# SPEC 059 — 데스크톱 안 깨짐 화면 검사 — 1280×800 데스크톱 뷰 한 장

야간 자가 확정(백로그 「대기」 맨 위). 제품 코드·화면은 바뀌지 않는다(시험만 추가).

## 1. 목표
0장 「데스크톱 동작을 깨지 않는다」에 자동 근거가 없다. 화면 검사(`tests/ui/runUiCheck.mjs`)에 isMobile:false 데스크톱 뷰(1280×800)를 하나 더해, 데스크톱 배치(`renderDesktopWorkspace`)가 뜨고 콘솔 오류가 없고 영상·목록이 겹치지 않는지 회귀에서 지킨다. 기준선만 세운다.

## 2. 파일
- `tests/ui/entry.ts`: `window.__uiDesktop`이면 `is-mobile`·모바일 내비 막대 없이 `setPlatformMobileOverrideForTest(false)`.
- `tests/ui/runUiCheck.mjs`: 뷰포트 `desktop: true` → isMobile·hasTouch false + `__uiDesktop` 초기 스크립트, 뷰포트별 `selectors`(없으면 공통), expect `layout: "listLeft"`(목록·툴바 오른쪽 끝 ≤ 영상 x), `noPageErrors`(페이지 오류·콘솔 오류 0, 막은 네트워크의 「Failed to load resource」 제외).
- `tests/ui/cases.json`: `desktop` 뷰포트(데스크톱 셀렉터·기준 expect).

## 4. 범위 밖
- 데스크톱 화면 고치기(나오면 백로그), 모바일 뷰 expect 변경, 튜터 패널 막대 끌기 검사.

## 5. 완료 조건
- [x] 1. `runUiCheck --fail-on-overlap`이 desktop 뷰를 포함해 ok, desktop checks 전부 ok(겹침 0, 4개 영역 화면 안, 카드 ≥3, listLeft, 콘솔 오류 0, 가로 넘침 0) [자동]
- [x] 2. 변이 3개가 desktop에서 실패: 열 순서 뒤집기 CSS, 툴바 1500px CSS, 데스크톱에서 console.error [자동]
- [x] 3. desktop 스크린샷을 열어 데스크톱 2열 배치(왼쪽 목록·오른쪽 영상)임을 확인 [자동]
- [x] 4. `verify.mjs --set regression` 통과, 모바일 두 뷰 checks 그대로 ok [자동]

## 8. 가결정
- 별도 러너 대신 기존 러너에 뷰포트 하나 · 번들·HTML·측정 코드를 그대로 씀, 모바일 전용 시나리오는 expect 키가 없으면 건너뜀 · 대안: `runDesktopCheck.mjs` 새 파일(중복 큼).
- 셀렉터를 뷰포트별로 · 데스크톱 DOM 클래스가 다름(`.ear-coach-transcript-list-wrapper`·`.ear-coach-toolbar`) · 대안: 공통 셀렉터에 쉼표 목록(측정 대상이 모호해짐).
- 콘솔 오류에서 「Failed to load resource」 제외 · 러너가 외부 요청을 일부러 막아서 생김 · 대안: 막힌 URL 목록으로 거르기.

## 실행 기록

### 2026-11-26 야간 #1 — DONE
- 1 ✅ `runUiCheck --fail-on-overlap` → `ui-check: ok`. desktop checks 12/12 ok: 겹침 0·0, video {654,82,614×346}·controls {654,440,614×40}·toolbar {0,70,641×153}·list {0,223,641×541} 화면 안, 카드 3, listLeft(목록 오른쪽 641 ≤ 영상 x 654), 페이지·콘솔 오류 0, 가로 넘침 0(641≤641, 614≤614).
- 2 ✅ 변이: 열 뒤집기 → `listLeft:list failed (list.right=1279 video.x=12)`; 툴바 1500px → `inside:toolbar failed`·`listLeft:toolbar failed (toolbar.right=1524)`; console.error → `noPageErrors failed (consoleErrors:["mutant"])`. 셋 다 desktop만 실패, 원본 복구 확인(`grep -c mutant` 0).
- 3 ✅ `.scratch/ui/desktop.png` 열어 봄: 왼쪽 「오늘의 문장」 배너·필터·agy 버튼·카드 3장, 오른쪽 영상 자리·재생/반복/따라가기/배속 줄. 깨진 곳 없음.
- 4 ✅ `verify.mjs --set regression` → `verify: ok`(harness·build·test·ui). 모바일 checks portrait 50/50·landscape 58/58 ok.
