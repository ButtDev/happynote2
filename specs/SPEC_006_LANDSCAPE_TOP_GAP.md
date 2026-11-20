---
id: SPEC_006
title: 가로 위 빈칸 제거 — leaf-content 안쪽 여백 무시
status: DONE
iterations: 1
max_iterations: 3
depends_on: []
parent: SPEC_004
---

# SPEC 006 — 가로 위 빈칸 제거 — leaf-content 안쪽 여백 무시

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
1.0.6 실기기 진단(`SPEC_005` 7): `env` 안전 영역 전부 0, Obsidian 변수 `--safe-area-inset-top` 30px·bottom 15px, 고정된 `.workspace-leaf-content`는 화면 맨 위(y≤4)에 붙어 있지만 그 안의 `.view-content`가 y82에서 시작(pt0)하고 y4~y80은 모두 leaf-content 자신. 즉 **leaf-content의 위쪽 안쪽 여백 82px**(상태 표시줄 30 + 헤더 자리, 사람 메모 「액션바 영역」)이 빈칸이다. 가로 + Ear-Coach 활성일 때 `.view-content`를 leaf-content 안에 `position:absolute; inset:0`으로 깔아 그 여백을 무시하고, 위는 상태 표시줄 몫(Obsidian 변수 30px)만 띄운다. CSS만.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `styles.css` — SPEC_004 블록 `.view-content` 규칙: absolute+inset 0, margin 0, 위 패딩 = 상태 표시줄 몫. leaf-content 패딩 0.
- `tests/ui/runUiCheck.mjs` — 검사 HTML이 실기기를 흉내: `:root{--safe-area-inset-top:30px;--safe-area-inset-bottom:15px}`, 가로에서 leaf-content `padding-top:82px`. `rootFillsViewport.top`(위 기대값 ±1) 판정 추가.
- `tests/ui/cases.json` — landscape `rootFillsViewport: {"bottomSlack": 12, "top": 30}`.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 위 패딩: `max(env(safe-area-inset-top, 0px), min(var(--safe-area-inset-top, 0px), 40px))` (1.0.6 기기 → 30px).
- 아래 패딩: `max(env(safe-area-inset-bottom, 0px), 12px)` 유지(1.0.6 사진에서 아래 OK).
- `rootFillsViewport.top`: `|root.y − top| ≤ 1`.

## 4. 범위 밖
- 진단 기능 제거(백로그, 실기기 OK 뒤), 버튼·세로 배치, 상태 표시줄 숨기기.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] 가로 915×412, leaf-content 위 82px 여백 흉내 + Obsidian 변수 30/15에서 `.ear-coach-mobile-container` y=30(±1), 아래 끝 ≥ 400 (`rootFillsViewport` ok) [자동]
2. [x] SPEC_002~005 가로·세로 규칙 전부 ok [자동]
3. [x] 변이: 이번 변경 전 `styles.css`(HEAD)로 `ui` exit 1 (`rootFillsViewport` y≈112 실패) [자동]
4. [x] `landscape.png`에서 위 30px 띠 아래 바로 영상·툴바가 시작 [자동]
5. [x] `verify.mjs --set regression` → `verify: ok`, `git diff --stat -- src` 비어 있음 [자동]
6. [x] Android 실기기 가로에서 상태 표시줄 바로 밑부터 영상·목록이 시작하고 위 빈칸이 없는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·2. `ui` + `.scratch/ui/report.json`
3. `git show HEAD:styles.css > .scratch/mut/styles.css` → `node tests/ui/runUiCheck.mjs --fail-on-overlap --css .scratch/mut/styles.css --out .scratch/mut/ui`
4. 스크린샷 Read
5. `verify.mjs --set regression`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 새 릴리스로 업데이트(실행자가 버전을 알려 줌) → 가로로 Ear-Coach 열고 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- `.view-content`를 absolute inset 0으로 · leaf-content의 패딩·여백·가상 요소 어느 쪽이 82px을 만들든 무시됨(absolute 기준은 패딩 상자) · 대안: leaf-content `padding:0`만(원인이 margin·::before면 실패).
- 위는 Obsidian 변수 30px(상한 40) · 기기 env가 0이라 env만 쓰면 시계와 겹침, Obsidian 변수가 상태 표시줄 높이(사진 ≈28css)와 맞음 · 대안: 0(겹침).

## 실행 기록
- 2026-11-20 회차 1: IMPLEMENTED — 1 ✅ landscape `rootFillsViewport` {x0,y30,w915,h370} top=30 bottomSlack 12 · 2 ✅ ui ok(sideBySide, videoAspect 1.779, maxVideoTop 51, toolbar 43, controls 34, side gap 8/9, list 384, diag, portrait stacked) · 3 ✅ 변이 HEAD styles.css → exit 1: rootFillsViewport y82(실기기와 같은 값)·maxVideoTop 96·minListHeight 275·maxVideoSideGap 18/20 · 4 ✅ landscape.png: 위 30px 띠 바로 밑에 영상·툴바 시작, 빈칸 없음 · 5 ✅ `verify --set regression` → `verify: ok`, `git diff --stat -- src` 비어 있음 · 6 ⏳ 실기기
- 2026-11-20 사람확인(회차 셈 없음): DONE — 6 ✅ `log/confirmations.jsonl` 「[Button pressed: SPEC_006 6 OK]」(1.0.10 실기기), 1~5는 회차 1 근거 그대로.
