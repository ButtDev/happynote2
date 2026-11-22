---
id: SPEC_031
title: 미국 발음 기준 한글 소리 힌트 (CMUdict + 이어 말하기 규칙) + Anki 앞면에서 한글 힌트 빼기
status: READY
iterations: 0
max_iterations: 3
depends_on: []
---

# SPEC 031 — 미국 발음 기준 한글 소리 힌트

> 2026-11-22 사람: 「애초에 발음 포인트가, 그냥 스펠링기반으로 한글로 표현한거라, 실제 발음과다르네, 그걸 그대로 anki 에 넣으니 문제가있음. exactly 는 익줴클리, 익제끌리 에 가까움.」 → 방향 A 「A에 동의함」, 블로그 사진(`.scratch/inbox/20261122-161912-525.jpg`) 「이런예시는 자동생성 힘들겠지」 → 「SPEC_031 진행」. SPEC_026 4 NG의 후속.

## 1. 목표
지금 소리 힌트(`analysis.phoneticKr`)는 AI(Gemini Flash-Lite)가 철자를 보고 한글로 옮긴 값이라 실제 소리와 다르다(`[이테이츠 이작틀리 라익 피자]`). 이번에는 힌트를 **코드로 계산**한다. 낱말 소리는 CMUdict(미국 발음·강세)에서 가져오고, 낱말 사이에 이어 말하기 규칙(플랩 t·된소리·t 탈락·연음·기능어 약화)을 적용한 뒤 한글과 IPA로 적는다. AI는 어느 덩어리가 안 들리는지(`chunkWordIndices`)와 설명만 맡는다. 계산은 보일 때마다 하므로 이미 분석된 문장에도 적용된다. Anki 듣기 카드에서는 한글 힌트를 앞면에서 빼고 뒷면(Source 칸 위)에 한글과 IPA로 둔다. 노트 유형 템플릿은 바꾸지 않는다(사람이 다시 만들 일 없음).

## 2. 파일
- `scripts/build-cmudict-lite.mjs`(새): CMUdict + 낱말 빈도 목록 → `src/data/cmudict-lite.txt`(자주 쓰는 30,000 낱말, 음소 압축). 원본 내려받기는 `.scratch/`(git 밖), 결과 데이터만 커밋.
- `src/data/cmudict-lite.txt`(새, 생성물) + esbuild `.txt` text 로더.
- `src/services/soundHint.ts`(새, obsidian import 없음, 사전 주입): `parseCmudictLite`, `applyConnectedSpeech`, `phonemesToHangul`, `phonemesToIpa`, `soundHintForWords`, `pickHintChunk`.
- `src/services/cmudictLite.ts`(새): 데이터 지연 파싱(처음 쓸 때 한 번).
- `src/services/aiAnalysis.ts`: 프롬프트·스키마에 `chunkWordIndices` 추가, 파싱. `phoneticKr`은 계속 받아 대체값으로.
- `src/types/transcript.ts`: `analysis.chunkWordIndices?: number[]`.
- `src/ui/components/SegmentCard.ts`: 2단계 「🔊 실제 발음 힌트」·3단계 「🔊 발음 포인트」에 계산값(없으면 기존 `phoneticKr`).
- `src/services/anki.ts`·`src/ui/sentenceAnki.ts`: Hint = 함정 유형만, Source = `🔊 [한글] /IPA/<br>` + 출처 링크.
- 시험: Test 20 + `tests/fixtures/sound-hint/{rules.json,blog.json}`, 변이용 `EAR_COACH_SOUNDHINT_MODULE`. Test 12 `_sentence.json` 기대 Hint/Source 갱신. Test 15 `cases.json`에 `chunkWordIndices` 파싱 사례.

## 3. 정의
- 음소: CMUdict ARPAbet 39개 + 강세(0/1/2). 사전에 없는 낱말이 덩어리에 하나라도 있으면 계산값 없음 → 기존 `phoneticKr`을 보인다.
- 이어 말하기 규칙(덩어리 전체를 한 줄 음소열로 이어 붙인 뒤):
  1. 플랩: 모음(또는 R) 뒤 T·D + 강세 없는 모음(낱말 경계 포함) → ㄹ (water → 워럴, computer → 컴퓨럴, radio → 뤠이리오).
  2. t 탈락: 자음 사이 T·D 빠짐 (exactly → 익재끌리, next day → 넥스 데이).
  3. 된소리: S 뒤 P·T·K → ㅃ·ㄸ·ㄲ, 강세 없는 모음 앞 K·P(첫소리 아님) → ㄲ·ㅃ.
  4. 연음: 낱말 경계를 무시하고 받침이 다음 모음 첫소리로.
  5. 기능어 약화(강세 없음, 표): a·the·to·and·of·for·you·your·can·at·them·him·her·have·was·are.
  6. 끝 R → 「ㄹ」 받침(-er → 얼), 모음 사이 L → 「ㄹㄹ」.
- 한글: 강세 모음은 제 소리(AE 애, AA 아, EH 에…), 강세 없는 AH·IH → 어·이, R+모음 → 뤄·뤠·뤼·롸.
- IPA: ARPAbet → IPA 표(강세 ˈ).
- 덩어리(`pickHintChunk`): `chunkWordIndices`가 있으면 그것, 없고 8낱말 이하면 문장 전체, 그 밖엔 `dictationBlankIndices` 최소−1 ~ 최대+1, 그것도 없으면 앞 6낱말.
- 근접도: 자모로 풀어 `1 − 편집거리/max(길이)`, 기대 표기가 여럿이면 가장 가까운 것.

## 4. 범위 밖
dictionaryapi IPA 대체 경로(사전에 없는 낱말 → 다음 SPEC 후보 SPEC_032), 블로그식 기호(「!」·영어 섞기), 영국 발음, 사람별 표기 설정, 이미 만든 Anki 카드 고치기, 노트 유형 템플릿 바꾸기.

## 5. 완료 조건
1. [ ] Test 20 규칙 데이터(`rules.json`, 우리가 정한 기대값 — 플랩·t 탈락·된소리·연음·약화·끝 r/l 사례 각 1개 이상, exactly → 익재끌리) 전부 일치 + 변이(플랩 규칙 뺀 사본) 실패 [자동]
2. [ ] Test 20 블로그 근접도(`blog.json`, 사람 사진 낱말 30개 + exactly 사람 표기): 평균 ≥ 0.65, 결과 표를 출력 + 변이(한글 표를 철자식으로 바꾼 사본)는 평균이 내려감 [자동]
3. [ ] `cmudict-lite.txt` 30,000 낱말 이하, 빌드된 `main.js` 1.5 MB 이하, 시험용 문장 5개(사람 사진 문장 「It tastes exactly like pizza」 포함)의 덩어리 낱말이 모두 사전에 있음 [자동]
4. [ ] AI 응답 `chunkWordIndices` 파싱(범위 밖 번호 버림) Test 15 사례 통과 [자동]
5. [ ] Anki 문장 노트: Hint에 한글 없음(함정 유형만), Source 맨 앞에 `🔊 [` 한글 `] /` IPA `/` — Test 12 + 화면 검사 `expect.sentenceAnki` 필드 확인 [자동]
6. [ ] 화면 검사: 정답 단계 「🔊 발음 포인트」에 계산값이 나옴(시험 데이터 문장) [자동]
7. [ ] 회귀 `verify.mjs --set regression` [자동]
8. [ ] 실기기에서 핀 문장 「➕ Anki」로 새 카드를 만들어, 앞면에 한글이 없고 뒷면 맨 위 한글·IPA가 실제 소리에 가까운지 보고 버튼 [수동]

## 6. 자동 검증
1·2·3·4 → `npm test`(Test 20·15) + 변이는 `EAR_COACH_SOUNDHINT_MODULE` 사본으로. 3의 크기 → `wc -c`. 5 → Test 12 + `runUiCheck.mjs`. 6 → `runUiCheck.mjs`(스크린샷 열어 봄). 7 → verify.

## 7. 수동 검증
BRAT 업데이트 → 핀 문장 「➕ Anki」 → AnkiDroid 동기화 없이 바로 카드 열기 → 앞면·뒷면 보고 버튼.

## 8. 가결정
- 사전에 없는 낱말 → 계산 포기, AI 값 표시 · 이유: 자막 빈도 상위 3만이면 대부분 덮음, IPA 대체는 네트워크·변환표가 더 듦 · 대안: dictionaryapi IPA(SPEC_032 후보).
- 빈도 목록 = OpenSubtitles 기반 FrequencyWords en_50k(필터에만 쓰고 배포하지 않음) · 이유: 유튜브 말투와 가까움 · 대안: 위키 빈도.
- 한글 힌트·IPA를 Source 칸 앞에 넣음 · 이유: 사람이 템플릿을 다시 고치지 않아도 뒷면에만 보임 · 대안: 새 필드(템플릿 수정 필요).
- 기준 0.65 · 이유: 블로그는 모음을 늘여 적는 개인 표기(도억·피익)라 완전 일치는 목표가 아님, 철자식 표기와의 차이가 숫자로 보이면 됨 · 대안: 0.7.

## 실행 기록
