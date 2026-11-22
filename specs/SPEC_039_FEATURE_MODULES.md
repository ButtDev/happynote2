---
id: SPEC_039
title: 기능 모듈 분리 — main.ts는 연결만(src/features/)
status: DONE
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 039 — 기능 모듈 분리 — main.ts는 연결만(src/features/)

> 야간 자가 확정(2026-11-23): 백로그 「대기」 맨 위 「[야간] 기능 모듈 분리」(사람 11-22 구조 개선 2번으로 고름). 동작·화면 변화 없음 → 실기기 ⏳ 없음, BRAT 배포 없음.

## 1. 목표
`src/main.ts`가 898줄(한도 900)이라 새 기능을 더 붙일 수 없다. 네트워크·세션 파이프라인·화면 열기·모바일 AI·입구(명령 등)를 `src/features/`로 옮기고 `main.ts`는 필드·위임 메서드·등록 순서만 둔다(목표 600줄 이하). 동작은 그대로 — 분리 전 main으로 만든 기대값을 분리 뒤 main이 그대로 통과해야 한다.

## 2. 파일
- 새 `src/features/network.ts` — `createDictionary`·`createAnki`·`aiFetch`·`fetchBytes`·`createAudioClip`·`createStoryboard`(모두 `requestUrl`, 응답 JSON 읽기 한 함수로).
- 새 `src/features/sessionPipeline.ts` — `createSessionLoader`(복구 중복 막기 포함), `handleYouTubeTrigger`, `runAgyBatchEnrichment`, `resegmentNoteFile`.
- 새 `src/features/workspaceView.ts` — `activateWorkspaceView`, `restoreSessionForView`, `getActiveEarCoachFile`, `openEarCoachForNoteFile`, `isEarCoachNoteFast`, `registerAutoOpen`(openFile 가로채기·file-open·레이아웃 준비·resolved).
- 새 `src/features/mobileAi.ts` — `aiConfigFromSettings`, `createMobileAiRunner`.
- 새 `src/features/commands.ts` — `registerEntryPoints`(URI·리본·명령 5개·`ear-coach-session` 코드 블록).
- `src/main.ts` — 위 함수로 위임. 공개 이름(다른 파일이 부르는 메서드·필드)은 그대로.
- 새 `tests/wiring/runWiringCheck.mjs` + `tests/fixtures/wiring/expected.json`, `tests/runTests.ts` Test 25(변이용 `EAR_COACH_MAIN`).

## 3. 정의
- 연결 검사: `src/main.ts`를 esbuild로 묶되 `obsidian`은 가짜 모듈(등록을 기록)로, node에서 `onload` → 등록(화면 형식·URI·리본·명령 id와 종류·코드 블록·설정 탭·이벤트·레이아웃 준비·openFile 가로채기), 공개 이름 18개 함수·8개 객체, 동작(`getAiConfig` 4사례, `isEarCoachNoteFast` 6사례, 활성 파일 없을 때 명령 3개 숨김, URI url 없음 안내, 잘못된 URL 안내, 일반 노트는 원래 openFile) → 언로드 뒤 openFile 원래대로.
- `mainMaxLines`: 600.

## 4. 범위 밖
- 동작·문구·화면 바꾸기, 네트워크 오류 계층(재시도·안내 표 — 다음 백로그), 학습 기록 저장소, EarCoachView·SettingsTab 쪼개기.

## 5. 완료 조건
1. [x] `src/main.ts` 600줄 이하, `requestUrl`·`addCommand`·`registerMarkdownCodeBlockProcessor`를 직접 부르지 않음 [자동]
2. [x] 연결 검사가 분리 뒤 main에서 통과하고, 분리 전 main(6b7b60e)에서도 줄 수 말고는 통과(같은 기대값) [자동]
3. [x] 변이: 명령 id 바꾸기·언로드 복원 빼기·폴더 조건 빼기·Groq baseUrl 빼기 각각에서 연결 검사 실패 [자동]
4. [x] 회귀 `verify.mjs --set regression`(harness·build·test·ui) 통과 [자동]

## 6. 자동 검증
1. `wc -l src/main.ts`, `grep -c "requestUrl(\|addCommand(\|registerMarkdownCodeBlockProcessor(" src/main.ts` = 0
2. `node tests/wiring/runWiringCheck.mjs` / `--main <분리 전 main 사본>`
3. `src` 사본 4개를 하나씩 망가뜨려 `--main <사본>/main.ts`
4. `node .claude/harness/verify.mjs --set regression`

## 8. 가결정
- 상태 있는 것(복구 중복 막기·AI 실행 중 표시·스토리보드 캐시·전환 중 경로)은 팩토리 클로저로 · `this` 필드를 늘리지 않고 기능 파일 안에 가둠 · 대안: 기능별 클래스.
- `main.ts`의 공개 메서드는 한 줄 위임으로 남김 · EarCoachView·SettingsTab·sentenceAnki가 `plugin.<이름>`으로 부름 · 대안: 호출하는 쪽을 기능 함수로 바꾸기(파일 더 많이 바뀜).
- 연결 검사는 브라우저 없이 node + esbuild 메모리 번들 · 화면 검사(Chromium)는 main.ts를 싣지 않음 · 대안: 화면 검사에 플러그인 로드 추가(무거움).

## 실행 기록

### 회차 1 — 2026-11-23 야간 (night/SPEC_039 worktree)
1. ✅ `wc -l src/main.ts` → 150 (898에서), `grep -c "requestUrl(\|addCommand(\|registerMarkdownCodeBlockProcessor(" src/main.ts` → 0.
2. ✅ `node tests/wiring/runWiringCheck.mjs` → `wiring OK: 5 commands, 2 events, 18 members, 151 lines — src/main.ts`. 분리 전 main(`git show main:src/main.ts` 사본, 줄 수 검사 넣기 전) → `wiring OK: 5 commands, 2 events, 18 members` — 같은 기대값 통과.
3. ✅ 변이 4개 모두 실패: 명령 id → `등록 commands: [... "ear-coach-resegment-x:check"]`, 언로드 복원 빼기 → `언로드 뒤 openFile 원래대로`, 폴더 조건 빼기 → `isEarCoachNoteFast Other/Talk [iG9CE55wbtY].md`, baseUrl 빼기 → `getAiConfig {"aiProvider":"openai",...}`. `EAR_COACH_MAIN=<변이 main> npm test` → exit 1.
4. ✅ `verify.mjs --set regression` → harness·build·test(Test 25 포함 ALL TESTS PASSED)·ui 모두 exit 0, `verify: ok`.
- 판정: 자동 ✅ 전부, ⏳ 없음(동작·화면 변화 없음) → DONE. 배포 없음.
