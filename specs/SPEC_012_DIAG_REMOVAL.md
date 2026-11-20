---
id: SPEC_012
title: 임시 가로 화면 진단 기능 제거
status: READY
iterations: 0
max_iterations: 3
depends_on: [SPEC_005]
parent: SPEC_005
---

# SPEC 012 — 임시 가로 화면 진단 기능 제거

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
SPEC_005의 진단(가로로 열면 20초 알림 + 노트 `Ear-Coach 화면 진단.md` 쓰기 + 명령)은 위 여백 원인 확정(SPEC_006)으로 목적을 다했다. 가로로 열 때마다 알림이 뜨고 볼트에 노트를 쓰므로 지운다. 다른 동작(가로 배치·비율 막대·재생 등)은 바꾸지 않는다. 볼트에 이미 생긴 진단 노트는 건드리지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/utils/layoutDiagnostics.ts` — 삭제(`.scratch/trash/`로 옮기고 git에서 삭제).
- `src/main.ts` — 진단 import, 명령 `ear-coach-layout-diagnostics`, `runLayoutDiagnostics` 제거.
- `src/ui/EarCoachView.ts` — `layoutDiag*` 필드, `maybeRunLayoutDiag`, resize 리스너 등록·해제, 호출 제거.
- `tests/runTests.ts` — Test 7(진단 글) 제거 → Test 7을 「지운 기능이 main.js에 남지 않음」 데이터 시험으로 바꿈.
- `tests/fixtures/layout-diag/` — 삭제(trash로). `tests/fixtures/removed-features/diag.json` 새로.
- `tests/ui/entry.ts`, `tests/ui/runUiCheck.mjs`, `tests/ui/cases.json` — `__layoutDiag`·`diag` 규칙 제거.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `tests/fixtures/removed-features/*.json`: `{"name": …, "file": "main.js", "forbidden": [문자열…]}`. diag.json의 forbidden: `ear-coach-layout-diagnostics`, `Ear-Coach 화면 진단`, `Layout Diagnostics`.
- Test 7 이름: `[Test 7] Removed Temporary Features (data-driven)`.

## 4. 범위 밖
- 볼트의 기존 `Ear-Coach 화면 진단.md` 노트 삭제, 다른 기능·CSS 변경, `styles.css`의 SPEC_006 주석 정리.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] `grep -rn -i "layoutDiag\|layout-diag\|ear-coach-layout-diagnostics" src tests` 결과 0줄(새 fixture 폴더 `removed-features`의 금지 문자열 제외) [자동]
2. [ ] `npm test` Test 7이 빌드된 `main.js`에 금지 문자열이 없음을 통과 [자동]
3. [ ] 변이: 금지 문자열 하나를 넣은 main.js 사본으로 Test 7 판정이 실패 [자동]
4. [ ] `verify.mjs --set regression` → ok (ui 가로·세로 규칙 전부 ok, `diag` 규칙 없음) [자동]
5. [ ] Android 실기기 새 버전에서 가로로 Ear-Coach를 열어도 진단 알림이 뜨지 않는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1. 위 `grep`
2. `npm test` 출력
3. `.scratch/mut/`에 금지 문자열을 덧붙인 main.js 사본으로 Test 7 로직 일회 실행 → 실패 확인
4. `verify.mjs --set regression --json`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 새 릴리스로 업데이트(실행자가 배포하고 버전을 알려 줌)
2. 가로로 Ear-Coach 세션을 열어 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- Test 7 자리를 「지운 기능이 다시 들어오지 않음」 시험으로 재사용 · 시험 번호를 비우지 않고 제거 자체를 불변식으로 지킴 · 대안: Test 7 단순 삭제.

## 실행 기록
