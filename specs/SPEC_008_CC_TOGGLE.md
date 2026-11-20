---
id: SPEC_008
title: 모바일 자막(CC) 켜기·끄기 버튼
status: DROPPED
iterations: 1
max_iterations: 3
depends_on: []
parent: SPEC_007
---

# SPEC 008 — 모바일 자막(CC) 켜기·끄기 버튼

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
SPEC_007(1.0.8)에서 모바일 유튜브 기본 컨트롤을 끄자 화면은 깔끔해졌지만 유튜브 자막(CC) 켜기·끄기가 사라졌다(사람 메모 「cc 컨트롤이 안되는게 아쉬움」). 모바일 재생 컨트롤 줄에 `CC` 알약 버튼을 넣어 YouTube IFrame API의 `loadModule("captions")`/`unloadModule("captions")`로 켜고 끈다. 모바일 기본은 켜짐(`cc_load_policy=1`). 데스크톱은 유튜브 컨트롤이 그대로라 버튼을 넣지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/utils/youtubeUrlParser.ts` — 모바일 파라미터에 `cc_load_policy=1`, `buildCaptionsCommand(on)` 추가.
- `src/ui/components/PlayerBar.ts` — 모바일에서 배속 묶음 뒤에 `CC` 버튼, `setCaptions(on)`.
- `styles.css` — CC 버튼 켜짐/꺼짐 모양.
- `tests/fixtures/youtube-embed/params.json`, `tests/fixtures/youtube-embed/captions.json`, `tests/runTests.ts` Test 8.
- `tests/ui/cases.json` — 가로·세로에 `.ear-coach-cc-btn` 보임, 가로 컨트롤 한 줄 유지.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 버튼: 글자 `CC`, 클래스 `ear-coach-btn ear-coach-cc-btn`, 켜짐일 때 `is-active`, `aria-pressed`.
- 명령: 켜기 `{func:"loadModule", args:["captions"]}`, 끄기 `{func:"unloadModule", args:["captions"]}` (API 플레이어면 메서드 호출, 아니면 postMessage).
- 모바일 파라미터에 `cc_load_policy=1` 추가, 데스크톱엔 없음.

## 4. 범위 밖
- 자막 언어 고르기, 자막 위치·크기, 데스크톱 버튼.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] Test 8: 모바일 `cc_load_policy=1`(데스크톱 없음), `buildCaptionsCommand(true/false)` 기대값 일치(데이터) [자동]
2. [x] 가로·세로 화면 검사에서 `.ear-coach-cc-btn` 보임, 가로 `.ear-coach-player-controls` 높이 ≤ 44·`noOverflowX` ok, 기존 규칙 전부 ok [자동]
3. [x] 변이: `buildCaptionsCommand`의 함수 이름을 바꾼 사본으로 Test 8 실패 [자동]
4. [x] `landscape.png`에서 재생 줄에 `CC` 알약이 잘림 없이 보임 [자동]
5. [x] `verify.mjs --set regression` → `verify: ok` [자동]
6. [ ] Android 실기기 가로에서 `CC`를 눌러 유튜브 자막이 켜지고 꺼지는지(자막이 잘려 보이지 않는지 포함) 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·3. `npm test` Test 8, `.scratch/mut/` 사본 · 2. `ui` · 4. 스크린샷 Read · 5. `verify.mjs --set regression`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 새 릴리스로 업데이트 → 가로로 재생하며 `CC`를 두 번 눌러 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 모바일 기본 자막 켜짐(`cc_load_policy=1`) · 1.0.7 사진에서 자막을 켜고 보고 있었음 · 대안: 기본 꺼짐.
- 버튼 위치: 배속 묶음과 시간 사이 · 가로 재생 줄에 남는 자리 · 대안: 툴바 줄(목록 쪽, 폭 부족).

## 실행 기록
- 2026-11-20 회차 1: IMPLEMENTED — 1 ✅ Test 8 `PASS: captions.json on=true/false`, `params.json mobile=true`(cc_load_policy=1)/`false`(없음) · 2 ✅ ui `visible:.ear-coach-cc-btn` 세로·가로, 가로 controls 34 ≤ 44, `noOverflowX` 500 ≤ 500, 나머지 규칙 ok · 3 ✅ 변이(끄기도 loadModule) → `AssertionError on=false` exit 1 · 4 ✅ landscape.png: [재생][루프 OFF][배속 세그먼트][CC 채움 알약] ··· 00:00 한 줄 · 5 ✅ `verify --set regression` → `verify: ok` · 6 ⏳ 실기기(자막이 위아래 56px 자르기에 가려지는지 포함)
- 2026-11-20 사람확인(회차 셈 없음): 6 NG 「Cc 동작안함, 차라리 overlay on/off 버튼이 유용하겠네」 → CC 버튼 제거, SPEC_009(YT 오버레이 버튼)로 대체. DROPPED.
