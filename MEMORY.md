# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- 최신 배포 BRAT **1.0.18**. 가로모드(SPEC_002~012) 전부 DONE/DROPPED — 다시 열지 않음(SPEC_010 옆 메뉴 스와이프는 DROPPED, 세로로 돌려서 연다).
- 사전+AnkiDroid 진행 중: SPEC_013 단어 탭 → 사전 창 DONE(1.0.17) → SPEC_014 구(구동사·숙어) 칸 DONE(꼬리표 뗀 버전은 아직 미배포 — 1.0.18엔 「구동사」 꼬리표 있음) → 다음 SPEC_015 AnkiConnect Android 카드 저장(사전 창에 버튼, 덱·노트 타입 결정 필요할 수 있음) → SPEC_016 영상 스냅샷 이미지. 그 뒤 후보: 자막 품질, 모바일 AI 번역(`memory/backlog.md`).

## 열린 질문 (사람에게)
- 꼬리표 제거는 다음 BRAT 배포(SPEC_015)에 같이 나감(사람 선택). SPEC_015 Anki DRAFT — 질문 1(노트 타입 A 기본 Basic(and reversed) / B 직접 만든 Fluent Forever 타입) 답 대기. AnkiConnect Android엔 createDeck·createModel 없음.
- 사람이 버튼을 다른 SPEC 행으로 누르기도 함 — 내용으로 판단해 기록.

## 주의
- 배포: 실기기 ⏳가 필요한 커밋은 묻지 않고 BRAT 배포(version 3파일 올림 → `git push buttdev main` + 같은 이름 태그 → 릴리스 확인은 `curl` GitHub API, `gh` 없음) 후 ⏳ 요청. 그 밖의 push는 사람 지시 때만. `main.js`는 저장소에 없음.
- Test 7 = 지운 기능(SPEC_005 진단)이 main.js·src에 없음(`tests/fixtures/removed-features/`). 시험 `npm test`는 `PATH=tests/fixtures/bin:$PATH`가 있어야 Test 4(agy) 통과 — `verify.mjs`가 넣어 줌.
- 가로 CSS는 `styles.css` SPEC_002~011 블록(그 뒤 SPEC_013 사전 블록). 가로 비율 막대 = 같은 `.ear-coach-mobile-resizer`를 그리드 12px 열로, 왼쪽 열 폭 `--ear-coach-landscape-left`(설정 `mobileLandscapeLeftPercent` 기본 58, 30~70, `src/utils/landscapeSplit.ts`, Test 9), 영상 맞춤 폭 상한 유지. 가로+활성일 때 조상(`:has`) transform·contain 해제, leaf-content `position:fixed`, `.view-content`는 leaf-content 안 absolute inset 0(Obsidian이 leaf-content에 위 82px 패딩), 위 패딩 = `--safe-area-inset-top`(실기기 env는 0).
- 유튜브 embed 파라미터는 `src/utils/youtubeUrlParser.ts` `buildYouTubeEmbedParams/Url`(모바일만 컨트롤 끔), `ytOverlay` 인자(SPEC_009), 자르기 CSS는 `.ear-coach-player-wrapper:not(.is-yt-overlay)`. 데이터 시험 `tests/fixtures/youtube-embed/`(Test 8).
- 화면 검사 가로 뷰포트는 실기기 891×411. HTML은 실기기를 흉내 낸다: Obsidian 테마 변수(+yellow/red), `button` 높이 40px, `#app` 바깥 여백 40/24px + `contain:layout`, `--safe-area-inset` 30/15, 가로 leaf-content 위 패딩 82px, `.workspace-leaf` transform, 가짜 헤더 48px·내비바 56px. 규칙은 `cases.json` `expect`(SPEC_009 `overlayToggle`, SPEC_011 `landscapeResizer` — 합성 PointerEvent로 끌기, 모바일 컨텍스트에선 `page.mouse`가 안 닿음; 끌기 뒤 `landscape-resized.png`, 두 번 눌러 기본으로 되돌린 뒤 `landscape.png`). iframe 안 유튜브 UI는 측정 안 됨. 단계 세그먼트·툴바는 기본 목록 폭 362에서 딱 맞음(여유 0) — 글자 늘리면 넘침.
- `styles.css`에 `backdrop-filter`·`filter: blur` 글자 금지(npm test). `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
- 사전: `src/services/dictionary.ts`(obsidian import 없음, fetcher 주입, 발음은 Commons curid → ogg로 교체, 시험 데이터 `tests/fixtures/dictionary/commons/`), 창 `src/ui/DictionaryModal.ts`, 플러그인 `plugin.dictionary`. 시험 Test 11 + `tests/fixtures/dictionary/`(실제 응답, `_phrases.json` 구동사 후보). 구동사: `lemmaVariants`·`phraseCandidates`(누른 낱말부터만), 창 맨 위 `.ear-coach-dict-phrase`, 화면 검사 `expect.phrase`(going → go to). 화면 검사 `expect.dictionary`는 기본 스크린샷 뒤에 첫 카드를 3단계로 바꿔 누름, `dictionary-<뷰>.png`.
- Playwright 직접 스크립트는 `chromium.launch({ channel: "chrome" })`로(번들 Chromium 미설치).
