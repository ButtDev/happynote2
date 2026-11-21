---
id: SPEC_024
title: 세로 화면 공통 컨트롤·필터 툴바를 가로와 같은 알약·세그먼트 버튼으로
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 024 — 세로 화면 공통 컨트롤·필터 툴바를 가로와 같은 알약·세그먼트 버튼으로

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
사람 요청(2026-11-21): 「세로모드 공통버튼이 가로모드보다 각지고 투박하네」. 가로 화면의 재생 컨트롤(재생·반복·⇅·배속·YT)과 필터 툴바는 SPEC_004에서 둥근 알약·세그먼트로 다듬었지만, 그 규칙이 `@media (orientation: landscape)` 안에만 있어 세로 화면은 각진(4px) 기본 버튼 그대로다. 이번에는 세로 화면에도 같은 모양(알약 버튼, 배속·필터는 한 덩어리 세그먼트, 반복 켜짐 주황)을 입힌다. 세로 폭(412)이 가로 왼쪽 열(500)보다 좁으므로 가로보다 안쪽 여백만 줄여 컨트롤이 한 줄에 들어가게 한다. TS·문구는 바꾸지 않는다.

## 2. 파일
- `styles.css`: 끝에 SPEC_024 블록 `@media (orientation: portrait)` — 가로 SPEC_004의 알약·세그먼트 규칙을 세로용 여백으로.
- `tests/ui/runUiCheck.mjs`: `expect.minRadius`(선택자 → 최소 border-radius px) 검사 추가.
- `tests/ui/cases.json`: 세로·가로에 `minRadius`, 세로에 `maxHeight`·`noOverflowX`(컨트롤·툴바).

## 3. 정의
- 세로 알약 버튼: 높이 32px, `border-radius: 999px`. 세그먼트 묶음(배속·필터 첫 묶음): 둥근 테두리 안 28px 버튼, 고른 것은 강조색.
- `minRadius`: `{ "<선택자>": <px> }` — 첫 요소의 계산된 `border-top-left-radius`가 px 이상.

## 4. 범위 밖
- 카드 안 버튼(이미 SPEC_007에서 알약), 데스크톱 화면, 버튼 글자·순서·기능.

## 5. 완료 조건
1. [x] 화면 검사 세로 `minRadius`: 재생 버튼·반복 버튼·배속 묶음·툴바 첫 묶음 각 14px 이상 [자동]
2. [x] 화면 검사 세로 컨트롤 줄 높이 44px 이하(한 줄), 컨트롤·툴바 가로 넘침 없음 [자동]
3. [x] 화면 검사 가로 기존 규칙 모두 통과 + 가로 `minRadius`도 통과(가로 모양 그대로) [자동]
4. [x] 변이: SPEC_024 블록을 뺀 `styles.css`로 화면 검사 세로 `minRadius` 실패 [자동]
5. [x] `verify.mjs --set regression` ok, `portrait.png`를 열어 버튼이 가로처럼 둥근지 확인 [자동]
6. [ ] Android 실기기: BRAT 새 버전에서 세로 화면 공통 컨트롤·필터 버튼이 가로처럼 둥글고 깔끔한지 보고 버튼 [수동]

## 6. 자동 검증
- 1·2·3: `node tests/ui/runUiCheck.mjs --fail-on-overlap`(regression `ui`) 출력. 4: `.scratch/`에 블록 뺀 사본으로 같은 검사. 5: `verify.mjs --set regression --json`, 스크린샷 열어 봄.

## 7. 수동 검증
1. BRAT로 새 버전 → Obsidian 다시 시작 → 영상 노트를 세로로 열어 공통 컨트롤·필터 버튼 모양을 보고 버튼.

## 8. 가결정
- 가로 규칙을 공통으로 옮기지 않고 세로 블록을 따로 둠: 가로는 실기기 확인이 끝난 상태라 건드리지 않으려고. 대안: 두 방향 공통 규칙 + 가로 덮어쓰기 — 중복은 줄지만 가로 회귀 위험.

## 실행 기록
- 2026-11-21 회차 1: IMPLEMENTED — 1 ✅ 화면 검사 세로 minRadius 4개 모두 999 ≥ 14 · 2 ✅ 세로 maxHeight 컨트롤 ≤44·툴바 ≤48, noOverflowX 컨트롤·툴바 ok(컨트롤 줄 여유 0: 상태 시각 끝 404 = 컨테이너 끝, 반복 글자 ∞ 45px·×3 50px·OFF 60px 모두 높이 34 한 줄) · 3 ✅ 가로 기존 규칙 + minRadius 모두 ok · 4 ✅ 변이: SPEC_024 블록 뺀 css(`--css .scratch/mut_024.css`) → 세로 minRadius 4개(4·4·0·0 ≥ 14)·툴바 높이 52>48 실패 · 5 ✅ `verify.mjs --set regression --json` harness·build·test·ui 모두 ok, `portrait.png` 열어 봄: 재생·OFF·⇅·배속 세그먼트·YT·시각이 둥근 알약 한 줄, 필터 세그먼트+블라인드·공개 알약 — 가로와 같은 모양, `landscape.png` 바뀌지 않음 · 6 ⏳ 실기기
- 가결정(회차 1): 세로 여백을 가로보다 줄임(알약 0 8px, 재생 0 10px, 배속 0 5px, 시각 11px) · 세로 폭 396에 시각까지 한 줄로 넣으려고 · 대안: 시각을 둘째 줄로 — 컨트롤 높이가 늘어 영상이 작아짐
