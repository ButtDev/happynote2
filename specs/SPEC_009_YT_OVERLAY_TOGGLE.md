---
id: SPEC_009
title: 모바일 유튜브 오버레이 켜기·끄기(YT) 버튼 — CC 버튼 대체
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: []
parent: SPEC_008
---

# SPEC 009 — 모바일 유튜브 오버레이 켜기·끄기(YT) 버튼

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
SPEC_008 CC 버튼이 실기기에서 동작하지 않았다(사람 원문 「Cc 동작안함, 차라리 overlay on/off 버튼이 유용하겠네」). CC 버튼 자리에 `YT` 버튼을 넣는다. 켜면 모바일 플레이어를 유튜브 기본 컨트롤 그대로(`controls=0` 등 없음) 지금 시각에서 다시 만들고 위아래 56px 자르기를 푼다 → 유튜브 자체 메뉴로 자막·자막 언어·진행바를 쓸 수 있다. 끄면 SPEC_007의 깔끔한 화면으로 돌아간다. 기본은 꺼짐. 데스크톱은 그대로.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/utils/youtubeUrlParser.ts` — `buildYouTubeEmbedParams/Url`에 `ytOverlay` 인자, `buildCaptionsCommand` 삭제.
- `src/ui/components/PlayerBar.ts` — CC 버튼·`setCaptions` 삭제, `YT` 버튼·`setYouTubeOverlay(on)`(현재 시각·재생 상태 유지하며 플레이어 다시 만들기).
- `styles.css` — 자르기 선택자에 `.ear-coach-player-wrapper:not(.is-yt-overlay)`, 버튼 모양은 CC 것 이름만 바꿈.
- `tests/fixtures/youtube-embed/params.json`(모바일+ytOverlay 경우 추가), `captions.json` 삭제, `tests/runTests.ts` Test 8.
- `tests/ui/cases.json`, `tests/ui/runUiCheck.mjs` — `visible .ear-coach-overlay-btn`, `overlayToggle` 규칙.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 버튼: 글자 `YT`, 클래스 `ear-coach-btn ear-coach-overlay-btn`, 켜짐 `is-active`·`aria-pressed="true"`, `aria-label`/`title` `유튜브 오버레이 켜기/끄기`. 켜짐이면 플레이어 감싸개에 `is-yt-overlay`.
- 파라미터: 모바일+꺼짐 = SPEC_007 그대로(`controls=0, iv_load_policy=3, fs=0, disablekb=1`) + `cc_load_policy=1`. 모바일+켜짐 = 위 4개 없음 + `cc_load_policy=1`. 데스크톱 변화 없음.
- UI 규칙 `overlayToggle: <버튼 선택자>`: 누르면 버튼 `is-active`, 플레이어 y·높이 = 영상 상자, iframe 주소에 `controls=0` 없음. 다시 누르면 `is-active` 없음, 자르기 ≥ `videoCrop`, 주소에 `controls=0`.

## 4. 범위 밖
- 자막 언어 버튼(앱 자체), 데스크톱 버튼, 상태 저장(앱 다시 열면 꺼짐).

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] Test 8: 모바일 꺼짐/켜짐/데스크톱 파라미터 기대값 일치(데이터) [자동]
2. [x] 세로·가로 `visible .ear-coach-overlay-btn`·`overlayToggle` ok, 가로 컨트롤 줄 ≤ 44·`noOverflowX` ok, 기존 규칙 전부 ok [자동]
3. [x] 변이: ① `ytOverlay`를 무시한 사본 → Test 8 실패 ② 다시 만들기를 건너뛴 사본 → `overlayToggle` 실패 [자동]
4. [x] `landscape.png` 재생 줄에 `YT` 알약이 잘림 없이 보임 [자동]
5. [x] `verify.mjs --set regression` → `verify: ok` [자동]
6. [ ] Android 실기기 가로에서 `YT`를 눌러 유튜브 컨트롤(자막·언어 메뉴)이 나오고 재생 위치가 이어지는지, 다시 눌러 깔끔한 화면으로 돌아오는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·3①. `npm test` Test 8, `.scratch/mut/s009` · 2·3②. `ui` + `.scratch/ui/report.json` · 4. 스크린샷 Read · 5. `verify.mjs --set regression`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 새 릴리스로 업데이트 → 가로로 재생 중 `YT` 두 번 눌러 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 「overlay」 = 유튜브 기본 컨트롤·오버레이로 해석, 켜면 자르기도 풂 · 컨트롤이 있어야 유튜브 자막·언어 메뉴를 쓸 수 있음(CC 대체) · 대안: 자르기만 풀기(컨트롤 없어 자막 메뉴 없음).
- 버튼 글자 `YT` · 재생 줄 여유가 CC 2글자 자리뿐(891 폭에서 여유 0) · 대안: 「오버레이」(넘침).
- 켜고 끌 때 플레이어 다시 만들기 · `controls`는 처음 불러올 때만 먹는 파라미터 · 재생 중이었으면 이어 재생, 아니면 그 위치에서 멈춤.
- `cc_load_policy=1`은 모바일 두 상태 모두 유지 · SPEC_008 기본(자막 켜짐) 유지, 켜짐 상태에선 유튜브 메뉴로 끌 수 있음.

## 실행 기록
- 2026-11-20 회차 1: IMPLEMENTED — 1 ✅ Test 8 `PASS: params.json mobile=true` / `mobile=true ytOverlay` / `mobile=false` · 2 ✅ ui 세로·가로 `visible:.ear-coach-overlay-btn`, `overlayToggle` 켜짐 player y54 h281 = box(가로)·주소에 controls=0 없음, 꺼짐 player y-2 h393(자르기 56)·controls=0, 가로 controls 34 ≤ 44, `noOverflowX` 500 ≤ 500 · 3 ✅ ① `if (mobile)`로 바꾼 사본 → `AssertionError params.json mobile=true ytOverlay: param controls must be absent` exit 1 ② 다시 만들기 앞 `return` 사본 → `ui-check: FAIL overlayToggle`(세로·가로) · 4 ✅ landscape.png: [재생][루프 OFF][배속][YT 테두리 알약] ··· 00:00 한 줄 · 5 ✅ `verify --set regression` → `verify: ok` · 6 ⏳ 실기기
