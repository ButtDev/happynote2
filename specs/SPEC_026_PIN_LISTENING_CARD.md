---
id: SPEC_026
title: 안 들림 핀 문장 → Anki 듣기 카드
status: READY
iterations: 0
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
- [ ] 4. 실기기에서 핀 문장 「➕ Anki」 → AnkiDroid 카드 앞면 소리·그림·빈칸 보고 버튼 [수동]

## 6. 자동 검증
Test 12 사례 + 변이, `runUiCheck` `expect.anki` 확장(`anki-portrait.png`), `verify.mjs --set regression`.

## 7. 수동 검증
(질문 답에 따라) AnkiDroid에서 노트 타입을 한 번 만드는 단계를 정확한 필드 이름·템플릿 글자와 함께 적는다.

## 질문 (사람) — 답함
- 2026-11-22 사람 「추천대로 전부」: 앞면 소리는 **AnkiDroid TTS 노트 타입을 한 번 만들기**(필드·템플릿 글은 ⏳ 안내에 줌), 한국어 소리 힌트(`phoneticKr`) **넣음**.
- 앞면 소리: **AnkiDroid에서 TTS 노트 타입 한 번 만들기(추천, 필드·템플릿 글은 우리가 줌)** vs 소리 없이 기본 `Basic`.
- 앞면에 한국어 소리 힌트(`phoneticKr`)를 넣을지 — FF는 모국어를 피하지만 이건 번역이 아니라 소리 표기. 추천: 넣음.

## 실행 기록
