---
id: SPEC_003
title: 가로모드 전체화면 — Obsidian 헤더·하단 내비게이션 바 숨김
status: DONE
iterations: 1
max_iterations: 3
depends_on: []
parent: SPEC_002
---

# SPEC 003 — 가로모드 전체화면 — Obsidian 헤더·하단 내비게이션 바 숨김

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
SPEC_002 실기기 확인 메모 「상하단공간활용이 떨어짐」(스크린샷 `.scratch/inbox/20261120-215247-322.jpg`: 위쪽 헤더가 높이의 약 1/4, 아래쪽 떠 있는 내비게이션 바가 재생 컨트롤 `1.15x`·시간과 카드 버튼을 가림)에 대해 사람이 「A 둘 다 숨김」을 골랐다. **Ear-Coach 뷰가 활성이고 가로일 때만** 그 뷰의 헤더(`.view-header`)와 Obsidian 하단 내비게이션 바(`.mobile-navbar`)를 숨긴다. 세로, 다른 뷰, 데스크톱은 그대로다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `styles.css` — SPEC_002 가로 블록 아래에 전체화면 규칙 추가. 기존 규칙은 지우지 않는다.
- `tests/ui/runUiCheck.mjs` — 검사용 HTML에 헤더(높이 48px)와 하단 내비게이션 바(`.mobile-navbar`, 화면 아래 고정, 높이 56px)를 실제처럼 넣고, `expect.hidden`·`expect.visible` 규칙 판정 추가.
- `tests/ui/entry.ts` — 뷰 컨테이너에 `data-type="ear-coach-listening-view"`를 달고 `.workspace-leaf.mod-active`로 감싼다(실제 Obsidian DOM과 같게).
- `tests/ui/cases.json` — 뷰포트별 `hidden`·`visible` 규칙 추가.
- `src/`는 바꾸지 않는다.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 조건: `@media (orientation: landscape)` 안에서
  - 헤더: `.workspace-leaf-content[data-type="ear-coach-listening-view"] > .view-header { display: none }`
  - 내비게이션 바: `body.is-mobile:has(.workspace-leaf.mod-active .ear-coach-mobile-container) .mobile-navbar { display: none !important }`
  - 헤더가 사라진 자리는 상태 표시줄과 겹치지 않게 `.view-content`에 `padding-top: var(--safe-area-inset-top, 0px)`.
- `cases.json` 규칙: `landscape` → `hidden: [".view-header", ".mobile-navbar"]`, 영상 위쪽 ≤ 60(헤더 자리를 영상 쪽이 씀). `portrait` → `visible: [".view-header", ".mobile-navbar"]`.
- SPEC_002 규칙(좌우 배치·16:9·높이 하한·겹침 0·뷰포트 안)은 그대로 유지.

## 4. 범위 밖
- 숨긴 헤더·내비게이션을 다시 띄우는 버튼, 설정 항목.
- 세로 배치 변경, iframe 안 유튜브 overlay.
- Obsidian 상태 표시줄(시계·배터리) 숨기기.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] 가로 915×412에서 `.view-header`·`.mobile-navbar`가 보이지 않는다(`hidden` 규칙 ok) [자동]
2. [ ] 가로에서 영상 위쪽 ≤ 60, SPEC_002 가로 규칙 전부 ok [자동]
3. [ ] 세로 412×915에서 `.view-header`·`.mobile-navbar`가 보이고(`visible` ok), SPEC_002 세로 규칙 전부 ok [자동]
4. [ ] 변이: 전체화면 규칙을 뺀 `styles.css` 사본으로 `ui`가 exit 1(`hidden` 실패) [자동]
5. [ ] `landscape.png`를 열어 보면 헤더·내비게이션 바 없이 영상과 목록이 위아래 끝까지 쓰이고, `portrait.png`에는 헤더·내비게이션 바가 있다 [자동]
6. [ ] `verify.mjs --set regression`이 `verify: ok`, `git diff --stat -- src` 비어 있음 [자동]
7. [ ] Android 실기기 가로에서 헤더·내비게이션 바 없이 영상·자막이 화면을 넉넉히 쓰고 상태 표시줄과 겹치지 않는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1~3. `verify.mjs`의 `ui` + `report.json` `checks`
4. `.scratch/mut/styles.css` → `node tests/ui/runUiCheck.mjs --fail-on-overlap --css .scratch/mut/styles.css --out .scratch/mut/ui` exit 코드
5. 스크린샷 Read
6. `verify.mjs --set regression`, `git diff --stat -- src`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 새 릴리스로 업데이트(실행자가 배포하고 버전을 알려 줌)
2. 가로로 Ear-Coach 세션을 열어 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- CSS `:has()`로 「Ear-Coach가 활성일 때만」 내비게이션 바 숨김 · TS 없이 다른 뷰로 가면 자동 복귀, Android WebView(Chrome 105+) 지원 · 대안: 뷰 열림/닫힘 때 body 클래스 토글(TS 변경).
- 헤더 자리 `padding-top: var(--safe-area-inset-top, 0px)` · 상태 표시줄 겹침 방지, 값이 없으면 0 · 대안: 패딩 없음(겹칠 위험), 고정 24px.
- 화면 검사에 헤더 48px·내비게이션 바 56px 가짜 요소 · 실기기 DOM 이름(`.view-header`, `.mobile-navbar`)과 대략 크기를 재현 · 대안: 실기기 DOM 덤프(불가).

## 실행 기록
- 2026-11-20 회차 1: IMPLEMENTED — 1 ✅ ui landscape checks `hidden:.view-header`·`hidden:.mobile-navbar` visible=false · 2 ✅ maxVideoTop 53 ≤ 60, video 487×274 sideBySide·videoAspect·minVideoHeight·minListHeight(374) ok · 3 ✅ portrait `visible:` 둘 다 true, stacked·minVideoWidth(396)·overlap 0 ok · 4 ✅ 변이: 전체화면 블록 뺀 css → hidden 2개·maxVideoTop(77) 실패 exit 1 · 5 ✅ landscape.png: 헤더·내비바 없이 왼쪽 영상+컨트롤, 오른쪽 필터+카드가 위 끝부터; portrait.png: 위 검은 헤더 띠, 아래 둥근 내비바 보임 · 6 ✅ `verify --set regression` → `verify: ok`, `git diff --stat -- src` 비어 있음 · 7 ⏳ 실기기
  - 가결정: 화면 검사 HTML에 헤더 48px·`.mobile-navbar` 56px 가짜 요소를 넣고, 내비바는 overlay 측정 제외(앱 UI) · 이유: 실기기 크롬 재현 · 대안: 없음.
- 2026-11-21 사람확인(회차 셈 없음): DONE — 7 ✅ 「[Button pressed: SPEC_003 7 OK]」(1.0.14 기준) · 1~6 ✅ 이번 `verify --set regression` → ok(harness·build·test·ui, landscape 891×411 video 500×281·list 362×326, `ui-check: ok`)
