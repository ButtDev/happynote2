---
id: SPEC_054
title: 공유 메뉴 줄 자리 고치기 + 공유 진단 기록
status: DONE
iterations: 1
max_iterations: 3
depends_on: []
parent: SPEC_053
after_implemented: true
---

# SPEC 054 — 공유 메뉴 줄 자리 + 진단

> 야간 자가 확정(2026-11-25). 백로그 「[야간] SPEC_053 공유 줄 원인 찾기」 ①②③.

## 1. 목표
Obsidian 공식 배포본 1.15.1(`obsidian-1.15.1.asar.gz`의 `app.js`)을 읽어 찾은 근거로 고친다.
- 근거 A: 공유 받기 `handleShareText`가 `new Menu().addSections(["title","options","danger"])` → 제목·「Add text to file:」 → `workspace.trigger("receive-text-menu", menu, text)` → Cancel(danger) 순으로 만든다. 「Today's daily note」도 이 이벤트로 붙는다(사진에 보임) → 이벤트는 불린다.
- 근거 B: `Menu.sort()`는 section 없는 줄을 `""` 묶음으로 보내 **선언된 묶음 뒤(= Cancel 아래)**에 붙인다. SPEC_053 회차 1 줄은 section이 없었다.
- 근거 C: 사람 NG(11-24 22:44, 메시지 1045)는 회차 1(1.0.62) 질문에 눌렸다. 회차 2(1.0.63, 22:58 배포)는 아직 실기기 판정이 없다.

할 것: 이벤트 줄에 `setSection("options")`(「Today's daily note」 바로 아래, Cancel 위). 공유 이벤트·공유 메뉴 DOM을 볼 때마다 진단 기록(설정 「🩺 진단 복사」)에 한 줄 — 다음 NG 때 어디서 막혔는지 보이게.

## 2. 파일
- `src/features/commands.ts`: 이벤트 줄 section, 진단 한 줄.
- `src/ui/shareMenuInjector.ts`: 넣기 결과 이유(`shareInjectReason`), 관찰 중 공유 메뉴(또는 `youtu` 글이 든 메뉴)를 보면 진단 한 줄.
- 시험: `tests/wiring/runWiringCheck.mjs`·`tests/fixtures/wiring/expected.json`(section·진단), `tests/ui/runUiCheck.mjs`(`__diagnostics`에 공유 메뉴 줄).

## 3. 정의
- 진단 단계 이름: 이벤트 `공유 이벤트`, DOM `공유 메뉴`. 메시지: 이벤트 `글 N자 · 유튜브 찾음|없음 · <글 앞 60자>`, DOM `<이유> · 묶음 <data-section 목록> · 줄 N`. 이유 = `넣음`·`이미 있음`·`유튜브 없음`·`공유 메뉴 아님`.
- 진단 글은 보고 만들 때 `redactDiagnostics`가 URL 쿼리를 가린다(기존).

## 4. 범위 밖
메뉴 맨 위로 옮기기, 다른 사이트, 진단을 파일에 남기기.

## 5. 완료 조건
1. [x] 이벤트 줄이 section `options`로 들어가고, 진단에 `공유 이벤트` 한 줄(유튜브 찾음/없음) [자동: wiring check(Test 25)]
2. [x] DOM 관찰이 공유 메뉴를 보면 진단에 `공유 메뉴 · 넣음/이미 있음/유튜브 없음` 한 줄, 공유 아닌 일반 메뉴는 기록 안 함 [자동: 화면 검사 `expect.shareMenu`]
3. [x] 변이(section 지정 끔, 진단 끔) 실패 [자동]
4. [x] 회귀 통과 [자동]

⏳는 SPEC_053 5(BRAT 새 판으로 같은 확인)로 모은다.

## 6. 자동 검증
1: `npm test` Test 25. 2: `node tests/ui/runUiCheck.mjs`. 3: 사본 고쳐 돌림. 4: `verify.mjs --set regression`.

## 8. 가결정
- 이벤트 줄 section `options` · 「Today's daily note」와 같은 묶음, Cancel 위 · 대안: 새 section(묶음 끝에 붙어 구분선 생김)
- 진단은 오류 기록(`diagnostics.record`)을 그대로 씀 · 이미 사람이 「🩺 진단 복사」를 알고 있음 · 대안: 따로 정보 기록 칸(화면 바뀜)
- wiring check는 묶인 코드에서 `new DiagnosticsLog(` 이름을 찾아 꺼냄 · 제품 코드에 시험용 전역을 안 만듦 · 대안: `globalThis` 노출
- 새 SPEC으로 함(SPEC_053 마지막 회차 아낌) · 회차 2(1.0.63)가 아직 실기기 판정 전이라 · 대안: SPEC_053 회차 3

## 실행 기록
- 2026-11-25 회차 1(야간): IMPLEMENTED — 1 ✅ `node tests/wiring/runWiringCheck.mjs` 「wiring OK: 5 commands, 3 events」(줄 section options, 진단 「유튜브 찾음」/「유튜브 없음」) · 2 ✅ 화면 검사 shareMenu 양 뷰 `diags:["공유 메뉴: 넣음 · 묶음 title,options,danger · 줄 5"]`·「유튜브 없음 … 줄 4」·「이미 있음 … 줄 5」, 일반 메뉴 plainDiags 0 · 3 ✅ 변이 4개 실패: section 끔 → 「공유 메뉴 줄」, 이벤트 진단 끔 → 「공유 이벤트 진단 1줄」, DOM 진단 끔 → ui-check FAIL, 일반 메뉴 거름 끔 → plainDiags 1 FAIL · 4 ✅ `verify.mjs --set regression` harness·build·test·ui ok (night/SPEC_054 worktree)
- 2026-11-25 사람 확인: SPEC_053 5 OK(1.0.65, 공유 메뉴 줄로 영상 열림) → 모아 둔 ⏳ 끝, DONE
