---
id: SPEC_052
title: 원음 실패 이유 알리기 — 앞 1분만 허락하는 영상은 정확히 안내하고 「다시」 없애기
status: READY
iterations: 0
max_iterations: 3
depends_on: [SPEC_036, SPEC_042]
---

# SPEC 052 — 원음 실패 이유 알리기

> 2026-11-24 사람 선택 `[Button pressed: 원음 실패 1 추천대로]`. 영상 vOpPMqxLUHg는 ANDROID itag 140 URL이 앞 ~70초만 200, 뒤는 403(PO 토큰 없음 제한). 다른 클라이언트도 막힘. 재현 `.scratch/ytrun/clip.ts`.

## 1. 목표
핀 문장 Anki 저장에서 원음을 못 받으면 **왜** 못 받았는지 알린다. 유튜브가 앞부분만 허락하는 영상이면 「앞부분 1분 정도만」 안내를 하고 소용없는 「다시」 버튼을 없앤다. 카드는 지금처럼 저장하지 않는다. 앞 1분 안 문장은 지금처럼 원음으로 저장된다. 하지 않을 것: 소리 없이 저장, TTS 대체, PO 토큰 우회.

## 2. 파일
- `src/services/audioClip.ts`: 클리퍼가 `ClipOutcome`을 돌려줌. 조각이 실패하면 player를 새로 받아 한 번 더 시도하고, 그래도 403이면 `limited`.
- `src/services/anki.ts`: `ANKI_MESSAGES`에 이유별 문구, `clipFailMessage(reason)`.
- `src/ui/sentenceAnki.ts`: 이유별 문구 돌려주기.
- `src/features/yesterdayQuiz.ts`: `.data`만 씀(동작 같음).
- `src/features/network.ts`: 요청이 던지면 그대로(클리퍼가 `network`로 바꿈).
- 시험: `tests/runTests.ts` Test 23 + `tests/fixtures/audio-clip/cases.json` `failures`, `tests/ui/entry.ts`·`runUiCheck.mjs`(`sentenceAnki.limited`).
- `EarCoachView.ts`는 안 고침(「다시」는 `connection`·`noAudio`일 때만이라 새 문구엔 자동으로 안 붙음).

## 3. 정의
```ts
export type ClipFailReason = "limited" | "blocked" | "network" | "decode";
export type ClipOutcome = { data: string } | { data: null; reason: ClipFailReason };
```
- `limited`: player·머리(0~indexEnd)는 받았는데 조각이 새 URL로도 403.
- `blocked`: player가 200 아님·형식 없음, 또는 머리를 못 받음/색인을 못 읽음, 문장 시각이 색인 밖.
- `network`: 요청이 던짐(오프라인·시간 초과) 또는 조각이 403 아닌 실패.
- `decode`: 디코더가 던지거나 빈 결과.

문구(해요체, Test 28):
- limited: `이 영상은 유튜브가 앞부분 1분 정도만 받게 해 줘서 원음을 못 받아요 — 저장하지 않았어요`
- blocked: `유튜브가 이 영상의 원음을 막아서 저장하지 않았어요`
- network: `원음을 받지 못해 저장하지 않았어요` (기존 `noAudio`, 「다시」 유지)
- decode: `원음을 풀지 못해 저장하지 않았어요`

## 4. 범위 밖
퀴즈 문구 바꾸기(건너뛰기 그대로), 허락 길이 실제 측정, 소리 없이 저장.

## 5. 완료 조건
1. [ ] 클리퍼가 성공 때 `{data}`(WAV base64), 받기 순서·캐시는 그대로 [자동: Test 23]
2. [ ] 실패 4가지가 각 `reason`으로 나옴(조각 403 → 새 player로 한 번 더 → `limited`) [자동: Test 23 `failures`]
3. [ ] 저장 화면: `limited`면 위 문구, 「다시」 버튼 없음, Anki 호출은 deckNames·modelNames·modelFieldNames만 [자동: 화면 검사 `sentenceAnki.limited`]
4. [ ] `network`면 기존 문구 + 「다시」 그대로 [자동: 화면 검사 `sentenceAnki.noAudio`·`retry`]
5. [ ] 실제 영상: vOpPMqxLUHg 3~7초 성공, 100초·300초 `limited`; Rick(dQw4w9WgXcQ) 100초 성공 [자동: `.scratch/ytrun/clip.ts` 출력]
6. [ ] 변이(재시도 끔·limited를 network로) 실패 [자동]
7. [ ] 회귀 통과 [자동]
8. [ ] Android BRAT 업데이트 뒤 vOpPMqxLUHg 영상에서 2분 뒤 핀 문장 「➕ Anki」 → 「앞부분 1분 정도만」 알림이 「다시」 없이 뜨는지 보고 버튼 [수동]

## 6. 자동 검증
1·2·6: `npm test` Test 23(+ `EAR_COACH_AUDIOCLIP_MODULE` 변이 사본). 3·4: `runUiCheck.mjs`. 5: `node --experimental-strip-types .scratch/ytrun/clip.ts <id>`. 7: `verify.mjs --set regression`.

## 8. 가결정
- 제한 판정 = 새 player URL로도 조각 403 · URL 만료와 구분하려고 · 대안: 받을 수 있는 길이를 이진 탐색(요청 많음)
- 반환 모양 `{data}|{data:null,reason}` · 호출자가 `.data`만 보면 예전과 같음 · 대안: 함수에 lastFailure 속성(동시 호출에 약함)

## 실행 기록
