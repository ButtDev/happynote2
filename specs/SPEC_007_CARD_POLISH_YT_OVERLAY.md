---
id: SPEC_007
title: 자막 카드 다듬기(포커스 밀림·버튼 룩) + 유튜브 오버레이 줄이기
status: BLOCKED
iterations: 1
max_iterations: 3
depends_on: []
parent: SPEC_004
---

# SPEC 007 — 자막 카드 다듬기(포커스 밀림·버튼 룩) + 유튜브 오버레이 줄이기

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
1.0.7 실기기 사진(`.scratch/inbox/20261120-224850-345/346.jpg`)과 사람 메모: ① 재생 중인 카드가 포커스를 받으면 `border-left: 4px`(1px→4px) 때문에 내용이 오른쪽으로 3px 밀린다. ② 카드 안 버튼(시간·루프·핀·단계 4개)이 제각각 네모라 촌스럽다. ③ 루프로 특정 시점에 이동할 때 유튜브 오버레이(제목줄·진행바·공유·「More videos」 썸네일)가 영상을 가린다. ①은 테두리 두께 대신 안쪽 그림자로 표시해 밀림을 없애고, ②는 모바일 카드 버튼을 상단 툴바와 같은 알약·세그먼트 언어로 맞추고, ③은 모바일에서만 유튜브 기본 컨트롤을 끄고(`controls=0` 등) 영상 상자 위아래 56px을 잘라 제목줄·하단 띠를 화면 밖으로 보낸다. 데스크톱 플레이어 동작·버튼 글자·순서는 그대로.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/utils/youtubeUrlParser.ts` — `buildYouTubeEmbedParams(origin, mobile)`·`buildYouTubeEmbedUrl(videoId, origin, mobile)` 추가(순수 함수).
- `src/ui/components/PlayerBar.ts` — embed 주소 3곳과 `playerVars`를 위 함수로.
- `styles.css` — 활성 카드 표시(전역), 모바일 카드 버튼 블록, 모바일 영상 자르기.
- `tests/fixtures/youtube-embed/*.json` + `tests/runTests.ts` Test 8 — 모바일/데스크톱 파라미터 데이터 시험.
- `tests/ui/runUiCheck.mjs`, `tests/ui/cases.json` — `activeCardNoShift`, `sameHeight`, `videoCrop` 규칙.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 공통 파라미터: `enablejsapi=1, rel=0, modestbranding=1, playsinline=1, origin`. 모바일 추가: `controls=0, iv_load_policy=3, fs=0, disablekb=1`. 데스크톱에는 `controls` 키 없음.
- 활성 카드: `border-left` 두께 변경 없음, `box-shadow: inset 4px 0 0 var(--interactive-accent)`.
- 모바일 카드 버튼: 시간 버튼 = 강조색 옅은 알약(고정폭 숫자), 루프·핀 = 테두리 알약, 높이 30px. 배지 = 알약 20px. 단계 4개 = 한 줄 세그먼트(트랙 안 버튼 28px, 선택만 채움).
- 영상 자르기: `.ear-coach-mobile-top-player .ear-coach-video-box > [id^="ear-coach-player-"]` `top: -56px; height: calc(100% + 112px)`.
- UI 규칙: `activeCardNoShift: 0.5`(첫 카드에 `is-active-playing`을 붙였다 뗄 때 시간 버튼 x 변화 ≤ 0.5px), `sameHeight: [".ear-coach-time-btn", ".ear-coach-mini-btn"]`(±1px), `maxHeight[".ear-coach-step-bar"] ≤ 36`, `videoCrop: 40`(플레이어 요소가 영상 상자보다 위아래로 각각 ≥ 40px 큼).

## 4. 범위 밖
- 버튼 글자·아이콘·순서 변경, 새 버튼, 카드 본문(받아쓰기·힌트) 디자인.
- iframe 안 유튜브 UI 직접 조작(교차 출처), 자체 진행바 추가.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] Test 8: 모바일 파라미터에 `controls=0`·`iv_load_policy=3`·`fs=0`·`disablekb=1`·`rel=0`, 데스크톱에는 `controls` 없음(데이터 시험) [자동]
2. [x] 세로·가로 `activeCardNoShift` ok [자동]
3. [x] 세로·가로 `sameHeight` ok, 가로 `maxHeight .ear-coach-step-bar` ≤ 36 [자동]
4. [x] 세로·가로 `videoCrop` ok, SPEC_002~006 규칙 전부 ok [자동]
5. [x] 변이: HEAD `styles.css`로 `ui` exit 1(`activeCardNoShift`·`videoCrop` 실패), 파라미터 함수의 `controls` 줄을 뺀 사본으로 Test 8 실패 [자동]
6. [x] `landscape.png`·`portrait.png`에서 카드 버튼이 알약·세그먼트로 정돈돼 보임 [자동]
7. [x] `verify.mjs --set regression` → `verify: ok` [자동]
8. [ ] Android 실기기 가로에서 ① 카드 포커스 때 밀림 없음 ② 카드 버튼 룩 ③ 루프 이동 때 유튜브 오버레이가 덜 거슬리는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1. `npm test` Test 8 · 2~4. `ui` + `.scratch/ui/report.json` · 5. `.scratch/mut/` 사본 · 6. 스크린샷 Read · 7. `verify.mjs --set regression`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 새 릴리스로 업데이트 → 가로로 Ear-Coach 열고 카드 몇 개 재생·루프 → 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 모바일 유튜브 `controls=0` · 앱 자체 재생·배속·카드 시간 버튼이 있어 기본 진행바가 중복이고, 진행바·공유·전체화면이 오버레이 대부분 · 대안: 컨트롤 유지하고 자르기만(진행바 남음). 잃는 것: 유튜브 진행바로 임의 탐색·전체화면.
- 위아래 56px 자르기 · 사진상 제목줄 ≈45css, 「More videos」 띠가 아래 ≈60css 안 · 대안: 투명 막(탭 차단, 유튜브 일시정지 화면은 그대로 남음).
- 활성 카드 표시를 전역으로 안쪽 그림자로 · 데스크톱도 같은 밀림이 있고 모양은 거의 같음 · 대안: 모바일만.

## 실행 기록
- 2026-11-20 회차 1: IMPLEMENTED — 1 ✅ `npm test` Test 8 `PASS: params.json mobile=true/false` · 2 ✅ `activeCardNoShift` shift=0(세로·가로) · 3 ✅ `sameHeight` time 30 = mini 30, 가로 step-bar 34 ≤ 36, `noOverflowX .ear-coach-step-bar` 330 ≤ 330 · 4 ✅ `videoCrop` 가로 player y-5 h393 / box y54 h281, 세로 player y38 h385 / box y94 h273, SPEC_002~006 규칙 ok · 5 ✅ 변이: HEAD styles.css → ui exit 1(activeCardNoShift shift=3 = 실기기 밀림, videoCrop, step-bar 84), `params.controls` 줄 뺀 사본 → `AssertionError mobile=true controls` · 6 ✅ landscape/portrait.png: 시간 알약(강조 옅은색), 루프·핀 테두리 알약, 배지 알약, 단계 4개 한 줄 세그먼트·잘림 없음 · 7 ✅ `verify --set regression` → `verify: ok` · 8 ⏳ 실기기
  - 가결정: 가로 검사 뷰포트를 915×412 → 891×411(1.0.6 실기기 진단 값) · 이유: 실기기 목록 폭이 10px 좁아 단계 세그먼트 넘침을 놓침 · 대안: 915 유지. 단계 버튼 글자 10.5px·좌우 5px(4개 한 줄). 검사 테마에 `--color-yellow`·`--color-red` 추가(핀 색).
- 2026-11-20 사람확인(회차 셈 없음): 8 메모 「화면은 깔끔해졌다. 근대 cc 컨트롤이 안되는게 아쉬움」 → CC 버튼은 SPEC_008. ①②③ 판정은 SPEC_008 확인 때 함께.
- 2026-11-20 사람확인(회차 셈 없음): BLOCKED — 8 NG 「Yt 상관없이 가로모드에서 카드 좌우 드래그 안됨, 원래그랬던거 같기도함. 세로에선 됨」. 검사 화면에선 세로·가로 모두 가로 스크롤 요소 없음, 가로에선 리사이저 `display:none`(styles.css:759). 「좌우 드래그」가 무엇인지(경계 폭 조절 / 옵시디언 스와이프) 사람 답 대기. ①②③ 자체 판정은 아직 없음.
