---
id: SPEC_040
title: 학습 기록 저장소 — 핀·빈칸·재생 위치·퀴즈를 파일 하나에(learningStore)
status: DONE
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 040 — 학습 기록 저장소 — 핀·빈칸·재생 위치·퀴즈를 파일 하나에(learningStore)

> 야간 자가 확정(2026-11-23): 백로그 「대기」 맨 위 「[야간] 학습 기록 저장소」(사람 11-22 구조 개선 3번째로 고름). 화면 변화 없음 → 실기기 ⏳ 없음, BRAT 배포 없음.

## 1. 목표
지금 학습 기록은 영상마다 노트 세션 안에 흩어져 있어 「여러 영상에 걸친」 기능(오늘의 5문장·어제 영상 퀴즈·이어 보기)을 만들 수 없다. 영상을 가로지르는 학습 기록을 볼트 안 파일 하나(`schemaVersion` 칸)에 모으는 순수 저장소 `src/services/learningStore.ts`를 만든다(파일 읽기·쓰기는 주입, 시험은 데이터로). 플러그인에 `plugin.learning`으로 붙이고, **지금부터 생기는 핀 켜기·끄기만** 기록한다. 빈칸 결과·재생 위치·퀴즈 결과는 API만 두고 그것을 쓰는 기능 SPEC에서 연결한다. 옛 노트의 핀을 옮기지 않는다(사람 11-22 「호환작업은 낭비」).

## 2. 파일
- 새 `src/services/learningStore.ts` — obsidian import 없음.
- 새 `src/features/learning.ts` — `createLearningStore(plugin)`: `app.vault.adapter`로 `<manifest.dir>/learning.json` 읽기·쓰기, 쓰기 실패는 `diagnostics.record("학습 기록", err)`.
- `src/main.ts` — `public learning` 필드 한 줄.
- `src/ui/EarCoachView.ts` — `onTogglePin`에서 `plugin.learning.setPin(...)` (기다리지 않음).
- 새 `tests/fixtures/learning/cases.json`, `tests/runTests.ts` Test 26(변이용 `EAR_COACH_LEARNING_MODULE`).
- `tests/fixtures/wiring/expected.json` — `publicObjects`에 `learning`.

## 3. 정의
- `LEARNING_SCHEMA_VERSION = 1`. 파일 모양: `{ "schemaVersion": 1, "pins": PinRecord[], "blanks": BlankRecord[], "positions": { [videoId]: PositionRecord }, "quizzes": QuizRecord[] }`.
- `PinRecord { videoId, start, text, pinnedAt }` · `BlankRecord { videoId, start, word, ok, at }` · `PositionRecord { seconds, step?, at }` · `QuizRecord { videoId, at, total, correct }`.
- 같은 핀 = 같은 `videoId` + `start` 차이 0.5초 미만(WeaknessTracker와 같은 기준). 다시 켜면 `pinnedAt`·`text`만 새로.
- 상한: `blanks` 2000, `quizzes` 500(오래된 것부터 버림), `positions` 200개 영상(`at`이 오래된 것부터 버림). 핀은 상한 없음.
- 읽기: 파일 없음·JSON 아님·모양 다름 → 빈 기록. `schemaVersion`이 1보다 크면 **읽기 전용**(쓰지 않음 — 새 판 데이터를 덮지 않음). 칸 하나가 깨졌으면 그 칸만 버림.
- 쓰기는 한 줄로 줄 세움(동시에 두 번 불러도 마지막 상태가 남음), 바꾼 뒤 바로 저장.
- 조회: `pins()`(pinnedAt 새것부터), `wrongBlanks(sinceIso?)`(가장 최근 결과가 틀림인 낱말만, 새것부터), `position(videoId)`, `quizzes(videoId?)`.

## 4. 범위 밖
- 화면 바꾸기, 빈칸·재생 위치·퀴즈 기록 연결(쓰는 기능 SPEC에서), 옛 노트 핀 옮기기, 오늘의 5문장·이어 보기·퀴즈 자체.

## 5. 완료 조건
1. [x] Test 26: `cases.json` 시나리오(핀 켜기·같은 핀·끄기, 빈칸 최근 결과, 위치 상한, 퀴즈 상한, 깨진 파일·새 판 읽기 전용, 동시 쓰기 순서)가 통과 [자동]
2. [x] 변이: 같은 핀 기준 빼기·새 판 읽기 전용 빼기·상한 빼기·쓰기 줄 세우기 빼기 각각에서 Test 26 실패 [자동]
3. [x] 연결 검사 `publicObjects`에 `learning`, `EarCoachView` 핀 토글이 `learning.setPin`을 부름(grep) [자동]
4. [x] 회귀 `verify.mjs --set regression`(harness·build·test·ui) 통과 [자동]

## 6. 자동 검증
1. `npm test` Test 26
2. `src/services/learningStore.ts` 사본 4개를 망가뜨려 `EAR_COACH_LEARNING_MODULE=<사본> npm test`
3. `node tests/wiring/runWiringCheck.mjs`, `grep -n "learning.setPin" src/ui/EarCoachView.ts`
4. `node .claude/harness/verify.mjs --set regression`

## 8. 가결정
- 파일 위치 `<manifest.dir>/learning.json`(볼트 안 `.obsidian/plugins/obsidian-ear-coach/`) · 노트 목록·검색을 어지럽히지 않고 플러그인 데이터와 함께 다님 · 대안: 노트 폴더에 보이는 `ear-coach-learning.json`, `saveData`(설정과 섞임).
- 기록 연결은 핀만 · 빈칸은 입력마다 검사돼 「틀림」 기준을 쓰는 기능이 정해야 함, 위치·퀴즈는 쓰는 쪽이 아직 없음 · 대안: 전부 지금 연결.
- 상한 2000/500/200 · 1년 써도 파일 수백 KB 안 · 대안: 날짜로 자르기.

## 실행 기록

### 회차 1 — 2026-11-23 야간 (night/SPEC_040 worktree)
1. ✅ `npm test` → `[Test 26] ... -> PASS: 10 scenarios (same pin <0.5s, latest blank result, caps 2000/500/200, broken file, schema 2 read-only, serialized writes).`
2. ✅ 변이 4개 모두 exit 1: 같은 핀 `p.start === start` → `[핀 켜기·같은 핀·끄기] pins`, 읽기 전용 빼기 → `[새 판(schemaVersion 2) ...] writes`, 상한 1e9 → `[재생 위치는 영상 200개까지...] positionCount`, 쓰기 줄 세움 빼기 → `[느린 첫 쓰기가 나중 상태를 덮지 않음] 마지막 상태가 파일에`.
3. ✅ `node tests/wiring/runWiringCheck.mjs` → `wiring OK: 5 commands, 2 events, 18 members, 154 lines`(expected.json `publicObjects`에 `learning`). `src/ui/EarCoachView.ts:534` `void this.plugin.learning.setPin(this.session.videoId, s.start, s.text, s.isPinned)`. 화면 검사 가짜 플러그인(`tests/ui/entry.ts`)에 `learning.setPin` 추가.
4. ✅ `verify.mjs --set regression` → harness·build·test·ui 모두 exit=0, `verify: ok`.
- 함정: node strip-types가 생성자 매개변수 속성을 못 읽어 필드 대입으로 바꿈(MEMORY에 이미 있음).
- 판정: 자동 ✅ 전부, 화면 변화 없음 → DONE. 배포 없음.
