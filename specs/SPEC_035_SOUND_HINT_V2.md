---
id: SPEC_035
title: 소리 힌트 다듬기 — 어색한 규칙 고침 + 축약(gonna) + 사전에 없는 낱말은 dictionaryapi IPA로
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: [SPEC_031, SPEC_032]
---

# SPEC 035 — 소리 힌트 다듬기 (규칙·축약·IPA 대체)

> 2026-11-22 사람: 「바로꺼, 소리, 축약, ipa 다비슷한성격이니 한번에해」 — MEMORY 「다음 후보」 세 가지(소리 규칙 어색한 곳, 축약 규칙, 사전에 없는 낱말 → dictionaryapi IPA)를 한 SPEC으로.

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
SPEC_031 소리 힌트의 세 가지 약점을 고친다. (A) 어색한 규칙 넷: -ing 앞 k가 ㄲ이 됨(walking → 워낑), f·sh + ㅣ가 퓌·쉬가 됨(finishing → 퓌니슁), 낱말 경계를 넘어 t+s → ㅉ(at six → 엇 찍스), 경계의 같은 비음이 하나로 줄어 n이 빠짐(1990 → 나인티 나이니). (B) 축약: 덩어리 안 「going to」「want to」 등을 실제 말소리(gonna·wanna…)로 계산한다. (C) CMUdict-lite에 없는 낱말이 있으면 지금은 계산을 포기하고 AI 값을 보이는데, 이번엔 dictionaryapi.dev의 IPA(미국 발음 우선)를 ARPAbet으로 바꿔 같은 규칙으로 계산한다. 받아 오는 동안·못 받으면 지금처럼 AI 값. 노트 유형·Anki 필드 구성은 바꾸지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/services/soundHint.ts`: 규칙 A 넷 고침, `CONTRACTIONS`·`hintLookupWords`(펼친 낱말 + 축약 적용), `ipaToArpabet`, `missingHintWords`.
- `src/services/pronFallback.ts`(새, obsidian import 없음): `PronFallback` — 기본 사전 + IPA로 채운 낱말 Map, `ensure(words)`(없는 낱말만 한 번씩 받아 옴, 실패도 기억).
- `src/services/cmudictLite.ts`: 사전을 `PronFallback`으로 감쌈, `setPronunciationFetcher`, `ensureSegmentPronunciations(seg)`.
- `src/services/dictionary.ts`: `DictionaryEntry.ipaUs`(오디오 `-us` 짝 글자 → `oʊ` 들어간 글자 → `phonetic`), `pickUsIpa(json)`.
- `src/main.ts`: 시작 때 `setPronunciationFetcher`(사전 `lookup` → `ipaUs`).
- `src/ui/components/SegmentCard.ts`: 계산값이 없으면 `ensureSegmentPronunciations` 뒤 새로 받은 낱말이 있을 때만 다시 그림.
- `src/ui/sentenceAnki.ts`: 노트 만들기 전에 `ensureSegmentPronunciations`를 기다림.
- 시험: Test 20 `tests/fixtures/sound-hint/rules.json`(규칙 A·축약 사례 추가), `tests/fixtures/sound-hint/ipa.json`(새, dictionaryapi 실제 응답의 IPA 글자 → ARPAbet·한글 기대값 + `PronFallback` 가짜 fetch 사례), Test 11 `pickUsIpa` 사례(`tests/fixtures/dictionary/ipa-us.json`, 실제 응답).

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 규칙 A
  1. 낱말 끝 `IH0 NG`(-ing) 바로 앞 K·P는 된소리로 만들지 않는다(walking → 워킹, looking → 루킹).
  2. SH + 강세 없는 ㅣ → 시(finishing → 퓌니싱). F·V + ㅣ → 퓌·뷔는 유지(사람이 준 블로그 표기 커어퓌·뷔엗나암). 강세 있는 IY·홀로 남은 SH는 쉬 그대로(she → 쉬, fish → 퓌쉬).
  3. T+S·D+Z 묶음(츠·즈·ㅉ)은 같은 낱말 안에서만(at six → 엇 씩스, it seems → 잇 씸즈).
  4. 경계의 같은 자음 줄이기(2c)는 파열음·S만, 비음·L·R은 둘 다 남김(nineteen ninety → 나인틴 나이니).
- 축약 `CONTRACTIONS`(덩어리 안 낱말 둘이 이어지면 한 낱말 소리로; going/want/got/have/has + to는 다음 낱말이 한정사 the·a·an·my·your·his·her·our·their·this·that·these·those면 안 바꿈):
  going to → gonna `G AH1 N AH0` · want to → wanna `W AA1 N AH0` · got to → gotta `G AA1 T AH0` · have to → hafta `HH AE1 F T AH0` · has to → hasta `HH AE1 S T AH0` · kind of → kinda `K AY1 N D AH0` · sort of → sorta `S AO1 R T AH0` · out of → outta `AW1 T AH0` · let me → lemme `L EH1 M IY0` · give me → gimme `G IH1 M IY0` · don't know → dunno `D AH0 N OW1`.
- IPA → ARPAbet `ipaToArpabet(ipa)`: `/ [ ] . ˌ` 정리, 변형이 여럿(`,`)이면 첫 것, 괄호는 `(ɹ)`·`(r)`만 살리고 나머지 버림, `ː` 무시. 2글자 먼저(tʃ dʒ eɪ aɪ ɔɪ aʊ oʊ əʊ ɪə eə ʊə ɜɹ ɝ ɚ) 그다음 1글자 표. ˈ 뒤 첫 모음 강세 1, ˌ 뒤 2, 나머지 0, 강세 표시가 없으면 첫 모음 1. 모르는 기호가 하나라도 있으면 null.
- `pickUsIpa`: phonetics 중 audio가 `-us.mp3`로 끝나는 짝의 text → `oʊ`가 든 text → 첫 text·phonetic.
- 받아 오기: 덩어리 계산이 null이고 없는 낱말이 있을 때만, 낱말마다 한 번(성공·실패 모두 세션 동안 기억, 저장 안 함). 네트워크는 기존 사전 `requestUrl` 경로 그대로.

## 4. 범위 밖
블로그식 기호·영국 발음 설정, 축약을 문장 밖 다음 낱말까지 보고 판단하기, 받은 IPA를 디스크에 저장, dictionaryapi에 없는 낱말의 다른 사전, 이미 만든 Anki 카드 고치기, 「a lot of → lotta」(SPEC_031 규칙 시험 「어 라 러브」 유지).

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] Test 20 규칙 A 사례(walking 워킹 · finishing 퓌니싱 · at six 엇 씩스 · it seems 잇 씸즈 · nineteen ninety 나인틴 나이니 · she 쉬) 통과 + SPEC_031 기존 사례 통과 + 변이(-ing 예외 뺀 사본) 실패 [자동]
2. [ ] Test 20 축약 사례(going to do → gonna 소리, want to go, kind of, let me, going to the → 안 바꿈) 통과 + 변이(한정사 예외 뺀 사본) 실패 [자동]
3. [ ] Test 20 `ipa.json`: 실제 dictionaryapi IPA 글자 5개 이상 → ARPAbet·한글 기대값 일치, 모르는 기호 → null, `PronFallback` 가짜 fetch로 없는 낱말만 한 번씩 요청·실패 기억 + 변이 실패 [자동]
4. [ ] Test 11 `pickUsIpa`: 실제 응답(procrastinate·ubiquitous)에서 `-us` 짝 글자를 고름 [자동]
5. [ ] 블로그 근접도 평균이 SPEC_031 값(0.709)보다 내려가지 않음 [자동]
6. [ ] 회귀 `verify.mjs --set regression`(main.ts 900줄 한도 포함) [자동]
7. [ ] 실기기에서 카드 정답 단계 「🔊 발음 포인트」 몇 장(가능하면 going to·-ing 낱말·드문 낱말이 든 문장)을 보고, 한글 소리가 전보다 자연스러운지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·2·3·5 → `npm test` Test 20 + 변이는 `EAR_COACH_SOUNDHINT_MODULE` 사본(3의 `PronFallback` 변이는 같은 방식 `EAR_COACH_PRONFALLBACK_MODULE`). 4 → Test 11. 6 → verify(화면 검사 `soundHintStep3` 포함).

## 7. 수동 검증
BRAT 업데이트 → 영상 열기 → 카드 정답 단계 「🔊 발음 포인트」 몇 장 보고 버튼.

## 8. 가결정
- 축약은 덩어리 안에서만 판단, 끝에 오는 「going to」도 gonna · 이유: AI가 짚는 덩어리가 대개 「going to」 두 낱말이고 뒤에 동사가 옴 · 대안: 문장 전체 낱말을 넘겨 다음 낱말 확인(시그니처 바뀜).
- IPA는 세션 메모리에만 기억 · 이유: 드문 낱말이라 다시 받아도 싸고 저장 형식이 안 늘어남 · 대안: 플러그인 데이터에 저장.
- f·v + ㅣ는 퓌·뷔 그대로(finishing → 퓌니싱, 피니싱 아님) · 이유: 피로 바꾸면 블로그 근접도가 0.709 → 0.702로 내려감(coffee 카피, vietnam 비엣남 — 사람 사진 표기 커어퓌·뷔엗나암) · 대안: 피로 통일(사람에게 물음).
- 영국식 IPA만 있는 낱말도 그대로 씀(r 없는 소리) · 이유: 없는 것보다 나음, 실패 시 AI 값 · 대안: 영국식이면 포기.

## 실행 기록
- 2026-11-22 회차 1: IMPLEMENTED — 1 ✅ Test 20 「35 hangul + 5 ipa」 통과: walking 워킹·looking 루킹·finishing 퓌니싱·at six 엇 씩스·it seems 잇 씸즈·nineteen ninety/1990 나인틴 나이니·she 쉬·fish 퓌쉬, 기존 사례 중 의도한 변경 2개만 기대값 갱신(my 30-minute walking …워킹, want to go 와너 고), 변이 m1(-ing 예외 뺌) → 「my 30-minute walking」 실패 · 2 ✅ going to do 거너 두 /ˈɡʌnə ˈdu/·going to the 고잉 터 더(안 바꿈)·kind of 카인더·let me see 레미 씨·got to go 가러 고·I don't know 아이 러노, 변이 m2(한정사 예외 뺌) → 「going to the」 실패 · 3 ✅ 「ipa 8 convert + 3 invalid + 5 fallback」: procrastinate 프로크뤠스떠네잇·ubiquitous 유비퀴러스·serendipity 쎄뤈디삐리·emoji 이모지, water·cat은 CMUdict와 같은 ARPAbet, PronFallback 요청 [quinoa] 한 번 → 「아이 러브 크노어」, seolgi 실패 기억, 변이 m3(실패 안 기억) → 「실패한 낱말도 다시 요청 안 함」 실패 · 4 ✅ Test 11 `_ipa-us.json` 5개(procrastinate `/pɹoʊˈkɹæstəneɪt/`, ubiquitous `/juˈbɪk.wɪ.təs/` = -us 짝) + back ipaUs `/bæk/` · 5 ✅ 블로그 근접도 0.709(f+ㅣ를 피로 바꾼 중간 시도는 0.702 → 퓌 유지로 되돌림) · 6 ✅ `verify.mjs --set regression --json` harness·build·test·ui ok(main.ts 893줄), `sound-hint-portrait.png` 열어 봄: 「🔊 발음 포인트: going to → [거너] /ˈɡʌnə/ — …[거너(gonna)]…」 · 7 ⏳ 실기기
- 2026-11-22 사람 결정: 가결정 「f·v + ㅣ는 퓌·뷔 그대로」 확정(버튼 「퓌니싱 유지」). 코드 변경 없음. 7 ⏳ 대기 그대로.
