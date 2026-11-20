# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- 가로모드 다듬기, 최신 배포 BRAT **1.0.12**. SPEC_010 회차 2(1.0.11은 6 NG: 옵시디언 옆 메뉴는 작업 영역을 옆으로 밀어 아래 메뉴를 드러내는 방식 — 사진 확인). 이제 메뉴 열린 동안(`body.ear-coach-drawer-open`) SPEC_004 전체화면 규칙 전체를 `:not`으로 꺼서 옵시디언 기본 배치로 돌림. IMPLEMENTED, ⏳ 6 버튼 보냄. 6 메모(11-21): 사람 추정 「액션바가 스와이프를 맡고 가로에서 없애서 안 됨, 액션바를 되살려야만 된다면 지금이 낫다」 → 1.0.12 실기기 결과를 물음(되면 OK, 안 되면 SPEC_010 DROPPED·스와이프 코드 제거하고 지금 가로 화면 유지가 추천).
- 다음: SPEC_010 6 답 처리. 같은 답에 SPEC_007 8 남은 판정(①카드 밀림 ②버튼 룩)도 포함 → OK면 SPEC_007·SPEC_010 DONE → SPEC_004 마무리·SPEC_002 9·003 7 함께 판정 → 진단 기능(`src/utils/layoutDiagnostics.ts`, 명령 `ear-coach-layout-diagnostics`, `EarCoachView` resize 훅) 제거(backlog).
- 또 NG면(정지 조건 1에 가까움): 진단 명령으로 메뉴 열린 순간 drawer·작업 영역 DOM·transform·z-index를 실기기에서 찍어 확인할 것. 추측 수정 반복 금지.
- 그 뒤 후보: `memory/backlog.md` (자막 품질, 모바일 AI 번역, 사전+AnkiDroid).

## 열린 질문 (사람에게)
- ⏳ SPEC_010 6(+SPEC_007 8 ①②). SPEC_002 9·003 7은 SPEC_004와 함께 판정.
- 사람이 버튼을 다른 SPEC 행으로 누르기도 함 — 내용으로 판단해 기록.

## 주의
- 배포: 실기기 ⏳가 필요한 커밋은 묻지 않고 BRAT 배포(version 3파일 올림 → `git push buttdev main` + 같은 이름 태그 → 릴리스 확인은 `curl` GitHub API, `gh` 없음) 후 ⏳ 요청. 그 밖의 push는 사람 지시 때만. `main.js`는 저장소에 없음.
- 가로 CSS는 `styles.css` 끝 SPEC_002~010 블록. 가로+활성일 때 조상(`:has`) transform·contain 해제, leaf-content `position:fixed`, `.view-content`는 leaf-content 안 absolute inset 0(Obsidian이 leaf-content에 위 82px 패딩), 위 패딩 = `--safe-area-inset-top`(실기기 env는 0).
- 유튜브 embed 파라미터는 `src/utils/youtubeUrlParser.ts` `buildYouTubeEmbedParams/Url`(모바일만 컨트롤 끔), `ytOverlay` 인자(SPEC_009), 자르기 CSS는 `.ear-coach-player-wrapper:not(.is-yt-overlay)`. 데이터 시험 `tests/fixtures/youtube-embed/`(Test 8). 스와이프 판정 `src/utils/swipeGesture.ts`(Test 9, `tests/fixtures/swipe/`).
- 화면 검사 가로 뷰포트는 실기기 891×411. HTML은 실기기를 흉내 낸다: Obsidian 테마 변수(+yellow/red), `button` 높이 40px, `#app` 바깥 여백 40/24px + `contain:layout`, `--safe-area-inset` 30/15, 가로 leaf-content 위 패딩 82px, `.workspace-leaf` transform, 가짜 헤더 48px·내비바 56px. 규칙은 `cases.json` `expect`(SPEC_009 `overlayToggle`, SPEC_010 `swipeDrawer` — 스텁 `app.workspace.leftSplit/rightSplit`). iframe 안 유튜브 UI는 측정 안 됨. 단계 세그먼트·툴바는 891 폭에서 딱 맞음(여유 0) — 글자 늘리면 넘침.
- `styles.css`에 `backdrop-filter`·`filter: blur` 글자 금지(npm test). `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
- Playwright 직접 스크립트는 `chromium.launch({ channel: "chrome" })`로(번들 Chromium 미설치).
