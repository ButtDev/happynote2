---
id: SPEC_005
title: 가로 화면 진단(알림·노트) + 위 여백 시험 수정
status: DONE
iterations: 1
max_iterations: 3
depends_on: []
parent: SPEC_004
---

# SPEC 005 — 가로 화면 진단(알림·노트) + 위 여백 시험 수정

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
SPEC_004가 1.0.5에서 위 ≈84css 빈칸으로 STOPPED(같은 시그니처 2회). 사람이 「A 진단+시험 수정」을 골랐다. 실기기 DOM·안전 영역 값을 모른 채 추측하지 않도록 ① Ear-Coach 뷰가 모바일 가로로 열리면 진단 값을 **알림(Notice)으로 띄우고** 같은 내용을 노트 `Ear-Coach 화면 진단.md`에 쓴다(명령 팔레트로도 실행 가능). 사람은 스크린샷 한 장만 보내면 된다. ② 같은 배포에 시험 수정: 위 안전 영역 패딩을 상한 28px로 줄이고, 아래는 제스처 바 몫으로 최소 12px 띄운다. 진단 기능은 원인 확정 뒤 지운다(백로그).

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/utils/layoutDiagnostics.ts` (새) — `collectLayoutDiag(el)`(DOM 측정), `summarizeLayoutDiag(d)`(알림 한 덩어리 글), `formatLayoutDiagMarkdown(d)`(노트 본문). 뒤 둘은 순수 함수.
- `src/main.ts` — 명령 `ear-coach-layout-diagnostics` 추가, 진단 노트 쓰기 함수.
- `src/ui/EarCoachView.ts` — 모바일에서 가로로 열리거나 가로로 돌아갈 때 1회(뷰 열림당) 진단 실행.
- `styles.css` — SPEC_004 블록의 `.view-content` 패딩 위·아래 값.
- `tests/fixtures/layout-diag/*.json` + `tests/runTests.ts` — 순수 함수 데이터 시험.
- `tests/ui/entry.ts`, `tests/ui/runUiCheck.mjs`, `tests/ui/cases.json` — 브라우저에서 `collectLayoutDiag`가 돌고 요약이 나오는지(`expect.diag`).

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 명령: id `ear-coach-layout-diagnostics`, 이름 `가로 화면 진단 노트 만들기 (Layout Diagnostics)`.
- 노트 경로: 볼트 루트 `Ear-Coach 화면 진단.md` (있으면 덮어씀).
- 측정 값 `LayoutDiag`: `viewport{w,h,dpr,vvW,vvH,vvTop}`, `env{top,right,bottom,left}`(env() 탐침 div), `obsidianVars{top,bottom}`(`--safe-area-inset-top/bottom` 계산값), `chain[]`(`.ear-coach-mobile-container`부터 `html`까지: `name`(태그.클래스 앞 3개), `rect{x,y,w,h}`, `pos`, `padT`, `padB`, `marT`, `transform`, `contain`, `containerType`, `z`), `topHits[]`(화면 가운데 x에서 y=4,20,40,60,80일 때 `elementsFromPoint` 맨 위 요소 이름).
- 알림 첫 줄 `Ear-Coach 화면 진단`, 이어서 `vp 915×412 dpr 2.63`, `env t36 r0 b0 l0`, `obs t36 b0`, `root y84`, `y4:… y20:… y40:… y60:… y80:…` 형식, 20초 표시.
- CSS 시험 수정(가로 블록 `.view-content`): `padding-top: min(env(safe-area-inset-top, 0px), 28px)`, `padding-bottom: max(env(safe-area-inset-bottom, 0px), 12px)`.
- `cases.json` landscape `rootFillsViewport`는 아래 12px 몫을 허용하도록 `rootFillsViewport: {"bottomSlack": 12}`.

## 4. 범위 밖
- 진단 결과에 따른 최종 수정(다음 회차/SPEC), 세로 배치, 버튼 디자인 변경.
- 진단 결과를 밖으로 보내기(업로드). 노트·알림만.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] `summarizeLayoutDiag`·`formatLayoutDiagMarkdown`이 `tests/fixtures/layout-diag/` 데이터의 기대 줄을 모두 포함한다(`npm test`) [자동]
2. [ ] 화면 검사 브라우저에서 `collectLayoutDiag`가 오류 없이 돌고 요약 첫 줄이 `Ear-Coach 화면 진단`, `chain` 길이 ≥ 4, `topHits` 5개(`expect.diag` ok) [자동]
3. [ ] `src/main.ts`에 명령 id·이름이 글자 그대로 있고(`grep`), 모바일 경로에 Node 내장 모듈 최상위 import 없음(`npm test` Test 6) [자동]
4. [ ] 가로 화면 검사 SPEC_002~004 규칙 ok, 아래 12px 몫 허용 [자동]
5. [ ] 변이: `summarizeLayoutDiag`의 env 줄을 망가뜨린 사본으로 데이터 시험 실패 [자동]
6. [ ] `verify.mjs --set regression` → `verify: ok` [자동]
7. [ ] 실기기 가로에서 Ear-Coach를 열면 진단 알림이 뜨고, 그 화면(위 여백 포함) 스크린샷을 보내면 된다 — 위 여백이 사라졌으면 OK, 남았으면 사진과 함께 NG [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·5. `npm test`(Test 7), 변이는 `.scratch/mut/` 사본을 import하는 일회 실행
2·4. `ui` + `.scratch/ui/report.json`
3. `grep -n "ear-coach-layout-diagnostics" src/main.ts`, `npm test`
6. `verify.mjs --set regression`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 새 릴리스로 업데이트 → Obsidian 완전히 껐다 켜기
2. 가로로 Ear-Coach 세션 열기 → 알림이 떠 있는 화면 스크린샷 보내기

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 진단은 명령 대신 **가로로 열 때 자동 알림** · 가로에선 헤더·내비바가 숨어 명령 팔레트 열기가 번거롭고, 스크린샷 한 장으로 끝남 · 대안: 명령만.
- 위 패딩 상한 28px · Android 가로 상태 표시줄 ≈24dp, 사진상 상태 표시줄 띠 ≈36css 안에서 시계와 안 겹칠 최소 · 대안: 0(겹칠 위험), 36px.
- 아래 최소 12px · 1.0.5 사진에서 목록이 제스처 바(아래 ≈10css) 밑으로 내려감 · 대안: 0.

## 실행 기록
- 2026-11-20 회차 1: IMPLEMENTED — 1 ✅ `npm test` Test 7 `PASS: landscape-gap.json`(요약 7줄·노트 4조각) · 2 ✅ ui landscape `diag` ok: chainLen 7, topHits 5, 첫 줄 `Ear-Coach 화면 진단` · 3 ✅ `src/main.ts:88-89` 명령 id·이름, Test 6(main.js 정적 Node require 0) 통과 · 4 ✅ SPEC_002~004 가로 규칙 ok, `rootFillsViewport` {0,0,915,400} bottomSlack 12 · 5 ✅ 변이: env 줄 t/r 바꾼 사본 → `FAIL missing: ['env t36 r0 b0 l0']` exit 1 · 6 ✅ `verify --set regression` → `verify: ok` · 7 ⏳ 실기기
  - 가결정: 변이 시험은 같은 fixture·같은 판정 로직의 일회 러너(`.scratch/mut/diag/run.ts`)로 확인 · 이유: runTests.ts가 src 경로를 고정 import · 대안: 러너에 경로 인자 추가.
- 2026-11-20 사람확인(회차 셈 없음): IMPLEMENTED 유지(진단 목적 달성) — 7 ❌ 1.0.6 사진(`.scratch/inbox/20261120-223635-342.jpg`): 위 빈칸 그대로. 진단 `env t0 r0 b0 l0`, `obs t30px b15.1px`, `root y82 h317`, `.view-content y82 pt0`, `y4~y80` 전부 `.workspace-leaf-content` → leaf-content(화면 맨 위에 붙음) 안쪽 위 82px이 원인. 수정은 SPEC_006.
- 2026-11-21 사람확인(회차 셈 없음): DONE — 7 ✅ 진단 목적(위 여백 원인 확정) 달성, 위 여백은 SPEC_006에서 고쳐 사람 OK: 「[Button pressed: SPEC_004 8 OK]」·「[Button pressed: SPEC_003 7 OK]」(1.0.14, 위아래 빈칸 없음·상태 표시줄과 안 겹침) · 1~6 ✅ 이번 `verify --set regression` → ok(test에 Test 7 포함, ui `diag` 포함). 진단 기능 제거는 SPEC_012.
