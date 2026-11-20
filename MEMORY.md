# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- 가로모드 마무리 단계. 최신 배포 BRAT **1.0.15**. 끝난 것: SPEC_007·SPEC_011(가로 좌우 비율 막대) DONE, SPEC_010(가로 카드 스와이프로 옆 메뉴) DROPPED — 가로에서 옆 메뉴는 세로로 돌려서 연다(다시 시도하지 않음).
- 가로모드 SPEC_002~007·011 모두 DONE(2026-11-21). SPEC_012(진단 기능 제거) IMPLEMENTED — 5 ⏳(가로로 열어도 진단 알림 안 뜸) 답 대기. Test 7은 이제 「지운 기능이 main.js·src에 없음」(`tests/fixtures/removed-features/`).
- 그 뒤 후보: `memory/backlog.md` (자막 품질, 모바일 AI 번역, 사전+AnkiDroid).

## 열린 질문 (사람에게)
- ⏳ SPEC_012 5 버튼 보냄(BRAT 1.0.15 기준).
- 사람이 버튼을 다른 SPEC 행으로 누르기도 함 — 내용으로 판단해 기록.

## 주의
- 배포: 실기기 ⏳가 필요한 커밋은 묻지 않고 BRAT 배포(version 3파일 올림 → `git push buttdev main` + 같은 이름 태그 → 릴리스 확인은 `curl` GitHub API, `gh` 없음) 후 ⏳ 요청. 그 밖의 push는 사람 지시 때만. `main.js`는 저장소에 없음.
- 가로 CSS는 `styles.css` 끝 SPEC_002~011 블록. 가로 비율 막대 = 같은 `.ear-coach-mobile-resizer`를 그리드 12px 열로, 왼쪽 열 폭 `--ear-coach-landscape-left`(설정 `mobileLandscapeLeftPercent` 기본 58, 30~70, `src/utils/landscapeSplit.ts`, Test 9), 영상 맞춤 폭 상한 유지. 가로+활성일 때 조상(`:has`) transform·contain 해제, leaf-content `position:fixed`, `.view-content`는 leaf-content 안 absolute inset 0(Obsidian이 leaf-content에 위 82px 패딩), 위 패딩 = `--safe-area-inset-top`(실기기 env는 0).
- 유튜브 embed 파라미터는 `src/utils/youtubeUrlParser.ts` `buildYouTubeEmbedParams/Url`(모바일만 컨트롤 끔), `ytOverlay` 인자(SPEC_009), 자르기 CSS는 `.ear-coach-player-wrapper:not(.is-yt-overlay)`. 데이터 시험 `tests/fixtures/youtube-embed/`(Test 8).
- 화면 검사 가로 뷰포트는 실기기 891×411. HTML은 실기기를 흉내 낸다: Obsidian 테마 변수(+yellow/red), `button` 높이 40px, `#app` 바깥 여백 40/24px + `contain:layout`, `--safe-area-inset` 30/15, 가로 leaf-content 위 패딩 82px, `.workspace-leaf` transform, 가짜 헤더 48px·내비바 56px. 규칙은 `cases.json` `expect`(SPEC_009 `overlayToggle`, SPEC_011 `landscapeResizer` — 합성 PointerEvent로 끌기, 모바일 컨텍스트에선 `page.mouse`가 안 닿음; 끌기 뒤 `landscape-resized.png`, 두 번 눌러 기본으로 되돌린 뒤 `landscape.png`). iframe 안 유튜브 UI는 측정 안 됨. 단계 세그먼트·툴바는 기본 목록 폭 362에서 딱 맞음(여유 0) — 글자 늘리면 넘침.
- `styles.css`에 `backdrop-filter`·`filter: blur` 글자 금지(npm test). `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
- Playwright 직접 스크립트는 `chromium.launch({ channel: "chrome" })`로(번들 Chromium 미설치).
