# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- 최신 배포 BRAT **1.0.22**. 가로모드(SPEC_002~012)·사전(SPEC_013·014)·Anki 저장(SPEC_015·016) 모두 DONE — 다시 열지 않음.
- 다음: **SPEC_017 영상 스냅샷 → Anki 카드 그림** 초안(`/spec-new`). `picture` 역할은 이미 있음(기본 대응 Front, 지금은 빈 값). 그 뒤 후보는 `memory/backlog.md`.

## 열린 질문 (사람에게)
- 없음. SPEC_017 초안에서 물을 것: 그림을 어디서 얻을지(유튜브 iframe은 교차 출처라 픽셀 캡처 불가 — 썸네일 `i.ytimg.com` 등 대안)·카드 앞면에 넣을지.
- 사람이 버튼을 다른 SPEC 행·메모로 누르기도 함 — 내용으로 판단해 기록. 같은 확인을 두 SPEC에 쓸 땐 보고에 미리 적어 둠.

## 주의
- 실기기 ⏳ 요청 문구엔 사람이 할 준비 단계(설정·덱 만들기 등)를 빠뜨리지 않는다(SPEC_015에서 빠뜨려 회차 낭비).
- 배포: 실기기 ⏳가 필요한 커밋은 묻지 않고 BRAT 배포(version 3파일 올림 → `git push buttdev main` + 같은 이름 태그 → 릴리스 확인은 `curl` GitHub API, `gh` 없음) 후 ⏳ 요청. 그 밖의 push는 사람 지시 때만. `main.js`는 저장소에 없음.
- Test 7 = 지운 기능(SPEC_005 진단)이 main.js·src에 없음(`tests/fixtures/removed-features/`). 시험 `npm test`는 `PATH=tests/fixtures/bin:$PATH`가 있어야 Test 4(agy) 통과 — `verify.mjs`가 넣어 줌.
- 가로 CSS는 `styles.css` SPEC_002~011 블록(그 뒤 SPEC_013 사전 블록). 가로 비율 막대 = 같은 `.ear-coach-mobile-resizer`를 그리드 12px 열로, 왼쪽 열 폭 `--ear-coach-landscape-left`(설정 `mobileLandscapeLeftPercent` 기본 58, 30~70, `src/utils/landscapeSplit.ts`, Test 9), 영상 맞춤 폭 상한 유지. 가로+활성일 때 조상(`:has`) transform·contain 해제, leaf-content `position:fixed`, `.view-content`는 leaf-content 안 absolute inset 0(Obsidian이 leaf-content에 위 82px 패딩), 위 패딩 = `--safe-area-inset-top`(실기기 env는 0).
- 유튜브 embed 파라미터는 `src/utils/youtubeUrlParser.ts` `buildYouTubeEmbedParams/Url`(모바일만 컨트롤 끔), `ytOverlay` 인자(SPEC_009), 자르기 CSS는 `.ear-coach-player-wrapper:not(.is-yt-overlay)`. 데이터 시험 `tests/fixtures/youtube-embed/`(Test 8).
- 화면 검사 가로 뷰포트는 실기기 891×411. HTML은 실기기를 흉내 낸다: Obsidian 테마 변수(+yellow/red), `button` 높이 40px, `#app` 바깥 여백 40/24px + `contain:layout`, `--safe-area-inset` 30/15, 가로 leaf-content 위 패딩 82px, `.workspace-leaf` transform, 가짜 헤더 48px·내비바 56px. 규칙은 `cases.json` `expect`(SPEC_009 `overlayToggle`, SPEC_011 `landscapeResizer` — 합성 PointerEvent로 끌기, 모바일 컨텍스트에선 `page.mouse`가 안 닿음; 끌기 뒤 `landscape-resized.png`, 두 번 눌러 기본으로 되돌린 뒤 `landscape.png`). iframe 안 유튜브 UI는 측정 안 됨. 단계 세그먼트·툴바는 기본 목록 폭 362에서 딱 맞음(여유 0) — 글자 늘리면 넘침.
- `styles.css`에 `backdrop-filter`·`filter: blur` 글자 금지(npm test). `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
- 사전: `src/services/dictionary.ts`(obsidian import 없음, fetcher 주입, 발음은 Commons curid → ogg로 교체, 시험 데이터 `tests/fixtures/dictionary/commons/`), 창 `src/ui/DictionaryModal.ts`, 플러그인 `plugin.dictionary`. 시험 Test 11 + `tests/fixtures/dictionary/`(실제 응답, `_phrases.json` 구동사 후보). 구동사: `lemmaVariants`·`phraseCandidates`(누른 낱말부터만), 창 맨 위 `.ear-coach-dict-phrase`, 화면 검사 `expect.phrase`(going → go to). 화면 검사 `expect.dictionary`는 기본 스크린샷 뒤에 첫 카드를 3단계로 바꿔 누름, `dictionary-<뷰>.png`.
- Playwright 직접 스크립트는 `chromium.launch({ channel: "chrome" })`로(번들 Chromium 미설치).
- AnkiConnect Android: `createDeck`·`createModel` 없음(지원: version·deckNames·modelNames·modelFieldNames·findNotes·canAddNotes·addNote(audio/picture url·data)·storeMediaFile·notesInfo·updateNoteFields·guiBrowse·multi). CORS 헤더 없음 → `requestUrl`로.
- Anki: `src/services/anki.ts`(obsidian import 없음, 요청 함수 주입, Test 12 + `tests/fixtures/anki/`, 변이용 `EAR_COACH_ANKI_MODULE`), 플러그인 `plugin.anki`(`invoke`), 화면 검사 `expect.anki`(가짜 클라이언트 `window.__ankiCalls`·`__ankiDuplicate`, `anki-<뷰>.png`). AnkiConnect Android는 외부 미디어 url(upload.wikimedia.org)을 못 받음 — 그림도 data(base64)로 보낼 것 → `inlineAudio`로 requestUrl 받아 data(base64). 실기기 AnkiDroid엔 「Default」 덱이 없을 수 있음 → `resolveAnkiTarget`이 저장 전에 확인·안내. 기본 노트 타입 `Basic (and reversed card)`, Front=문장·그림·뜻 / Back=단어·IPA·발음·출처. node strip-types는 생성자 매개변수 속성(`constructor(private x)`)을 못 읽음.
