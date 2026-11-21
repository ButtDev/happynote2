---
id: SPEC_023
title: 공통 컨트롤 반복 버튼 — 지금 재생 위치 기준 켜기·끄기 + 반복 모드(무한/N번씩 다음 문장) + 카드 목록 자동 따라가기
status: READY
iterations: 0
max_iterations: 3
depends_on: []
---

# SPEC 023 — 공통 컨트롤 반복 버튼 — 지금 재생 위치 기준 켜기·끄기 + 반복 모드 + 카드 목록 자동 따라가기

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
사람 요청(2026-11-21): 「공통컨트롤 루프 버튼을 개선하자. 기본적으로 off이고 카드에서 선택하면 활성화되어 끌 수 있어, 이걸 현재 재생위치 기준으로 토글할 수 있는 형태로 바꾸자. Mode는 repeat player처럼 지원되면 좋지 않을까, 셔플모드는 글쎄. 그리고 재생 시점에 따라 카드덱 위치도 자동 이동되면 좋겠네, 싫어할 수도 있으니 on/off」. 지금은 플레이어 아래 공통 컨트롤의 「🔁 루프 OFF」 버튼이 **끄기만** 한다(켜려면 카드의 「🔁 이 문장 루프」를 눌러야 함). 이번에는 이 버튼을 누를 때마다 **끔 → 한 문장 무한 반복 → N번씩 듣고 다음 문장 → 끔**으로 돌게 한다. 켤 때 대상은 **지금 재생 위치의 문장**이다. 반복 사이에는 쉼(초)을 둘 수 있다(설정). 재생 시점이 바뀌면 카드 목록이 지금 문장을 가운데로 자동 스크롤하고, 이 기능은 공통 컨트롤의 버튼으로 켜고 끈다. 셔플은 하지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/utils/loopControl.ts` (새로, obsidian import 없음): 모드 순환·버튼 글자·반복 판정·자동 따라가기 판정 순수 함수.
- `src/ui/components/PlayerBar.ts`: 반복 버튼이 모드를 돈다. 켤 때 콜백으로 지금 위치 문장을 받는다. 반복 판정은 `decideLoopTick`으로. 「따라가기」 버튼 추가.
- `src/ui/EarCoachView.ts`: PlayerBar 콜백(`getSegmentAt`·`getNextSegment`·`onFollowToggle`) 연결, 재생 시점 바뀌면 자동 스크롤.
- `src/ui/components/VirtualSegmentList.ts`: 사람이 목록을 손대면(터치·휠) 4초 동안 자동 스크롤 쉼을 알리는 콜백, 부드럽게/즉시 스크롤 선택.
- `src/ui/components/SegmentCard.ts`: 카드 반복 버튼은 지금 모드가 끔이면 「한 문장 무한」으로 켠다(지금 동작과 같음). 글자 바꾸지 않음.
- `src/types/settings.ts`, `src/ui/SettingsTab.ts`: 설정 3개.
- `styles.css`: 따라가기 버튼 켜짐 모양(기존 `.is-active` 재사용 가능하면 추가 없음).
- `tests/runTests.ts` Test 16 + `tests/fixtures/loop/cases.json`: 순수 함수 시험 데이터. 변이용 환경 변수 `EAR_COACH_LOOP_MODULE`.
- `tests/ui/entry.ts`, `tests/ui/runUiCheck.mjs`, `tests/ui/cases.json`: 화면 검사 `expect.loopCycle`·`expect.follow`.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `type LoopMode = "off" | "one" | "count"`. 순환 `nextLoopMode`: off → one → count → off.
- 설정(`EarCoachSettings`):
  - `loopRepeatCount: number` 기본 3 (2~10) — 「N번씩 다음 문장」의 N.
  - `loopGapSeconds: number` 기본 0 (0~5, 0.5 단위) — 한 번 끝나고 다시 듣기 전 쉼.
  - `autoFollowPlayback: boolean` 기본 true — 카드 목록 자동 따라가기.
- 반복 버튼 글자 `loopButtonText(mode, count, mobile, seg?)`:
  - 모바일: off `🔁 OFF`, one `🔂 ∞`, count `🔂 ×3`(N).
  - 데스크톱: off `🔁 반복: OFF`, one `🔂 한 문장 무한 [00:12 ~ 00:15]`, count `🔂 3번씩 다음 문장 [00:12 ~ 00:15]`(seg 없으면 대괄호 생략).
- 켜짐일 때 버튼 클래스 `is-loop-active`(기존과 같음), 반복 중인 카드 버튼은 기존 `is-loop-active-btn`·「🔁 루프 중 (해제)」.
- `decideLoopTick(input)` 입력 `{ mode, nowMs, current, end, pad, playsDone, count, gapSec, resumeAtMs }`, 결과 `{ kind: "none" } | { kind: "repeat" } | { kind: "advance" } | { kind: "gap", resumeAtMs }`:
  - mode off → none.
  - `resumeAtMs`가 있고 `nowMs < resumeAtMs` → none(쉼 중). `nowMs ≥ resumeAtMs` → 다음 동작(아래).
  - `resumeAtMs` 없고 `current < end + max(pad, 0.35)` → none.
  - 끝에 닿음: `gapSec > 0`이고 쉼 전이면 → `gap`(resumeAtMs = nowMs + gapSec×1000, 이때 영상 멈춤).
  - 다음 동작: mode count이고 `playsDone + 1 ≥ count` → advance, 그 밖 → repeat.
- advance: 지금 목록(필터 적용)에서 다음 문장으로 반복 대상을 옮기고 그 문장 처음부터 재생, playsDone 0. 다음 문장이 없으면 반복을 끈다(off).
- 반복 버튼을 눌러 off에서 켤 때: `getSegmentAt(지금 재생 시각)`(없으면 가장 가까운 문장)을 대상으로, 그 문장 처음으로 이동하지 않고 **지금 위치에서 계속 재생**한다(끝에 닿으면 처음으로). one → count 바꿀 때 대상·재생은 그대로, playsDone 0.
- 따라가기 버튼: 클래스 `ear-coach-follow-btn`, 글자 모바일 `⇅`, 데스크톱 `⇅ 따라가기`, `aria-pressed` = 켜짐 여부, 켜짐이면 `is-active`, `title`·`aria-label` `카드 목록 자동 따라가기`. 누르면 `autoFollowPlayback` 바꾸고 저장.
- 자동 따라가기: 재생 시점으로 정한 지금 문장이 바뀌었을 때만, `shouldAutoFollow({ enabled, nowMs, userScrollUntilMs })`가 true면 `scrollToSegment`. 사람이 목록을 터치·휠 하면 `userScrollUntilMs = now + 4000`. 카드를 눌러 재생할 때는 지금처럼 스크롤하지 않는다(누른 카드가 이미 보임).

## 4. 범위 밖
- 셔플, A-B 임의 구간(문장 경계가 아닌 구간), 문장 여러 개 묶어 반복, 전체 영상 반복.
- 반복 모드·대상을 노트에 저장(열 때마다 off로 시작).
- 데스크톱 `agy` 경로, 자막·AI 처리.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] `nextLoopMode`·`loopButtonText` 사례 통과(순환 3단계, 모바일·데스크톱 글자, N=5 글자, seg 없을 때) (Test 16) [자동]
2. [ ] `decideLoopTick` 사례 8개 이상 통과: off none, 끝 전 none, one 끝 repeat, count 1·2번째 끝 repeat, count 3번째 끝 advance, 쉼 시작 gap(resumeAtMs 값), 쉼 중 none, 쉼 끝 repeat/advance (Test 16) [자동]
3. [ ] `shouldAutoFollow` 사례: 꺼짐 false, 켜짐·손댄 지 4초 안 false, 켜짐·4초 뒤 true (Test 16) [자동]
4. [ ] 변이: `decideLoopTick`에서 count 비교를 지운 사본, 쉼을 무시하는 사본, `shouldAutoFollow`가 늘 true인 사본으로 각각 Test 16 실패 [자동]
5. [ ] 화면 검사 `loopCycle`(세로·가로): 재생 시각을 3번째 문장 안으로 두고 반복 버튼 누름 → 글자 `🔂 ∞`, 3번째 카드 버튼 `is-loop-active-btn`, 다른 카드는 아님 / 다시 누름 → `🔂 ×3`, 같은 카드 유지 / 다시 누름 → `🔁 OFF`, 반복 카드 없음 [자동]
6. [ ] 화면 검사 `follow`(세로): 따라가기 켜짐(기본, `aria-pressed="true"`)에서 재생 시각을 마지막 문장으로 → 목록 `scrollTop` 늘고 그 카드가 목록 안에 보임 / 버튼 누름 → `aria-pressed="false"`·설정 `autoFollowPlayback` false, 재생 시각을 첫 문장으로 → `scrollTop` 그대로 [자동]
7. [ ] 화면 검사 기존 규칙 모두 통과(컨트롤 겹침 0, 컨트롤·툴바 화면 안, 카드 활성 밀림 없음 등) — 버튼이 늘어도 컨트롤이 넘치지 않음. 스크린샷 `portrait.png`·`landscape.png`를 열어 컨트롤 줄 확인 [자동]
8. [ ] 데스크톱 글자·동작은 위 정의대로(`loopButtonText` 데스크톱 사례), 설정 3개 기본값 `src/types/settings.ts`에 있음 [자동]
9. [ ] `verify.mjs --set regression` ok, `main.ts` 900줄 한도 통과 [자동]
10. [ ] Android 실기기: BRAT 새 버전에서 영상을 재생하다 반복 버튼을 눌러 지금 문장이 반복되는지, 다시 눌러 「×3」에서 3번 듣고 다음 문장으로 넘어가는지, 재생 중 카드 목록이 지금 문장을 따라오는지(⇅로 끄면 멈추는지) 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
- 1~3, 8: `verify.mjs --set regression`의 `test`(Test 16 출력).
- 4: `EAR_COACH_LOOP_MODULE=<망가뜨린 사본> npm test` 각각 실패 출력.
- 5~7: `verify.mjs`의 `ui`(`cases.json` `expect.loopCycle`·`expect.follow`) + 스크린샷 직접 열어 봄.
- 9: `verify.mjs --set regression --json`.

## 7. 수동 검증 — 사람이 따라 할 번호 절차
1. BRAT로 새 버전 → Obsidian 다시 시작.
2. 아무 영상 노트 열고 재생 → 공통 컨트롤 반복 버튼(`🔁 OFF`)을 한 번 누름 → 지금 문장이 반복되는지.
3. 한 번 더 눌러 `🔂 ×3` → 3번 듣고 다음 문장으로 넘어가는지. 한 번 더 눌러 `🔁 OFF`.
4. 그냥 재생하며 카드 목록이 지금 문장을 따라오는지, `⇅`를 눌러 끄면 멈추는지 보고 버튼.

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 반복 모드를 별도 메뉴가 아니라 **한 버튼 순환**(끔 → ∞ → ×N → 끔)으로: 모바일 컨트롤 줄에 자리가 없고, 반복 앱들이 흔히 쓰는 방식이라서. 대안: 길게 눌러 모드 메뉴 — 모바일에서 찾기 어려움.
- 모드는 「한 문장 무한」·「N번씩 듣고 다음 문장」 두 가지, N 기본 3, 쉼 기본 0초: Repeat Player 스토어 설명은 읽지 못해(JS로 불러옴) 문장 반복 앱의 흔한 방식으로 골랐다. 대안: 전체 반복·묶음 반복 — 범위 밖, 써 보고 필요하면.
- 켤 때 문장 처음으로 되감지 않고 지금 위치에서 계속: 「현재 재생 위치 기준」 요청이고, 듣던 흐름이 끊기지 않게. 대안: 문장 처음으로 이동 — 카드 버튼이 이미 그렇게 함.
- 「다음 문장」은 지금 필터가 걸린 목록 기준: 「📌 고정만」 필터에서 고정 문장만 차례로 돌 수 있어서.
- 자동 따라가기 기본 켬, 사람이 목록을 손대면 4초 쉼: 요청이 「자동 이동되면 좋겠다」이고, 스크롤하다 끌려가는 불편을 막으려고. 끄기는 컨트롤 줄 `⇅` 버튼(설정 화면은 모바일에서 깊어서). 대안: 설정 화면에만 두기.

## 실행 기록
