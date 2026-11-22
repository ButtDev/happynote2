---
id: SPEC_030
title: 빈칸 받아쓰기 채점 너그럽게('cause=cause=because) + 맞히면 다음 빈칸으로
status: DONE
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 030 — 빈칸 채점·다음 빈칸 이동

> 2026-11-22 사람(사진 `.scratch/inbox/20261122-143930-506.jpg`): 「Because, cause 둘다 오답으로 체크됨. 정답입력시 다음 빈칸이 있으면 커서를 바로 이동」.

## 1. 목표
빈칸 채점이 낱말 앞뒤 아포스트로피까지 글자 그대로 비교해 `'Cause`에 `cause`·`because`를 오답 처리한다. 아포스트로피·구두점을 무시하고, 같은 말의 구어 줄임(`'cause`=because=cuz 등)을 정답으로 받는다. 또 빈칸 하나를 맞히면 같은 카드의 다음 안 맞힌 빈칸으로 커서를 옮긴다(마지막이면 그대로).

## 2. 파일
- `src/utils/dictationMatch.ts`(새): `normalizeDictationWord`, `dictationMatches(user, expected)`, 같은 말 묶음.
- `src/ui/components/MicroDictationBox.ts`: 채점에 `dictationMatches`, 맞히면 다음 빈칸 `focus()`.
- `tests/runTests.ts` Test 19 + `tests/fixtures/dictation/cases.json`, 변이용 `EAR_COACH_DICTATION_MODULE`.
- `tests/ui/runUiCheck.mjs`·`cases.json`: `expect.typing.advance`(첫 빈칸 정답 입력 → 포커스가 둘째 빈칸).

## 3. 정의
- 정규화: 소문자, [a-z0-9] 밖 글자(아포스트로피 포함) 빼기.
- 같은 말 묶음: {because, cause, cos, cuz, coz} · {them, em} · {until, till, til} · {okay, ok} · {going, goin} · {nothing, nothin} · {something, somethin} · {about, bout}.
- 그 밖엔 정규화 뒤 완전히 같아야 정답(철자 틀림은 오답 유지).

## 4. 범위 밖
여러 낱말 줄임(gonna↔going to), 철자 비슷하면 정답(편집 거리), 빈칸 고르는 AI 프롬프트.

## 5. 완료 조건
1. [x] Test 19 데이터 시험 통과(사람 사례 `'Cause`←cause·because 포함, 오답 사례 포함) + 변이(묶음 뺀 사본) 실패 [자동]
2. [x] 화면 검사: 첫 빈칸에 정답 입력 → 포커스가 다음 빈칸, 오답이면 그대로. 변이(이동 코드 뺀 사본) 실패 [자동]
3. [x] 회귀 `verify.mjs --set regression` [자동]
4. [x] 실기기에서 `'Cause` 빈칸에 cause/because가 정답(초록)이 되고, 맞히면 다음 빈칸으로 커서가 넘어가는지 보고 버튼 [수동]

## 6. 자동 검증
1 → `npm test`. 2 → `runUiCheck.mjs --fail-on-overlap`. 3 → verify.

## 7. 수동 검증
BRAT 업데이트 → 세로 카드 「빈칸」 → 입력 → 버튼.

## 8. 가결정
- 아포스트로피는 앞뒤뿐 아니라 전부 무시(dont=don't) · 이유: 모바일 키보드에서 ' 는 기호판 전환이 필요, 듣기 연습엔 영향 적음 · 대안: 앞뒤만 무시.
- 같은 말 묶음은 코드 상수(`DICTATION_SAME_WORDS`) · 이유: 작고 거의 안 바뀜 · 대안: 설정에서 편집.
- 마지막 빈칸을 맞히면 커서 그대로(메모 칸으로 안 감) · 이유: 사람 요청 「다음 빈칸이 있으면」.

## 실행 기록
- 2026-11-22 회차 1: IMPLEMENTED — 1 ✅ Test 19 「PASS: 17 cases」(cause·because←'Cause, dont←don't, 오답 becuase·case·then), 변이(묶음 뺀 `EAR_COACH_DICTATION_MODULE` 사본) → 「dictationMatches("because", "'Cause") 사람 사례」 실패 · 2 ✅ 화면 검사 `typing.advance`: 「zzz」엔 첫 빈칸 그대로, 정답 「SO」(대문자) → 둘째 빈칸으로, `ui-check: ok`; 변이(이동 호출 뺀 사본) → 「did not move to next blank (at 0)」 실패 · 3 ✅ `verify.mjs --set regression` ok · 4 ⏳ 실기기
- 2026-11-22 사람확인(회차 세지 않음): DONE — 1·2·3 ✅ 회차 1 근거 · 4 ✅ `log/confirmations.jsonl` 「[Button pressed: SPEC_030 4 OK]」(1.0.38 실기기)
