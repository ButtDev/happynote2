---
id: SPEC_026
title: 안 들림 핀 문장 → Anki 듣기 카드
status: DONE
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 026 — 안 들림 핀 문장 → Anki 듣기 카드

> 야간 자가 작성(2026-11-22) 초안. 근거·발산은 `docs/review/anki-fluent-forever.md` 5·6절(#3·#4·#10).

## 1. 목표
지금 「📌 안 들림 핀」(`src/ui/components/SegmentCard.ts:90-94`)은 앱 안 필터와 `My_Listening_Weakness.md`(`src/services/WeaknessTracker.ts`)에만 남고 간격 반복으로 이어지지 않는다. 이번에는 핀 문장 카드에 「➕ Anki」를 두어 **문장 듣기 카드**를 만든다: 앞면 = 장면 그림 + 소리 힌트(`analysis.phoneticKr`) + 함정 유형 + 안 들린 부분 빈칸(받아쓰기에서 틀린 낱말, 없으면 문장 전체 그대로), 뒷면 = 원문 + 유튜브 시각 링크. 소리는 질문 결과에 따라 AnkiDroid TTS 템플릿(`{{tts en_US:Sentence}}`) 노트 타입을 쓴다. 단어 카드(SPEC_015)는 바꾸지 않는다.

## 2. 파일
- `src/services/anki.ts`: `buildSentenceNote(input, settings)` 순수 함수, 설정 문장 카드 노트 타입·필드 대응.
- `src/ui/components/SegmentCard.ts`: 핀 켜진 카드에 「➕ Anki」.
- `src/ui/EarCoachView.ts` 또는 새 `src/ui/sentenceAnki.ts`(main.ts 900줄 한도 회피).
- `src/types/settings.ts`, `src/ui/SettingsTab.ts`: 문장 카드 노트 타입.
- 시험: Test 12 데이터 `tests/fixtures/anki/sentence-*.json`, 화면 검사 `expect.anki` 확장.

## 3. 정의 (초안 — 질문 뒤 확정)
- 빈칸: `userDictationAttempts`에서 틀린 낱말 위치 → `____`. 시도 없으면 빈칸 없음.
- 태그: 설정 태그 + `sentence`.

## 4. 범위 밖
영상 원음 구간 추출(약관·기술 위험), 녹음, 단어 카드 모양 변경, 노트 타입 자동 생성(AnkiConnect Android에 `createModel` 없음).

## 5. 완료 조건
- [ ] 1. `buildSentenceNote` 데이터 시험(빈칸·소리 힌트·함정·출처) [자동]
- [ ] 2. 핀 카드에만 「➕ Anki」, 누르면 가짜 클라이언트에 addNote 1회(화면 검사) [자동]
- [ ] 3. 회귀 통과 [자동]
- [x] 4. 실기기에서 핀 문장 「➕ Anki」 → AnkiDroid 카드 앞면 소리·그림·빈칸 보고 버튼 [수동]

## 6. 자동 검증
Test 12 사례 + 변이, `runUiCheck` `expect.anki` 확장(`anki-portrait.png`), `verify.mjs --set regression`.

## 7. 수동 검증
(질문 답에 따라) AnkiDroid에서 노트 타입을 한 번 만드는 단계를 정확한 필드 이름·템플릿 글자와 함께 적는다.

## 질문 (사람) — 답함
- 2026-11-22 사람 「추천대로 전부」: 앞면 소리는 **AnkiDroid TTS 노트 타입을 한 번 만들기**(필드·템플릿 글은 ⏳ 안내에 줌), 한국어 소리 힌트(`phoneticKr`) **넣음**.
- 앞면 소리: **AnkiDroid에서 TTS 노트 타입 한 번 만들기(추천, 필드·템플릿 글은 우리가 줌)** vs 소리 없이 기본 `Basic`.
- 앞면에 한국어 소리 힌트(`phoneticKr`)를 넣을지 — FF는 모국어를 피하지만 이건 번역이 아니라 소리 표기. 추천: 넣음.

## 가결정
- 노트 타입 이름 `happynote2 Listening`, 필드 이름 고정 Sentence·Cloze·Picture·Hint·Source(대응 설정 없음) · 이유: 사람이 한 번 만들 때 글자 그대로 따라 하기 쉬움 · 대안: 단어 카드처럼 필드 대응 설정.
- 받아쓰기에서 틀린 낱말이 없으면 Cloze 빈 값(앞면에 원문을 보이지 않음 — 듣기 카드) · 이유: 「문장 전체 그대로」면 앞면이 읽기 카드가 됨 · 대안: 문장 전체 빈칸.
- 함정 한국어 이름 `src/utils/trapLabels.ts`를 이번에 만듦(SPEC_028이 같이 씀), Test 17 · 시험 데이터는 `tests/fixtures/anki/_sentence.json`(밑줄 — 단어 노트 반복문이 집지 않게).
- 모바일 카드 머리 버튼 줄 `flex-wrap: wrap` · 가로 목록 362px에서 「➕ Anki」가 잘렸음 → 둘째 줄로. SPEC_028 아이콘화 뒤 한 줄로 돌아올 것.

## 실행 기록
- 2026-11-22 회차 1: IMPLEMENTED — 1 ✅ Test 12 `_sentence.json` 노트 3·빈칸 4·대상 확인 4 사례 통과(틀린 낱말 「Did ____ ever … at ____?」, 힌트 「[디쥬 …]<br>연음 · 플랩 t」, SPEED_SPIKE 빠짐), 변이(빈칸 없을 때 원문) → 「buildSentenceNote: 받아쓰기·분석·영상 없음…」 실패, 변이(SPEED_SPIKE 안 뺌) → 실패 · Test 17 trapLabel 7+6 · 2 ✅ 화면 검사 `expect.sentenceAnki` 세로·가로 ok: 핀 2장에만 버튼(btnOnUnpinned 0), 호출 deckNames→modelNames→modelFieldNames→storeMediaFile→canAddNotes→addNote, modelName happynote2 Listening, Picture <img>, 알림 「Anki에 저장했습니다」, 버튼이 카드 안(inside) — 변이(모든 카드에 버튼) → ui exit 1 btnOnUnpinned 5, 변이(줄바꿈 없음) → 가로 inside false · `sentence-anki-portrait.png`·`-landscape.png` 열어 봄: 세로는 한 줄, 가로는 「➕ Anki」가 둘째 줄 · 3 ✅ `verify.mjs --set regression --json` harness·build·test·ui ok · 4 ⏳ 실기기
- 2026-11-22 사람확인(회차 세지 않음): 4 NG 「발음 포인트가 스펠링 기반 한글이라 실제 발음과 다름」 — 카드 앞면 소리·그림·힌트·함정은 나옴(사진). 후속 SPEC_031(한글 힌트 계산·뒷면으로)이 고침, 4는 SPEC_031 8과 함께 다시 물음(⏳)
- 2026-11-22 사람확인: 4 OK (SPEC_031 8로 함께 확인) — 「잘동작함, 개선필요부분 : 문제 출제되는 단어가 카드의 설명하는 포인트와 동떨어졌음.」(log/confirmations.jsonl) → DONE
