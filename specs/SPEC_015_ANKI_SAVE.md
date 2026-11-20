---
id: SPEC_015
title: 사전 창 → AnkiDroid 카드 저장 (AnkiConnect Android)
status: DRAFT
iterations: 0
max_iterations: 3
depends_on: [SPEC_013, SPEC_014]
---

# SPEC 015 — 사전 창 → AnkiDroid 카드 저장 (AnkiConnect Android)

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
사전 창(SPEC_013·014)의 단어 칸과 구 칸에 각각 「➕ Anki」 버튼을 두고, 누르면 그 단어(또는 구)·IPA·발음·영어 뜻·자막 문장(해당 낱말 빈칸)을 AnkiConnect Android(`http://127.0.0.1:8765`, Obsidian `requestUrl`)의 `addNote`로 AnkiDroid에 노트 하나로 넣는다. 발음은 `audio: [{url, filename, fields}]`로 AnkiConnect Android가 내려받게 한다. 이미지(영상 스냅샷)는 SPEC_016에서 같은 노트 형식에 붙인다. AnkiConnect Android에는 `createDeck`·`createModel`이 없으므로(지원 액션: version·deckNames·modelNames·modelFieldNames·findNotes·canAddNotes·addNote·storeMediaFile·notesInfo·updateNoteFields·guiBrowse·multi — 2026-11-21 README·라우터 확인) 덱·노트 타입은 AnkiDroid에 이미 있는 것을 고른다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/services/anki.ts` (새) — obsidian import 없음, 요청 함수 주입. `buildAnkiNote(input, settings)`(순수: 필드 HTML·빈칸 문장·audio 배열), `clozeSentence(sentence, target)`(순수), `AnkiConnectClient`(`invoke(action, params)` → `{result, error}` 해석, `version 6`).
- `src/ui/DictionaryModal.ts` — 단어 칸·구 칸에 `➕ Anki` 버튼, 상태 문구.
- `src/ui/EarCoachView.ts` — 사전 창에 자막 문장(segment 글)과 영상 정보 전달.
- `src/types/settings.ts`·`src/ui/SettingsTab.ts` — Anki 설정(덱·노트 타입·필드 대응), 「덱·노트 타입 불러오기」 버튼(`deckNames`·`modelNames`·`modelFieldNames`).
- `src/main.ts` — `requestUrl`로 만든 Anki 클라이언트.
- `styles.css` — 버튼·상태.
- `tests/fixtures/anki/*.json` + `tests/runTests.ts` Test 12 — 노트 만들기·빈칸·응답 해석 데이터 시험.
- `tests/ui/*` — 가짜 Anki 클라이언트로 버튼 → `addNote` 요청 1회·상태 문구 검사(`expect.anki`).

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 설정: `ankiDeck: string`(기본 `"Default"`), `ankiNoteType: string`, `ankiFieldMap: Record<AnkiRole, string>`, `ankiTags: string`(기본 `"ear-coach"`). `AnkiRole` = `"word" | "ipa" | "audio" | "meaning" | "sentence" | "picture" | "source"`.
- 빈칸: `clozeSentence("I'm looking forward to it.", "looking forward to")` → `"I'm ____ it."` — 대소문자 무시, 낱말 경계, 없으면 문장 그대로. 구는 원형이 문장에 없으면 누른 글자부터 같은 낱말 수만큼을 빈칸으로.
- `source` 필드: `<a href="https://youtu.be/<videoId>?t=<초>">영상 제목 mm:ss</a>`.
- 문구: 버튼 `➕ Anki`, 저장 중 `Anki에 저장 중…`, 성공 `Anki에 저장했습니다`, 중복 `이미 Anki에 있는 카드입니다`, 연결 실패 `AnkiConnect Android에 연결하지 못했습니다 — 앱에서 서비스를 켜 주세요`, 설정 없음 `설정에서 Anki 덱·노트 타입을 골라 주세요`.
- 중복: 저장 전 `canAddNotes` → false면 중복 문구, `addNote` 안 함.

[사람 확인 필요: 카드 모양 — 어떤 노트 타입에 넣을까?
 A) AnkiDroid 기본 「Basic (and reversed card)」 — 앞: 빈칸 예문 + 영어 뜻(나중에 그림) / 뒤: 단어·IPA·발음·출처. 카드 2장(문장→단어, 단어→문장). 바로 쓸 수 있음.
 B) 사람이 AnkiDroid에서 Fluent Forever용 노트 타입(필드 Word·Picture·IPA·Audio·Meaning·Sentence·Source, 카드 여러 장)을 직접 만들고, 플러그인은 설정에서 필드를 대응만. 책 방식에 더 가깝지만 처음 한 번 손이 감.
 추천: A로 시작, 설정의 필드 대응은 B도 받도록 만들어 두어 나중에 바꿀 수 있게.]

## 4. 범위 밖
- 영상 스냅샷 이미지(SPEC_016, `picture` 역할은 비워 둠), 노트 타입·덱 만들기(AnkiConnect Android 미지원), 데스크톱 Anki 동기화, 저장한 카드 목록·수정, 한국어 뜻, 0~2단계.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] `clozeSentence` 데이터 사례(낱말·구·원형 불일치·대소문자·문장부호·없음) 8개 이상 통과 (Test 12) [자동]
2. [ ] `buildAnkiNote`가 데이터 사례에서 기대 `deckName`·`modelName`·필드(대응된 이름)·`audio[0].url`·`tags`·`options.allowDuplicate=false`와 같다 (Test 12) [자동]
3. [ ] `AnkiConnectClient`: `{result, error}` 해석 — error 있으면 throw, 연결 실패는 「연결 실패」 종류로 구분 (Test 12, 가짜 요청 함수) [자동]
4. [ ] 화면 검사(세로·가로): 사전 창 단어 칸·구 칸에 `➕ Anki` 버튼, 단어 칸 버튼 누름 → 가짜 클라이언트 `canAddNotes` 1회·`addNote` 1회, 상태 `Anki에 저장했습니다`; 중복 응답이면 `addNote` 0회·`이미 Anki에 있는 카드입니다` (`expect.anki` ok) [자동]
5. [ ] 변이: `clozeSentence` 낱말 경계를 망가뜨린 사본으로 Test 12 실패 [자동]
6. [ ] 기존 규칙 전부 ok, `verify.mjs --set regression` ok, 모바일 import 검사(Test 10) 통과 [자동]
7. [ ] 스크린샷 `anki-portrait.png`에서 버튼·저장 문구가 보인다 [자동]
8. [ ] Android 실기기에서 단어를 눌러 `➕ Anki` → AnkiDroid에 생긴 카드(앞·뒤·발음)를 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·2·3. `npm test` Test 12
4·6. `ui` + `test` + `.scratch/ui/report.json`
5. `.scratch/mut/` 사본 + 일회 러너
7. 스크린샷 Read

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. (처음 한 번) AnkiConnect Android 앱에서 서비스 켜기 — 이미 켰으면 생략
2. BRAT 새 릴리스로 업데이트, 설정에서 「덱·노트 타입 불러오기」 후 덱 고르기
3. 단어를 눌러 `➕ Anki`, AnkiDroid에서 카드 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 전송은 `requestUrl` · 웹뷰 CORS를 피함(AnkiConnect Android는 CORS 헤더를 안 붙이는 것으로 보임) · 대안: `fetch`.
- 발음은 `addNote`의 `audio` url로 · 앱이 내려받아 미디어에 넣음, 우리 쪽에서 바이트를 다루지 않음 · 대안: `storeMediaFile` + data(base64).
- 빈칸은 `____` · Anki 클로즈 문법이 아닌 일반 노트에서도 보임 · 대안: `{{c1::}}`(Cloze 노트 타입 전용).
- 태그 `ear-coach` · 나중에 모아 보기 쉽게.

## 실행 기록
