---
id: SPEC_002
title: 모바일 가로모드 좌우 배치 (왼쪽 영상, 오른쪽 필터·자막 목록)
status: READY
iterations: 0
max_iterations: 3
depends_on: [SPEC_001]
---

# SPEC 002 — 모바일 가로모드 좌우 배치 (왼쪽 영상, 오른쪽 필터·자막 목록)

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
Android 가로 화면(사람 스크린샷 `.scratch/inbox/20261120-214321-314.jpg`)에서 영상이 위쪽에 납작하게 깔리고(기준선 899×105), 자막 카드는 아래에 거의 안 보인다. 사람 원문 「좌우 배치가 좋을듯」대로, **모바일 뷰가 가로(`orientation: landscape`)일 때만** 왼쪽 열에 영상(16:9)과 재생 컨트롤, 오른쪽 열에 필터 툴바와 자막 카드 목록을 둔다. 세로 배치는 지금 그대로 둔다. 화면 검사에 배치 규칙(좌우 분리·16:9·크기 하한·겹침 0)을 넣어 자동 판정한다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `styles.css` — 「Mobile-Only Isolated Layout」 절 끝에 `@media (orientation: landscape)` 블록 추가. `.ear-coach-mobile-container`를 2열 grid로 바꾸고, `.ear-coach-mobile-top-pane`은 `display: contents`로 풀어 영상 묶음(`.ear-coach-mobile-top-player`)은 왼쪽, 툴바·목록은 오른쪽에 둔다. 상하 리사이저(`.ear-coach-mobile-resizer`)는 가로에서 숨기고, 리사이저가 목록에 넣는 인라인 `flex`·`height`는 가로에서 무시한다(`!important`). 기존 규칙은 지우지 않는다.
- `tests/ui/cases.json` — 뷰포트마다 `expect`(배치 규칙) 추가, 툴바·목록 셀렉터 이름 추가.
- `tests/ui/runUiCheck.mjs` — `expect` 규칙을 읽어 판정, 어긋나면 exit 1. 보고서에 `checks` 배열 추가.
- `harness.json` — `ui` cmd를 `node tests/ui/runUiCheck.mjs --fail-on-overlap`로(검사 강화).
- 제품 TS(`src/`)는 바꾸지 않는다(가결정 참고).

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 가로 판정: CSS `@media (orientation: landscape)`. 모바일 컨테이너는 모바일에서만 생기므로 데스크톱엔 영향 없음.
- 열 비율: 왼쪽 `minmax(0, 55fr)` · 오른쪽 `minmax(0, 45fr)`, 열 사이 경계선 1px.
- 왼쪽 열: 영상 `aspect-ratio: 16 / 9`, 열 너비에 맞추되 열 높이에서 컨트롤 높이를 뺀 만큼을 넘지 않는다. 그 아래 재생 컨트롤(재생·루프·배속·시간).
- 오른쪽 열: 위에 필터 툴바, 아래에 자막 목록(남은 높이 전부, 세로 스크롤).
- `cases.json` `expect` 규칙(뷰포트별):
  - 공통: `overlapVideoControlsPx2 == 0`, `overlayOnVideoPx2 == 0`, 영상·컨트롤·툴바·목록이 뷰포트 안, 자막 카드 ≥ 3.
  - `portrait`: `stacked` — 영상 아래쪽 ≤ 목록 위쪽, 영상 너비 ≥ 380.
  - `landscape`: `sideBySide` — 영상 오른쪽 ≤ 목록 왼쪽, 영상 오른쪽 ≤ 툴바 왼쪽, 영상 너비/높이가 16/9의 ±3% 안, 영상 높이 ≥ 240, 목록 높이 ≥ 280.
- 보고서 `report.json` 뷰포트 항목에 `checks: [{ "name": "...", "ok": true, "detail": "..." }]`.

## 4. 범위 밖
- 유튜브 iframe 안의 overlay(제목·추천·채널 표시) 줄이기 — iframe 안이라 측정 불가, embed 파라미터·자체 컨트롤은 별도 SPEC(로드맵 SPEC_006).
- 좌우 비율을 끌어서 바꾸는 손잡이, 설정 항목 추가.
- 세로 배치 변경, 데스크톱 배치 변경, 자막·사전·AI 기능.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] 가로 915×412에서 영상이 목록·툴바 왼쪽에 있고(`sideBySide`), 16:9 ±3%, 높이 ≥ 240 [자동]
2. [ ] 가로에서 목록 높이 ≥ 280이고 자막 카드 ≥ 3 [자동]
3. [ ] 세로 412×915는 `stacked`, 영상 너비 ≥ 380, 카드 ≥ 3 (기존 배치 유지) [자동]
4. [ ] 두 뷰포트 모두 `overlapVideoControlsPx2 == 0`, `overlayOnVideoPx2 == 0`, 모든 영역이 뷰포트 안 [자동]
5. [ ] `.scratch/ui/landscape.png`를 열어 보면 왼쪽에 영상·재생 버튼, 오른쪽에 필터·자막 카드가 보이고, `portrait.png`는 이전처럼 위 영상·아래 목록 [자동]
6. [ ] 변이: 가로 `@media` 블록을 뺀 `styles.css` 사본으로 `ui`가 exit 1(`sideBySide` 실패) [자동]
7. [ ] `node .claude/harness/verify.mjs --set regression`이 `verify: ok` (ui는 `--fail-on-overlap`) [자동]
8. [ ] `src/`에 변경 없음(`git diff --stat -- src` 비어 있음) — 데스크톱·세로 로직 그대로 [자동]
9. [ ] Android 실기기 가로 화면에서 왼쪽 영상·오른쪽 자막 목록 배치가 쓸 만한지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1~4. `verify.mjs`의 `ui` 출력 + `report.json`의 `checks`(전부 `ok: true`)와 rect 수치 인용
5. 스크린샷 두 장을 Read로 열어 관찰 기록
6. `.scratch/mut/styles.css`(가로 블록 제거) → `node tests/ui/runUiCheck.mjs --fail-on-overlap --css .scratch/mut/styles.css --out .scratch/mut/ui` exit 코드(러너에 `--css` 옵션 추가)
7. `verify.mjs --set regression` 마지막 줄
8. `git diff --stat -- src`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT로 받은 새 릴리스(실행자가 버전을 알려 줌)로 플러그인 업데이트
2. 폰을 가로로 두고 세션을 열어 배치를 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- CSS만으로 배치(`display: contents` + grid) · TS 변경 없이 세로·데스크톱 동작을 그대로 지키고 되돌리기 쉬움 · 대안: `renderMobileWorkspace`에서 가로용 DOM을 따로 만들고 회전 시 다시 그리기(회전마다 iframe 재생성 위험).
- 열 비율 55:45 · 915×412 기준 영상 약 480×270으로 높이 ≥ 240 확보, 목록 폭 ~400px로 카드 버튼이 한두 줄에 들어감 · 대안: 60:40(영상 큼, 카드 좁음).
- 가로에서 상하 리사이저 숨김 · 좌우 배치에선 의미 없음 · 대안: 좌우 리사이저(범위 밖).
- iframe 안 overlay는 이번 SPEC에서 다루지 않음 · 영상이 16:9로 커지면 유튜브 UI가 덜 덮는지 사람 확인으로 먼저 봄 · 대안: 바로 `controls=0`+자체 컨트롤(별도 SPEC).

## 실행 기록
