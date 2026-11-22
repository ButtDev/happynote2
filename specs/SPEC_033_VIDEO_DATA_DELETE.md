---
id: SPEC_033
title: 설정 화면에서 영상별 저장 데이터 지우기 (볼트 휴지통으로)
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 033 — 설정 화면에서 영상별 저장 데이터 지우기 (볼트 휴지통으로)

> 사람 요청(2026-11-22): 「질문, 생성된 ai 데이터들은 언제, 내 단말에서 지워지니?」 → 답(자동 삭제 없음) 뒤 `[Button pressed: 삭제 기능 SPEC 만들기]`.

## 1. 목표
지금은 영상 데이터(자막·AI 번역/설명·빈칸·핀·재청취 기록)가 영원히 남고, 숨김 폴더라 Obsidian에서 지울 길이 없다. 플러그인 설정 화면에 「🗑 저장된 영상」 목록을 두고, 영상마다 「지우기」 → 확인 창 → 그 영상의 파일 세 종류를 **볼트 휴지통(`.trash`)으로 옮기고** 메모리 사본을 비운다. 명령 팔레트에 기대지 않는다. 기간이 지나면 자동으로 지우는 기능은 하지 않는다(범위 밖).

## 2. 파일
- 새 `src/services/videoData.ts` — obsidian import 없음. 저장소 함수 주입(`VideoDataStore`). 영상 목록 모으기·지울 경로 계산·지우기. 변이용 `EAR_COACH_VIDEODATA_MODULE`.
- 새 `src/ui/videoDataSection.ts` — 설정 화면 목록·확인 창(일반 DOM + `Modal`). 화면 검사 번들에서도 렌더링.
- `src/ui/SettingsTab.ts` — 모바일·데스크톱 모두 맨 아래에 섹션 추가(화면 바뀜).
- `src/services/NoteGenerator.ts` — `forgetSession(videoId)`(메모리 캐시 비우기), 경로 함수 공개(`getPrimarySidecarDir`·`getLegacyPluginSidecarDir`).
- `tests/runTests.ts` Test 21 + `tests/fixtures/video-data/cases.json`.
- `tests/ui/*` — `expect.videoData`(목록 → 지우기 → 확인 → 행 사라짐).
- `main.ts`는 900줄 한도(지금 891)라 늘리지 않거나 최소한만.

## 3. 정의
- 섹션 제목: `🗑 저장된 영상`. 안내 한 줄: `지우면 볼트 휴지통(.trash)으로 옮겨져요. Anki 카드는 그대로예요.`
- 행: `<제목>` + 작은 글씨 `<영상ID> · <크기 KB/MB> · <마지막 저장 YYYY-MM-DD>` + 버튼 `지우기`(class `mod-warning`).
- 영상 0개면: `저장된 영상이 없어요.`
- 확인 창: 제목 `「<제목>」 데이터를 지울까요?`, 본문에 지울 파일 경로 목록, 버튼 `휴지통으로` / `취소`. 끝나면 알림 `🗑 <제목> — 파일 N개를 휴지통으로 옮겼어요`.
- 영상 ID 모으기: (a) 노트 폴더의 `.md` 중 파일명 `[<id>]` 또는 front matter `video_id`, (b) `<노트폴더>/.ear-coach-sessions/*.json`, (c) `<configDir>/plugins/obsidian-ear-coach/sessions/*.json`. 합집합, 마지막 저장 시각 내림차순.
- 제목: 노트 파일명 `<제목> [<id>].md`의 제목 → 없으면 sidecar JSON의 `title` → 없으면 영상 ID.
- 지울 것: 위 (a)(b)(c) 중 그 ID의 존재하는 파일 전부. 방법은 `adapter.trashLocal(path)`(볼트 루트 `.trash`로 이동, 되살릴 수 있음). 노트 `.md`는 `vault.trash(file, false)`. 그 뒤 `NoteGenerator.forgetSession(id)`.
- 지금 Ear-Coach 화면이 그 영상을 보고 있으면 그 화면(leaf)을 닫는다.
- `VideoDataStore` 인터페이스: `listFiles(dir) → string[]`, `exists(path)`, `stat(path) → {size, mtime}|null`, `read(path)`, `trash(path)`, `notes() → {path, videoId?}[]`.

## 4. 범위 밖
- 기간 지나면 자동 정리, 한 번에 전부 지우기, 휴지통 비우기(영구 삭제).
- Anki 카드·AnkiDroid 미디어 삭제.
- Gemini 등 외부 서버 쪽 데이터.
- 옛 데이터 호환·옛 위치 마이그레이션 변경.

## 5. 완료 조건
- [ ] 1. `videoData` 데이터 시험(목록 합집합·제목 대체 순서·정렬·지울 경로·없는 파일은 건너뜀·다른 영상 파일은 안 건드림) + 변이 시험 실패 확인 [자동]
- [ ] 2. 화면 검사 `expect.videoData`: 세로·가로에서 섹션에 행 2개 → 첫 행 `지우기` → 확인 창 → `휴지통으로` → 행 1개, 가짜 저장소 `trash` 호출이 그 영상 경로만, 가로 넘침 없음, 스크린샷 열어 봄 [자동]
- [ ] 3. 지우기 경로에 영구 삭제 API(`adapter.remove`·`vault.delete`·`rmdir`)가 없음 — `grep` [자동]
- [ ] 4. 회귀 통과(`verify.mjs --set regression`, 900줄 한도 포함) [자동]
- [ ] 5. 실기기에서 설정 → 「🗑 저장된 영상」에 영상이 보이고, 하나를 지운 뒤 목록에서 사라졌는지 보고 버튼 [수동]

## 6. 자동 검증
1 → Test 21 + `EAR_COACH_VIDEODATA_MODULE` 망가진 사본. 2 → `node tests/ui/runUiCheck.mjs`, `video-data-<뷰>.png`. 3 → `grep -nE "adapter\.remove|vault\.delete|rmdir" src/services/videoData.ts src/ui/videoDataSection.ts` 결과 없음. 4 → `node .claude/harness/verify.mjs --set regression`.

## 7. 수동 검증
1. BRAT로 새 버전 받기 → Obsidian 설정 → Ear-Coach.
2. 맨 아래 「🗑 저장된 영상」에서 지워도 되는 영상 하나의 `지우기` → `휴지통으로`.
3. 그 영상이 목록에서 사라졌는지 보고 버튼.

## 8. 가결정
- 휴지통(`.trash`)으로 옮김 · 이유: 데이터 삭제는 되돌리기 어려운 결정이라 되살릴 수 있는 쪽을 기본으로 — 사람이 실수해도 복구 가능 · 대안: 영구 삭제(공간 바로 확보, 되돌릴 수 없음 → 사람 결정 필요).
- 진입점 = 설정 화면 맨 아래 목록 · 이유: 명령 팔레트를 못 찾음, 가로 툴바 여유 6px라 버튼 못 넣음, 노트 없이 sidecar만 남은 영상도 보임 · 대안: 노트 길게 누르기 메뉴, 화면 ⋯ 메뉴.
- 확인 창에 지울 경로를 보여 줌 · 이유: 숨김 폴더라 무엇이 지워지는지 알 수 없음 · 대안: 개수만.
- 지운 뒤 되살아남 막기: `NoteGenerator.forgetSession`이 지운 시각을 기억하고, 그 전에 만든 세션(`createdAt` ≤ 지운 시각)은 `saveSessionToNote`가 저장하지 않음 · 이유: 진행 중 AI 분석이 끝나며 파일을 다시 만들 수 있음 · 대안: AI 분석 취소.
- 자동 정리는 이번에 안 함 · 이유: 사람이 고른 건 「삭제 기능」, 자동 삭제는 기간 결정이 필요 · 대안: 다음 SPEC.

## 실행 기록
- 2026-11-22 회차 1: IMPLEMENTED — 1 ✅ Test 21 `tests/fixtures/video-data/cases.json` PASS(영상 4개: sidecar만·옮긴 노트(front matter)·노트+사본 2·옛 사본만, 제목 노트명→sidecar title→ID, 노트 폴더 밖 `[draft0001]` 제외, 이미 없는 사본은 건너뛰어 2개만 휴지통), 변이 vd1(노트 폴더 제한 빼기) → 「listVideoData: 합집합…」 실패, vd2(stat 확인 빼기) → 「deleteVideoData: 있는 파일만 옮김」 실패 · 2 ✅ `runUiCheck` 세로·가로 videoData: 행 [abcDEF12345, xyzOnly0001] → 확인 창 「「How to Speak…」 데이터를 지울까요?」 버튼 휴지통으로|취소, 경로 3개 = trash 호출 3개 → 행 [xyzOnly0001], 알림 「🗑 … 파일 3개를 휴지통으로 옮겼어요」, 넘침 0. `video-data-portrait.png` 열어 봄: 긴 제목 말줄임, `ID · 1.6 MB · 2026-11-22` + 지우기. `video-data-confirm-landscape.png`: 아래 시트에 경로 3줄. UI 변이(지운 뒤 refresh 빼기) → 「videoData rows after [..2개]」 실패 · 3 ✅ `grep -nE "adapter\.remove|vault\.delete|rmdir"` videoData.ts·videoDataSection.ts·SettingsTab.ts 결과 없음(exit 1) · 4 ✅ `verify.mjs --set regression --json` harness·build·test·ui 모두 ok(main.ts 891줄 그대로) · 5 ⏳ 실기기
