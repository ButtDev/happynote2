---
id: SPEC_010
title: 가로 화면 카드 좌우 스와이프로 옵시디언 옆 메뉴 열기
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: []
parent: SPEC_007
---

# SPEC 010 — 가로 화면 카드 좌우 스와이프로 옵시디언 옆 메뉴 열기

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
SPEC_007 8 NG(사람 원문 「Yt 상관없이 가로모드에서 카드 좌우 드래그 안됨, 원래그랬던거 같기도함. 세로에선 됨」, 뜻은 「좌우 드래그 B 카드 스와이프」 = 옵시디언 옆 메뉴 스와이프). 가로 전체화면(SPEC_004)에선 활성 뷰가 `position:fixed` 덮개이고 조상 transform을 풀어서, 옵시디언 자체 스와이프가 안 먹거나 메뉴가 덮개 아래에 깔린다. 가로일 때만 카드 목록에서 좌우 스와이프를 직접 받아 `app.workspace.leftSplit/rightSplit.expand()`를 부르고, 메뉴가 열려 있는 동안 `body.ear-coach-drawer-open`으로 덮개를 숨긴다. 세로는 손대지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/utils/swipeGesture.ts`(새) — `classifySwipe(dx, dy, dtMs)` 순수 함수.
- `src/ui/EarCoachView.ts` — `setupLandscapeDrawerSwipe(listWrapper)`, 메뉴 열림 감시(열린 동안 300ms), `onClose`에서 정리.
- `styles.css` — 가로 + `body.ear-coach-drawer-open`이면 활성 뷰 `visibility: hidden`.
- `tests/fixtures/swipe/cases.json` + `tests/runTests.ts` Test 9.
- `tests/ui/obsidianStub.ts`(옆 메뉴 흉내), `tests/ui/entry.ts`, `tests/ui/runUiCheck.mjs`·`cases.json` `swipeDrawer` 규칙.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `classifySwipe`: `|dx| ≥ 60`, `|dx| ≥ 2·|dy|`, `0 ≤ dt ≤ 600ms`면 `dx>0 → "open-left"`, `dx<0 → "open-right"`, 아니면 `null`. 입력칸(`input, textarea, [contenteditable]`)에서 시작한 터치는 무시.
- body 클래스 `ear-coach-drawer-open` — `leftSplit.collapsed === false || rightSplit.collapsed === false`일 때만.
- UI 규칙 `swipeDrawer: true|false`: true(가로) = 오른쪽 스와이프 → `["left"]`·덮개 hidden, 메뉴 닫힘 → 덮개 visible, 왼쪽 스와이프 → `["right"]`, 30px 스와이프 → 호출 없음. false(세로) = 호출 없음.

## 4. 범위 밖
- 세로 동작, 옵시디언 탭 넘기기 스와이프, 영상·툴바 위 스와이프.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] Test 9: 스와이프 판정 데이터 8건 일치 [자동]
2. [x] ui `swipeDrawer` 가로 true·세로 false ok, 기존 규칙 전부 ok [자동]
3. [x] 변이: ① 방향을 뒤집은 사본 → Test 9 실패 ② 스와이프 설치를 뺀 사본 → `swipeDrawer` 실패 [자동]
4. [x] `landscape.png` 배치 변화 없음 [자동]
5. [x] `verify.mjs --set regression` → `verify: ok` [자동]
6. [ ] Android 실기기 가로에서 카드를 좌우로 밀어 옆 메뉴가 열리고 닫으면 화면이 돌아오는지, 그리고 SPEC_007 ①카드 밀림 ②카드 버튼 모양을 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·3①. `npm test` Test 9, `.scratch/mut/s010` · 2·3②. `ui` + `.scratch/ui/report.json` · 4. 스크린샷 Read · 5. `verify.mjs --set regression`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 업데이트 → 가로에서 카드 위를 오른쪽·왼쪽으로 밀어 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 직접 스와이프 처리 + 열린 동안 덮개 숨김 · 실기기에서 옵시디언 스와이프가 안 되는 원인을 둘 다(이벤트 안 옴 / 덮개 아래 깔림) 덮음 · 대안: 덮개를 메뉴 아래로 z-index만 조정(스택 맥락을 모름).
- 방향: 오른쪽으로 밀면 왼쪽 메뉴(옵시디언 세로와 같음) · 임계 60px·가로/세로 2배·600ms · 세로 스크롤과 안 겹치게.
- 덮개 숨김은 `visibility:hidden`(배치 그대로, 영상은 계속 재생) · 대안: fixed 해제(배치 흔들림).

## 실행 기록
- 2026-11-20 회차 1: IMPLEMENTED — 1 ✅ Test 9 `PASS: 8 swipe cases` · 2 ✅ ui 가로 `swipeDrawer` afterRight calls ["left"]·bodyOpen·leaf hidden, afterClose visible, afterLeft ["right"], 30px 호출 없음 / 세로 호출 없음, 나머지 규칙 ok · 3 ✅ ① 방향 뒤집은 사본 → `AssertionError swipe dx=160 dy=10 dt=250` exit 1 ② 설치 뺀 사본 → `ui-check: FAIL landscape swipeDrawer` exit 1 · 4 ✅ landscape.png 1.0.10과 같은 배치 · 5 ✅ `verify --set regression` → `verify: ok` · 6 ⏳ 실기기
