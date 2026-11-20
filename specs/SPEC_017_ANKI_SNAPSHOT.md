---
id: SPEC_017
title: 영상 장면(스토리보드 프레임) → Anki 카드 그림
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: [SPEC_015, SPEC_016]
---

# SPEC 017 — 영상 장면(스토리보드 프레임) → Anki 카드 그림

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
사전 창 `➕ Anki`로 카드를 저장할 때, 그 자막 문장 시점의 영상 장면 그림을 카드 앞면 `picture` 역할에 넣는다(OVERVIEW 3.2 「이미지는 동영상 스냅샷」, 7.5 「스토리보드 프레임 우선 검증」). 유튜브 iframe은 교차 출처라 픽셀을 캡처할 수 없으므로, 유튜브 스토리보드(탐색 미리보기 스프라이트, `i.ytimg.com/sb/…`)에서 그 시점 칸을 잘라 JPEG로 만든다. 2026-11-21에 실제 응답으로 확인함: 시청 페이지는 L3 320×180(3×3 시트, 2초 간격), Android innertube는 L2 160×90까지 준다. 그림을 얻지 못하면 그림 없이 저장한다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/services/storyboard.ts`(새, obsidian import 없음) — 스펙 글 파싱·시점 → 시트 주소·자르기 칸 계산·응답에서 스펙 꺼내기.
- `src/ui/snapshot.ts`(새) — 시트 바이트를 잘라 JPEG base64로(캔버스), 스토리보드+받기+자르기 합치기.
- `src/services/anki.ts` — `AnkiNoteInput.pictureFilename`, `picture` 역할 값 `<img>`, `snapshotFilename`, `storeSnapshot`, 문구 `addedNoPicture`.
- `src/main.ts` — `plugin.storyboard(videoId)`(시청 페이지 → Android innertube, 영상별 캐시).
- `src/ui/EarCoachView.ts`·`src/ui/DictionaryModal.ts` — 문장 끝 시각·장면 함수 전달, 저장 순서에 장면 넣기.
- `src/ui/SettingsTab.ts` — `picture` 라벨에서 「준비 중」 뺌.
- `tests/fixtures/storyboard/`(실제 스펙 글·사례), `tests/fixtures/anki/_snapshot.json`, `tests/runTests.ts` Test 13, Test 12 사례 추가.
- `tests/ui/entry.ts`·`runUiCheck.mjs`·`tests/ui/fixtures/storyboard-sheet.png`(합성 3×3 색 칸 시트) — 화면 검사 `anki`에 그림 판정.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `parseStoryboardSpec(spec: string): StoryboardLevel[]` — `StoryboardLevel = { level, width, height, count, cols, rows, intervalMs, name, sigh, baseUrl }`. 스펙 형식 `<base>|w#h#count#cols#rows#interval#name#sigh|…`, `level`은 0부터.
- `storyboardFrame(spec: string, sec: number, durationSec?: number | null): StoryboardFrame | null` — `{ url, x, y, width, height, level }`. 고르는 단: `intervalMs > 0`(또는 `durationSec`으로 간격을 셀 수 있는) 단 중 가장 큰 `level`. 칸 번호 `idx = min(count-1, floor(sec*1000/intervalMs))`, 시트 `floor(idx/(cols*rows))`, 시트 안 `k`, `x = (k % cols)*width`, `y = floor(k/cols)*height`. 주소 = base의 `$L`→level, `$N`→name(`$M`→시트 번호), 끝에 `&sigh=<sigh>`(base에 `?`가 없으면 `?sigh=`). 스펙이 비었거나 쓸 단이 없으면 `null`.
- `storyboardFromPlayerResponse(pr)`·`storyboardFromWatchHtml(html)` → `{ spec, durationSec } | null`.
- `snapshotFilename(videoId, sec) = "ear-coach-<videoId>-<floor(sec)>.jpg"`(videoId의 `[^A-Za-z0-9_-]`는 `-`).
- 장면 시각 = 자막 문장 `(start + end) / 2`(end 없으면 start).
- `picture` 역할 값: `pictureFilename`이 있으면 `<img src="<filename>">`, 없으면 빈 값. 앞면 순서는 그대로 문장 → 그림 → 뜻.
- `storeSnapshot(client, getData: () => Promise<string | null>, filename) → Promise<string | null>` — 데이터가 없으면 `null`(호출 없음), 있으면 `storeMediaFile({ filename, data })`; 응답이 글자면 그 이름, 아니면 `filename`; 오류면 `null`.
- 저장 순서: `deckNames → modelNames → modelFieldNames → storeMediaFile → canAddNotes → addNote`(그림 없으면 `storeMediaFile` 없음).
- 문구 `ANKI_MESSAGES.addedNoPicture = "Anki에 저장했습니다 (그림 없음)"` — 새 카드인데 그림을 못 넣었을 때.
- 설정 라벨 `picture: "그림(영상 장면)"`.

## 4. 범위 밖
- 스토리보드보다 큰 그림(영상 프레임 직접 디코딩·서버 캡처), 사용자가 다른 장면 고르기, 썸네일 대체, 이미 저장된 카드에 그림 넣기, 카드 템플릿(CSS) 바꾸기.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] `parseStoryboardSpec`: 실제 시청 페이지 스펙 → 4단(L3 320×180 3×3 2000ms), Android 스펙 → 3단 (Test 13) [자동]
2. [ ] `storyboardFrame` 데이터 사례 6개 이상 통과(0초, 시트 경계, 끝 넘김, interval 0 단만 있을 때 durationSec, 빈 스펙 → null) (Test 13) [자동]
3. [ ] `storyboardFromWatchHtml`·`storyboardFromPlayerResponse`가 fixture에서 스펙·길이를 꺼냄 (Test 13) [자동]
4. [ ] `buildAnkiNote`: `pictureFilename` 있으면 Front = 문장`<br><img src="…">`<br>뜻, 없으면 그전과 같음 (Test 12 note fixture) [자동]
5. [ ] `storeSnapshot` 사례: null → 호출 0·null / 데이터 → storeMediaFile 1회·이름 / 다른 이름 응답 → 그 이름 / 오류 → null (Test 12 `_snapshot.json`) [자동]
6. [ ] 화면 검사 세로·가로 `anki` ok: 호출 순서에 `storeMediaFile`, 저장한 그림을 브라우저에서 풀면 320×180이고 가운데 색이 시트의 기대 칸 색과 같음(±24), note Front에 `<img src="ear-coach-uiCheck0001-…">`; 스토리보드 없음이면 `storeMediaFile` 없이 「Anki에 저장했습니다 (그림 없음)」 [자동]
7. [ ] 변이: `storyboardFrame`의 열·행을 바꾼 사본으로 Test 13 실패 [자동]
8. [ ] `verify.mjs --set regression` ok [자동]
9. [ ] Android 실기기: 단어 `➕ Anki` → AnkiDroid 카드 앞면에 그 문장 장면 그림이 보이는지·쓸 만한지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·2·3. `npm test` Test 13 + `tests/fixtures/storyboard/`
4·5. `npm test` Test 12
6. `ui` + `.scratch/ui/report.json` `anki` detail, `anki-<뷰>.png`
7. `.scratch/mut/` 사본 + `EAR_COACH_STORYBOARD_MODULE`
8. `node .claude/harness/verify.mjs --set regression`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 업데이트(AnkiDroid `happynote2` 덱·AnkiConnect Android 서비스는 SPEC_016 그대로)
2. 영상 자막 단어를 눌러 `➕ Anki` → AnkiDroid에서 카드 앞면 그림 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 그림 출처 = 유튜브 스토리보드, 시청 페이지 먼저(320×180) → Android innertube(160×90) · iframe 픽셀 캡처 불가, OVERVIEW가 스토리보드 우선 · 대안: 썸네일 hqdefault(모든 카드가 같은 그림).
- 장면 시각 = 문장 가운데 · 스토리보드 간격(2초)보다 문장이 길면 앞보다 가운데가 내용에 가까움 · 대안: 문장 시작.
- `storeMediaFile` 뒤 `<img>`를 역할 값에 넣음 · addNote `picture`는 필드 끝에 붙어 그림이 뜻 뒤로 감 · 대안: addNote `picture`.
- 그림 실패 = 그림 없이 저장 + 문구 · 그림 때문에 카드를 잃지 않게 · 대안: 저장 중단.
- JPEG 품질 0.9, 원래 칸 크기(키우지 않음).
- 회차 1 추가: `tests/ui/png.d.ts`(tsc가 tests/ui도 검사해 `.png` import 선언 필요) · 「파일」 절에 없던 시험 보조 파일.

## 실행 기록
- 2026-11-21 회차 1: IMPLEMENTED — 1 ✅ Test 13 「4 watch levels」(L3 320/180/108/3/3/2000), android 3단 · 2 ✅ Test 13 「12 frame cases」(0초·시트 경계 18초·끝 넘김 M11·음수·L0+길이 213·길이 없음 null·빈 스펙 null·5×2 비정사각 2건) · 3 ✅ Test 13 html·player response 추출 · 4 ✅ Test 12 「3 note fixtures」(`note-picture.json` Front 문장<br><img src="ear-coach-dQw4w9WgXcQ-77.jpg"><br>뜻) · 5 ✅ Test 12 「6 snapshot store cases」 · 6 ✅ ui 세로·가로 anki ok: calls [deckNames, modelNames, modelFieldNames, storeMediaFile, canAddNotes, addNote], picture 320×180 rgb [32,64,207](기대 [32,64,208]), 시트 L0/M0, Front `<img src="ear-coach-uiCheck0001-4.jpg">`; 스토리보드 없음 → storeMediaFile 없음 + 「Anki에 저장했습니다 (그림 없음)」; `anki-portrait.png` 열어 봄(「Anki에 저장했습니다」) · 7 ✅ `.scratch/mut/storyboard-swap.ts`(열·행 바꿈) → 「storyboardFrame: 5열×2행…」 AssertionError(처음엔 정사각 사례뿐이라 통과 → 비정사각 사례 추가) · 8 ✅ verify regression harness/build/test/ui ok(build는 1차 TS2307 → `tests/ui/png.d.ts`로 고침) · 실제 응답 확인: dQw4w9WgXcQ 10/43/100초 → L3 M0/M2/M5 칸을 우리 자르기 코드로 320×180 JPEG 9~12KB, 43초 그림 열어 봄(인물 한 장면, 옆 칸 섞임 없음) · 9 ⏳
