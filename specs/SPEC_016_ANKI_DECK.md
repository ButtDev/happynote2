---
id: SPEC_016
title: Anki 기본 덱 happynote2 고정 + 덱 없음 안내
status: READY
iterations: 0
max_iterations: 3
depends_on: []
parent: SPEC_015
---

# SPEC 016 — Anki 기본 덱 happynote2 고정 + 덱 없음 안내

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
SPEC_015 실기기 확인에서 기본 덱 `Default`가 AnkiDroid에 없어 저장이 실패했다(「Couldn't get deck ID」). 사람 메모(「고를수 없다면 happynote2 로 고정하는건 어때?」, SPEC_015 8 메모)대로 기본 덱을 `happynote2`로 바꾼다. 이미 저장된 설정의 `Default`도 `happynote2`로 옮긴다. AnkiConnect Android에는 `createDeck`이 없어 플러그인이 덱을 만들 수 없으므로, 덱이 없으면 AnkiDroid에서 그 이름으로 덱을 만들라고 안내한다. 설정에서 다른 덱을 고르는 기능은 그대로 둔다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/types/settings.ts` — `ankiDeck` 기본값 `"Default"` → `"happynote2"`.
- `src/services/anki.ts` — `ANKI_DEFAULT_DECK`, `migrateAnkiDeck(saved)`(순수), 덱 없음 문구 변경.
- `src/main.ts` — `loadSettings`에서 `migrateAnkiDeck` 적용.
- `tests/fixtures/anki/_target.json`·`_migrate.json`, `tests/runTests.ts` Test 12 — 데이터 시험.
- `tests/ui/runUiCheck.mjs`·`tests/ui/entry.ts` — 덱 이름·문구 기대값.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `ANKI_DEFAULT_DECK = "happynote2"`.
- `migrateAnkiDeck(saved: string | undefined | null): string` — `"Default"`·빈 값·없음 → `"happynote2"`, 그 밖은 그대로(`"English"` → `"English"`, `"happynote2"` → `"happynote2"`).
- 덱 없음 문구: `Anki에 「<덱>」 덱이 없습니다 — AnkiDroid에서 「<덱>」 덱을 만들거나 설정에서 「덱·노트 타입 불러오기」로 골라 주세요`. 노트 타입 없음 문구는 SPEC_015 그대로.

## 4. 범위 밖
- 덱 자동 생성(AnkiConnect Android 미지원), 노트 타입 기본값 변경, 영상 스냅샷(다음 SPEC).

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] `DEFAULT_EAR_COACH_SETTINGS.ankiDeck === "happynote2"` (Test 12) [자동]
2. [ ] `migrateAnkiDeck` 데이터 사례 5개 이상 통과 (Test 12) [자동]
3. [ ] `resolveAnkiTarget`: 덱 목록에 `happynote2`가 없으면 위 덱 없음 문구 + `deckNames`만 호출, 있으면 저장 진행 (Test 12 `_target.json`) [자동]
4. [ ] 화면 검사 세로·가로 `anki` ok: 기본 덱 `happynote2`로 `addNote`(note.deckName), 덱 목록 `["기본"]`이면 새 문구·addNote 0회 [자동]
5. [ ] 변이: `migrateAnkiDeck`이 `Default`를 그대로 두는 사본으로 Test 12 실패 [자동]
6. [ ] `verify.mjs --set regression` ok [자동]
7. [ ] Android 실기기: AnkiDroid에 `happynote2` 덱이 있는 상태에서 단어 `➕ Anki` → 카드(앞·뒤·발음)를 보고 버튼 — SPEC_015 8과 함께 판정 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·2·3·5. `npm test` Test 12, `.scratch/mut/` 사본 + `EAR_COACH_ANKI_MODULE`
4·6. `ui` + `.scratch/ui/report.json` `anki` detail

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. (처음 한 번) AnkiDroid에서 덱 `happynote2` 만들기 — 플러그인이 만들 수 없음
2. BRAT 업데이트 → 단어를 눌러 `➕ Anki` → AnkiDroid 카드 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 저장된 `Default`를 `happynote2`로 옮김 · 실기기 AnkiDroid엔 `Default`가 없었고, 1.0.21에서 「불러오기」를 누르면 설정 전체가 저장돼 기본값만 바꿔선 반영이 안 됨 · 대안: 기본값만 변경.

## 실행 기록
