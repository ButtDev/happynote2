---
id: SPEC_032
title: 소리 힌트 덩어리를 AI 설명과 맞추기 + 덩어리 영어 글자 표시
status: DONE
iterations: 1
max_iterations: 3
depends_on: [SPEC_031]
after_implemented: true
---

# SPEC 032 — 소리 힌트 덩어리를 AI 설명과 맞추기

> 2026-11-22 사람: 「SPEC_031 8 메모」 버튼 뒤에 글 없이 사진만 보냄(`.scratch/inbox/20261122-173723-530.jpg`). 사진은 앱 3단계 카드: 「🔊 발음 포인트: [미 설 싸이 디 러] /mɪs ˈɝθ ˈaɪ ˈdɪr ə/ — did a lot of가 디더랏오브로, submit a lot of가 써밋어랏오브로 빠르게 연음됩니다.」

## 1. 목표
1.0.39보다 먼저 AI가 분석한 문장에는 `chunkWordIndices`가 없다. 그래서 `pickHintChunk`가 빈칸 ±1 범위를 덩어리로 고른다. 사진 속 문장에서는 그 덩어리가 「Miss Earth I did a」로 낱말 중간에서 끊겼고, 바로 뒤 AI 설명은 did a lot of 이야기를 해서 둘이 어긋났다. 화면에는 힌트가 어느 낱말을 읽은 것인지도 나오지 않는다. 이번에 할 일: (1) `chunkWordIndices`가 없으면 AI 설명(`trapExplanation`)에 적힌 영어 구를 문장 낱말에서 찾아 덩어리로 쓴다. (2) 3단계와 Anki 뒷면에서 힌트 앞에 덩어리 영어를 「did a lot of → [..] /../」 꼴로 붙인다. 2단계는 정답을 드러내지 않도록 그대로 둔다. (3) 앞으로 받는 AI 설명에는 한글 발음 표기를 넣지 말라고 프롬프트에 적는다.

## 2. 파일
- `src/services/soundHint.ts`: `HintSegmentLike.analysis.trapExplanation?`, `explanationChunk(words, explanation)` 새 함수, `pickHintChunk` 순서에 끼움.
- `src/ui/components/SegmentCard.ts`: 3단계 「🔊 발음 포인트」에 `<덩어리> → ` 앞붙임.
- `src/services/anki.ts`·`src/ui/sentenceAnki.ts`: `soundHint.text`가 있으면 Source를 `🔊 <덩어리> → [한글] /IPA/`로 만든다.
- `src/services/aiAnalysis.ts`: 프롬프트 3번(trapExplanation)에 「영어 낱말은 영어 그대로 인용, 한글 발음 표기 금지」를 붙인다.
- 시험: `tests/fixtures/sound-hint/rules.json` `chunk`에 설명 사례 추가, Test 12 `_sentence.json` 기대 Source, Test 15 `promptMustContain`, 화면 검사 `soundHintStep3` 기대 문구.

## 3. 정의
- `pickHintChunk` 순서: ① `chunkWordIndices` → ② `explanationChunk` → ③ 8낱말 이하면 전체 → ④ 빈칸 최소−1 ~ 최대+1 → ⑤ 앞 6낱말.
- `explanationChunk(words, explanation)`: 설명에서 영어 낱말이 이어진 구간(`[A-Za-z']+`가 공백으로만 이어진 것)을 앞에서부터 차례로 본다. 각 구간에서 문장 낱말(소문자, 앞뒤 문장부호 뺌)과 연속으로 일치하는 가장 긴 부분(2~6낱말)을 찾는다. 처음으로 찾은 것을 쓴다. 2낱말 이상짜리가 없으면, 설명에 홀로 나온 낱말 가운데 4글자 이상이면서 기능어가 아닌 첫 낱말 하나를 쓴다. 그것도 없으면 `[]`.
- 화면 3단계: `🔊 발음 포인트: <덩어리 글자> → [한글] /IPA/ — <설명>`. 계산값이 없으면 기존처럼 `phoneticKr`만 쓴다(화살표 없음).
- Anki Source: `🔊 <덩어리 글자> → [한글] /IPA/<br><출처>`.

## 4. 범위 밖
옛 분석 다시 받기(재분석 버튼·자동 재요청), 옛 설명 글에서 한글 표기를 잘라 내기, 2단계 문구, 사전에 없는 낱말 처리(dictionaryapi IPA, SPEC_033 후보), 규칙(한글 변환) 수정, 이미 만든 Anki 카드.

## 5. 완료 조건
1. [x] Test 20 `chunk`: 사진 문장 + 설명 「did a lot of가 디더랏오브로, submit a lot of가 …」 → did a lot of 낱말 번호. 그 밖에 낱말 하나만 있는 설명, 영어 없는 설명(→ 빈칸 대체), `chunkWordIndices` 우선 사례를 넣어 모두 일치. 변이(②단계를 뺀 사본)에서는 실패해야 한다 [자동]
2. [x] 사진 문장의 계산 힌트 실제 출력 2~3개를 실행 기록에 남긴다(Test 20 출력) [자동]
3. [x] Anki Source가 `🔊 <덩어리> → [`로 시작 — Test 12 [자동]
4. [x] 프롬프트에 한글 발음 표기 금지 문구 — Test 15 `promptMustContain` [자동]
5. [x] 화면 검사: 3단계 「🔊 발음 포인트: <덩어리> → [」, 2단계에는 덩어리 영어가 없음. 세로·가로 모두, 스크린샷을 열어 확인 [자동]
6. [x] 회귀 `verify.mjs --set regression` [자동]
7. [x] 실기기에서 사진 속 문장(Miss Earth) 카드를 정답 단계까지 열고, 「🔊 발음 포인트」가 「did a lot of → [..]」로 설명과 맞는지 보고 버튼 [수동]

## 6. 자동 검증
1·2 → `npm test` Test 20 + `EAR_COACH_SOUNDHINT_MODULE` 변이 사본. 3 → Test 12. 4 → Test 15. 5 → `runUiCheck.mjs` + 스크린샷. 6 → verify.

## 7. 수동 검증
BRAT 업데이트 → 사진 속 영상 열기 → Miss Earth 문장 카드를 3단계로 → 보고 버튼.

## 8. 가결정
- 옛 설명 속 철자식 한글(디더랏오브)은 그대로 둔다 · 이유: 「가/로/는」 같은 조사와 붙어 있어 잘라 내다가 설명이 망가지기 쉽다. 덩어리 글자와 계산 힌트가 앞에 오니 어느 쪽이 기준인지 보인다 · 대안: 재분석 버튼(무료 한도를 씀, 다음 SPEC).
- 2단계에는 덩어리 영어를 넣지 않는다 · 이유: 받아쓰기 정답이 드러난다 · 대안: 2단계에도 표시.
- `src/ui/sentenceAnki.ts`는 고치지 않음 · 이유: `segmentSoundHint`가 이미 `text`를 돌려줘 그대로 Anki로 감 · 대안: 없음.
- 따옴표('going to')도 벗겨서 맞춤(낱말 안 아포스트로피 I'm은 남김) · 이유: 화면 검사 시험 문장 설명이 따옴표를 써서 처음엔 못 찾음 · 대안: 없음.
- 설명 매칭을 「8낱말 이하면 전체」보다 먼저 한다 · 이유: 짧은 문장이라도 설명이 가리키는 덩어리만 보여야 한다 · 대안: 긴 문장에만 적용.

## 실행 기록
- 2026-11-22 회차 1: IMPLEMENTED — 1 ✅ Test 20 「17 hangul + 4 ipa + 10 chunk + 5 coverage」 통과(사진 문장+설명 → [7,8,9,10] did a lot of, 낱말 하나 exactly → [2], 영어 없음 → 빈칸 대체, chunkWordIndices 우선, 홀로 나온 the 무시, 따옴표 'going to' → [3,4]), 변이(②단계 뺀 사본) → 「pickHintChunk SPEC_032 사람 사진: 설명 속 did a lot of」 실패 · 2 ✅ 실제 출력 「did a lot of → [디 러 라 러브] /ˈdɪɾ ə ˈlɑɾ əv/」, 「submit a lot of → [썹미 러 라 러브] /səbˈmɪɾ ə ˈlɑɾ əv/」, 「exactly → [익재끌리] /ɪɡˈzækli/」 · 3 ✅ Test 12 Source 「🔊 Did you ever → [디 쥬 에벌] …」 + 화면 검사 `sentenceAnki.soundOnBack` 「🔊 We got up early and went → [위 가 러 펄리 언 웬트] …」 · 4 ✅ Test 15 `promptMustContain` 「never write Korean phonetic spellings in this field」 · 5 ✅ 화면 검사 `soundHintStep3` 세로·가로 「🔊 발음 포인트: going to → [고잉 터] /ˈɡoʊɪŋ tə/ — 'going to'가 …」(고치기 전엔 「So I was going → …」으로 어긋남), `soundHintStep2NoChunk` 「🔊 실제 발음 힌트: [고잉 터] /ˈɡoʊɪŋ tə/」, `sound-hint-portrait.png`·`sound-hint-landscape.png` 열어 봄(정답 단계 보라 글자, 가로 오른쪽 목록 안에서 줄바꿈 정상) · 6 ✅ `verify.mjs --set regression --json` harness·build·test·ui ok · 7 ⏳ 실기기
- 2026-11-22 사람확인: 7 생략 — 「그럴필요없어, 어차피 영상하나뿐인데, 호환작업을 하는건 낭비야.」(log/confirmations.jsonl) → DONE
