# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- SPEC_022(자동 자막 대소문자·구두점 복원, AI `restoredText` 칸) IMPLEMENTED — ⏳ 8 실기기 버튼 대기(`SPEC_022 8 OK|NG|메모`). 확인엔 **새** 구두점 없는 자동 자막 노트 필요(이미 해석된 카드는 다시 안 보냄). 최신 배포 BRAT **1.0.30**.
- 다음 후보(`memory/backlog.md` 「대기」): 자막 트랙 고르기(화면 방식 질문 필요: 카드 위 메뉴 / 열 때 고르는 창), —

## 열린 질문 (사람에게)
- Anki 2번째 카드 덱: 사람 결정 「덱 덮어쓰기로 해결」(2026-11-21) — 결과 보고 대기. 여전히 「기본」 덱으로 가면 대안은 노트 타입 `Basic`(카드 1장) — AnkiConnect Android엔 카드 덱 옮기는 액션 없음.
- 사람이 버튼을 다른 SPEC 행·메모로 누르기도 함 — 내용으로 판단해 기록(SPEC_017 9 메모 「잘동작함」 → OK 처리).

## 주의
- 실기기 ⏳ 요청 문구엔 사람이 할 준비 단계(설정·덱 만들기 등)를 빠뜨리지 않는다(SPEC_015에서 빠뜨려 회차 낭비).
- 배포: 실기기 ⏳가 필요한 커밋은 묻지 않고 BRAT 배포(version 3파일 올림 → `git push buttdev main` + 같은 이름 태그 → 릴리스 확인은 `curl` GitHub API, `gh` 없음) 후 ⏳ 요청. 그 밖의 push는 사람 지시 때만. `main.js`는 저장소에 없음.
- Test 7 = 지운 기능(SPEC_005 진단)이 main.js·src에 없음(`tests/fixtures/removed-features/`). 시험 `npm test`는 `PATH=tests/fixtures/bin:$PATH`가 있어야 Test 4(agy) 통과 — `verify.mjs`가 넣어 줌.
- 가로 CSS는 `styles.css` SPEC_002~011 블록(그 뒤 SPEC_013 사전 블록). 가로 비율 막대 = 같은 `.ear-coach-mobile-resizer`를 그리드 12px 열로, 왼쪽 열 폭 `--ear-coach-landscape-left`(설정 `mobileLandscapeLeftPercent` 기본 58, 30~70, `src/utils/landscapeSplit.ts`, Test 9), 영상 맞춤 폭 상한 유지. 가로+활성일 때 조상(`:has`) transform·contain 해제, leaf-content `position:fixed`, `.view-content`는 leaf-content 안 absolute inset 0(Obsidian이 leaf-content에 위 82px 패딩), 위 패딩 = `--safe-area-inset-top`(실기기 env는 0).
- 유튜브 embed 파라미터는 `src/utils/youtubeUrlParser.ts` `buildYouTubeEmbedParams/Url`(모바일만 컨트롤 끔), `ytOverlay` 인자(SPEC_009), 자르기 CSS는 `.ear-coach-player-wrapper:not(.is-yt-overlay)`. 데이터 시험 `tests/fixtures/youtube-embed/`(Test 8).
- 화면 검사 가로 뷰포트는 실기기 891×411. HTML은 실기기를 흉내 낸다: Obsidian 테마 변수(+yellow/red), `button` 높이 40px, `#app` 바깥 여백 40/24px + `contain:layout`, `--safe-area-inset` 30/15, 가로 leaf-content 위 패딩 82px, `.workspace-leaf` transform, 가짜 헤더 48px·내비바 56px. 규칙은 `cases.json` `expect`(SPEC_009 `overlayToggle`, SPEC_011 `landscapeResizer` — 합성 PointerEvent로 끌기, 모바일 컨텍스트에선 `page.mouse`가 안 닿음; 끌기 뒤 `landscape-resized.png`, 두 번 눌러 기본으로 되돌린 뒤 `landscape.png`). iframe 안 유튜브 UI는 측정 안 됨. 단계 세그먼트·툴바는 기본 목록 폭 362에서 딱 맞음(여유 0) — 글자 늘리면 넘침.
- `styles.css`에 `backdrop-filter`·`filter: blur` 글자 금지(npm test). `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
- 사전: `src/services/dictionary.ts`(obsidian import 없음, fetcher 주입, 발음은 Commons curid → ogg로 교체, 시험 데이터 `tests/fixtures/dictionary/commons/`), 창 `src/ui/DictionaryModal.ts`, 플러그인 `plugin.dictionary`. 시험 Test 11 + `tests/fixtures/dictionary/`(실제 응답, `_phrases.json` 구동사 후보). 구동사: `lemmaVariants`·`phraseCandidates`(누른 낱말부터)·`phraseCandidatesAround`(앞 1~2낱말 창 포함, 사전 창이 씀, SPEC_019, 화면 검사 `expect.phraseBefore` 「to」→go to), 창 맨 위 `.ear-coach-dict-phrase`, 화면 검사 `expect.phrase`(going → go to). 화면 검사 `expect.dictionary`는 기본 스크린샷 뒤에 첫 카드를 3단계로 바꿔 누름, `dictionary-<뷰>.png`.
- Playwright 직접 스크립트는 `chromium.launch({ channel: "chrome" })`로(번들 Chromium 미설치).
- AnkiConnect Android: `createDeck`·`createModel` 없음(지원: version·deckNames·modelNames·modelFieldNames·findNotes·canAddNotes·addNote(audio/picture url·data)·storeMediaFile·notesInfo·updateNoteFields·guiBrowse·multi). CORS 헤더 없음 → `requestUrl`로.
- Anki: `src/services/anki.ts`(obsidian import 없음, 요청 함수 주입, Test 12 + `tests/fixtures/anki/`, 변이용 `EAR_COACH_ANKI_MODULE`), 플러그인 `plugin.anki`(`invoke`), 화면 검사 `expect.anki`(가짜 클라이언트 `window.__ankiCalls`·`__ankiDuplicate`, `anki-<뷰>.png`). AnkiConnect Android는 외부 미디어 url(upload.wikimedia.org)을 못 받음 — 그림도 data(base64)로 보낼 것 → `inlineAudio`로 requestUrl 받아 data(base64). 실기기 AnkiDroid엔 「Default」 덱이 없을 수 있음 → `resolveAnkiTarget`이 저장 전에 확인·안내. 기본 노트 타입 `Basic (and reversed card)`, Front=문장·그림·뜻 / Back=단어·IPA·발음·출처. node strip-types는 생성자 매개변수 속성(`constructor(private x)`)을 못 읽음.
- 장면 그림(SPEC_017): `src/services/storyboard.ts`(스펙 파싱·칸 계산, Test 13 + `tests/fixtures/storyboard/` 실제 스펙, 변이용 `EAR_COACH_STORYBOARD_MODULE`), 자르기 `src/ui/snapshot.ts`(캔버스, requestUrl 바이트라 오염 없음), `plugin.storyboard(videoId)` 시청 페이지 L3 320×180 → Android innertube L2 160×90. 저장 순서 deckNames→modelNames→modelFieldNames→storeMediaFile→canAddNotes→addNote, Front에 `<img>`. 실제 스토리보드 격자는 모두 정사각(3×3·5×5·10×10) — 열/행 시험엔 비정사각 사례 필요. 화면 검사 합성 시트 `tests/ui/fixtures/storyboard-sheet.png`(esbuild binary 로더 + `tests/ui/png.d.ts`).
- 자막(SPEC_018): 파서 `src/services/captionPayload.ts` `parseCaptionPayload`(srv3 `<s t>`·json3 `tOffsetMs` → `cue.words`), 구두점 없음+단어 시각 80%↑이면 `mergeTimedWords`(쉼 0.25s·4~18단어). 시험 Test 14 + `tests/fixtures/transcript/`(실제 srv3: TED ASR·수동, Rick 구두점 ASR). 변이용 `EAR_COACH_TRANSCRIPT_MODULE`·`EAR_COACH_TRANSCRIPT_SERVICE_MODULE`. 시각 모드 카드 글자는 `tidyAsrWords`(군말 `ASR_FILLER_WORDS` 빼기·I·첫 글자 대문자, SPEC_020, cases.json `tidy`), srv3 `<s>` 한 개에 두 낱말이 들기도 함 → 낱말별로 나눔. 실제 자막 받기는 Android innertube player(`clientName ANDROID 20.10.38`) baseUrl(이미 `fmt=srv3`).
- 모바일 AI(SPEC_021): `src/services/aiAnalysis.ts`(obsidian import 없음, fetch·sleep 주입, Test 15 + `tests/fixtures/ai/cases.json` 합성 응답, 변이용 `EAR_COACH_AI_MODULE`), `plugin.aiFetch`·`runMobileAiEnrichment`(모바일 `activateWorkspaceView` 끝 자동, 대기 = translationKr이 `(AI 정밀 해석 대기 중`로 시작). `main.ts`는 900줄 한도 시험이 있음(지금 891). SPEC_022: `needsTextRestore`(구두점 없음+2낱말↑)·`acceptRestoredText`(낱말 같을 때만) → `seg.text`·`words` 교체, 시험 `cases.json` `restore`·`needsRestore`·`promptMustContain`.
