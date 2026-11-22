---
id: SPEC_025
title: Anki 카드에 문맥 뜻 하나만 + 사전 품사 잘림 고침
status: DONE
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 025 — Anki 카드에 문맥 뜻 하나만 + 사전 품사 잘림 고침

> 야간 자가 작성(2026-11-22) 초안. 근거·발산은 `docs/review/anki-fluent-forever.md` 2·3·6절.

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
지금 카드 앞면엔 품사마다 첫 뜻이 최대 3개 들어가(`src/ui/DictionaryModal.ts:162`) 문맥과 무관한 뜻이 그림을 덮는다(예: run → 「melted or molten」). 또 사전 파서가 품사를 3개에서 잘라(`src/services/dictionary.ts:30`, `:84`) 「I'll be right back」의 부사 뜻이 창에도 카드에도 없다. 이번에는 (a) 품사를 자르지 않고(뜻 상한만 유지) 창에 모두 보이고, (b) 사전 창에서 뜻 한 줄을 눌러 「카드에 쓸 뜻」으로 고르며(고른 뜻 강조), (c) 「➕ Anki」는 고른 뜻 **하나**만 앞면에 넣는다. 고르지 않으면 첫 품사의 첫 뜻 하나. 카드의 다른 필드·노트 타입은 바꾸지 않는다.

## 2. 파일
- `src/services/dictionary.ts`: `MAX_PARTS_OF_SPEECH` 상한 풀기(또는 6).
- `src/services/anki.ts`: `AnkiNoteInput.meanings`를 한 개만 받아도 되게(형식 유지), 고른 뜻 → 입력 만드는 순수 함수 `pickCardMeaning(entry, chosen)`.
- `src/ui/DictionaryModal.ts`: 뜻 `li` 누르면 고름(`is-chosen`), Anki 저장에 고른 뜻 사용.
- `styles.css`: `.ear-coach-dict-def.is-chosen`.
- 시험: Test 11(back 4품사)·Test 12 데이터(`tests/fixtures/anki/`), 화면 검사 `expect.dictionary`에 뜻 누르기.

## 3. 정의
- `pickCardMeaning(entry: DictionaryEntry, chosen: { pos: number; def: number } | null): { partOfSpeech: string; definition: string }[]` — 항상 길이 1(뜻이 없으면 0).
- 고른 뜻 강조 클래스 `is-chosen`. 안내 문구는 없음(누르면 바로 강조).

## 4. 범위 밖
AI 문맥 뜻 자동 선택, 개인 연결 칸, 장면 고르기, 노트 타입·필드 대응 변경, 이미 만든 카드 고치기.

## 5. 완료 조건
- [ ] 1. back 응답에서 adverb 품사가 파싱된다 [자동]
- [ ] 2. 고른 뜻 하나만 Front에 들어가고, 고르지 않으면 첫 뜻 하나 [자동]
- [ ] 3. 사전 창에서 뜻을 누르면 `is-chosen`이 그 뜻에만 붙고 저장 호출 Front에 그 뜻만 있다(화면 검사) [자동]
- [ ] 4. 회귀 통과 [자동]
- [ ] 5. 실기기에서 단어를 눌러 다른 뜻을 고르고 「➕ Anki」 → AnkiDroid 카드 앞면에 그 뜻 하나만 보이는지 보고 버튼 [수동]

## 6. 자동 검증
1·2 Test 11·12 데이터 사례 + 변이(상한 3으로 되돌리면 1 실패, 전체 뜻 넣으면 2 실패). 3 `runUiCheck` `expect.dictionary` 확장, `dictionary-portrait.png` 열어 봄. 4 `verify.mjs --set regression`.

## 7. 수동 검증
1. BRAT 업데이트 → 영상 열기 → 카드 3단계 → 「back」 같은 여러 뜻 단어 누르기 2. 문장에 맞는 뜻 한 줄 누르기 3. 「➕ Anki」 4. AnkiDroid 덱 `happynote2`에서 새 카드 앞면 확인.

## 8. 가결정
- 품사 상한: 풀기 · 이유: 뜻 상한 3이 이미 길이를 막음 · 대안: 6.

## 질문 (사람) — 답함
- 2026-11-22 사람 「추천대로 전부」: 뜻은 **누르기**로 고름(고르지 않으면 첫 뜻 하나).
- 뜻 고르기: **누르기(추천)** vs 고르기 없이 첫 뜻 하나 자동.

## 실행 기록
- 2026-11-22 회차 1: IMPLEMENTED — 1 ✅ Test 11 `back.json` partsOfSpeech [noun, verb, adjective, adverb] 통과(품사 상한 제거 `src/services/dictionary.ts:80-83`), 변이(상한 3 되돌림) → 「back.json: partsOfSpeech」 실패 · 2 ✅ Test 12 `tests/fixtures/anki/_pick.json` 7사례(고른 뜻·안 고름→첫 뜻·범위 밖→첫 뜻·빈 품사 건너뜀·뜻 없음→[]) 통과, 변이(뜻 전부 반환) → 「pickCardMeaning(null)」 실패 · 3 ✅ 화면 검사 `expect.anki.chooseDef: 1` okChosen·okDefault true: 고른 뜻 Front 「<i>verb</i> To greet with &quot;hello&quot;.」, 안 고른 noPic Front 「<i>noun</i> &quot;Hello!&quot; or an equivalent greeting.」, is-chosen 1개, 변이(창이 고른 뜻 무시) → ui exit 1 okChosen false · `anki-portrait.png` 열어 봄: verb 뜻 줄에 왼쪽 강조선·배경 · 4 ✅ `verify.mjs --set regression --json` harness·build·test·ui 모두 ok(변이 복구 뒤 다시) · 5 ⏳ 실기기
- 가결정: 품사 상한은 없앰(뜻 상한 3 유지) · 고른 뜻은 칸(구·단어)마다 따로 · 강조는 왼쪽 강조선+옅은 배경(문구 없음)
- 2026-11-22 사람확인: DONE — 5 ✅ `log/confirmations.jsonl` 「스펙 모두 ok」(실기기 OK) · 나머지 자동 항목은 회차 1 근거 그대로
