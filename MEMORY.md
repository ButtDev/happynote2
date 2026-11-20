# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- 가로모드 다듬기, 최신 배포 BRAT **1.0.11**. SPEC_006(위 빈칸, 1.0.7) DONE. SPEC_007(카드 밀림·버튼 알약·모바일 유튜브 `controls=0`+위아래 56px 자르기, 1.0.8) IMPLEMENTED. SPEC_008(CC 버튼)은 실기기 NG로 DROPPED → SPEC_009(`YT` 버튼: 유튜브 기본 컨트롤 켜기·끄기, 켜면 자르기 풀고 플레이어를 현재 시각에서 다시 만듦, 1.0.10) DONE(실기기 OK).
- 다음: SPEC_010(가로 카드 좌우 스와이프 → `app.workspace.leftSplit/rightSplit.expand()`, 열린 동안 `body.ear-coach-drawer-open`으로 덮개 `visibility:hidden`, 1.0.11) ⏳ 6 대기 — SPEC_007 ①밀림 ②버튼 룩도 같이 묻는 중. OK면 SPEC_007 DONE → SPEC_004 마무리.
- ⏳ 모두 OK면 → SPEC_004 마무리·SPEC_002 9·003 7 함께 판정 → 진단 기능(`src/utils/layoutDiagnostics.ts`, 명령 `ear-coach-layout-diagnostics`, `EarCoachView` resize 훅) 제거(backlog).
- 그 뒤 후보: `memory/backlog.md` (자막 품질, 모바일 AI 번역, 사전+AnkiDroid).

## 열린 질문 (사람에게)
- 자막 언어 A/B 질문은 사람이 YT 오버레이 버튼을 고르면서 사실상 대체됨(유튜브 메뉴 사용).
- ⏳ 대기: SPEC_010 6(+SPEC_007 8). SPEC_005 7은 NG(진단 목적 달성). SPEC_002 9·003 7은 SPEC_004와 함께 판정.
- 사람이 버튼을 다른 SPEC 행으로 누르기도 함(SPEC_006 메모로 CC 질문이 옴) — 내용으로 판단해 기록.

## 주의
- 배포: 실기기 ⏳가 필요한 커밋은 묻지 않고 BRAT 배포(version 3파일 올림 → `git push buttdev main` + 같은 이름 태그 → 릴리스 확인은 `curl` GitHub API, `gh` 없음) 후 ⏳ 요청. 그 밖의 push는 사람 지시 때만. `main.js`는 저장소에 없음.
- 가로 CSS는 `styles.css` 끝 SPEC_002~008 블록. 가로+활성일 때 조상(`:has`) transform·contain 해제, leaf-content `position:fixed`, `.view-content`는 leaf-content 안 absolute inset 0(Obsidian이 leaf-content에 위 82px 패딩), 위 패딩 = `--safe-area-inset-top`(실기기 env는 0).
- 유튜브 embed 파라미터는 `src/utils/youtubeUrlParser.ts` `buildYouTubeEmbedParams/Url`(모바일만 컨트롤 끔), `ytOverlay` 인자(SPEC_009), 자르기 CSS는 `.ear-coach-player-wrapper:not(.is-yt-overlay)`. 데이터 시험 `tests/fixtures/youtube-embed/`(Test 8).
- 화면 검사 가로 뷰포트는 실기기 891×411. HTML은 실기기를 흉내 낸다: Obsidian 테마 변수(+yellow/red), `button` 높이 40px, `#app` 바깥 여백 40/24px + `contain:layout`, `--safe-area-inset` 30/15, 가로 leaf-content 위 패딩 82px, `.workspace-leaf` transform, 가짜 헤더 48px·내비바 56px. 규칙은 `cases.json` `expect`. iframe 안 유튜브 UI는 측정 안 됨. 단계 세그먼트·툴바는 891 폭에서 딱 맞음(여유 0) — 글자 늘리면 넘침.
- `styles.css`에 `backdrop-filter`·`filter: blur` 글자 금지(npm test). `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
