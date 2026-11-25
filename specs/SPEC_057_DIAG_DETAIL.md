---
id: SPEC_057
title: 진단 기록에 HttpFailure 원래 오류 글(detail) 남기기
status: DONE
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 057 — 진단에 원래 오류 글

> 야간 자가 확정 (2026-11-26). 백로그 「대기」 맨 위: SPEC_056 검토에서 나온 것 — 서버에 닿지 못한 실패는 `HttpFailure` kind `offline`·message 「인터넷 연결이 없어요」가 되고 `UnknownHostException …` 원문은 `detail`에만 남아, 진단 기록에 `network: 인터넷 연결이 없어요`만 보여 원인을 못 본다.

## 1. 목표
진단 기록(설정 → 진단 복사)에 `HttpFailure.detail` 원문을 덧붙인다. 하지 않을 것: 알림 문구·`failureCause`·`aiResultMessage` 결과 바꾸기, 화면 바꾸기.

## 2. 파일
- 수정 `src/services/diagnostics.ts`: `describeError`가 Error의 `detail` 문자열을 메시지 뒤에 붙임.
- 수정 `src/services/aiAnalysis.ts`: `AiError.detail?`, `runAiAnalysis` 요청 throw 때 `detail` 보존, `aiStopDiagnostic(err)` 추가.
- 수정 `src/features/mobileAi.ts`: 진단 기록에 `aiStopDiagnostic` 사용.
- 수정 `tests/fixtures/diagnostics/cases.json`, `tests/fixtures/ai/cases.json`, `tests/runTests.ts`(새 데이터 읽기만).

## 3. 정의
- `describeError(err)`: `err`가 Error이고 `(err as any).detail`이 빈 글 아닌 문자열이며, 한 줄로 만든 detail이 message 안에 이미 없으면 message = `<message> (<detail 한 줄>)`. 아니면 지금 그대로.
- `AiError { kind; message; detail?: string }` — `runAiAnalysis`에서 `deps.fetch`가 던진 오류에 같은 규칙의 `detail`이 있으면 `stoppedBy.detail`에 담는다. `message`는 그대로.
- `export function aiStopDiagnostic(err: AiError): string` → `` `${kind}: ${message}` `` + (detail이 있고 message에 없으면 `` ` (${detail})` ``).
- `mobileAi.ts`: `diagnostics.record("AI 분석", aiStopDiagnostic(result.stoppedBy))`.

## 4. 범위 밖
알림 문구, `http.ts` 분류, 진단 보고 글 모양(머리·줄 형식), 비밀 가리기 규칙.

## 5. 완료 조건
1. [ ] `describeError(HttpFailure-모양 Error{message:"인터넷 연결이 없어요", detail:"Request Failed. UnknownHostException …"})` → `인터넷 연결이 없어요 (Request Failed. UnknownHostException …)`; detail null·빈 글·message와 같음 → message 그대로; 기존 describe 4건 그대로 [자동: Test 24 데이터]
2. [ ] `runAiAnalysis`: fetch가 `detail` 있는 오류를 던지면 `stoppedBy` = `{kind:"network", message:"인터넷 연결이 없어요", detail:<원문>}`; `aiStopDiagnostic` → `network: 인터넷 연결이 없어요 (<원문>)`, detail 없으면 `quota: HTTP 429` 꼴 [자동: Test 15 데이터]
3. [ ] 알림 글 그대로: 같은 stoppedBy의 `aiResultMessage`가 detail 없을 때와 같음 [자동: Test 15]
4. [ ] 변이: describeError의 detail 붙이기 끔 → Test 24 실패, aiAnalysis detail 보존 끔 → Test 15 실패 [자동: 사본 모듈]
5. [ ] 회귀 통과 [자동: `verify.mjs --set regression`]

## 6. 자동 검증
1: `npm test` Test 24(`tests/fixtures/diagnostics/cases.json` `describe`). 2·3: Test 15(`tests/fixtures/ai/cases.json` `stopDetail`). 4: `.scratch/`에 망가뜨린 사본 → `EAR_COACH_DIAGNOSTICS_MODULE`/`EAR_COACH_AI_MODULE` 지정 `npm test`에서 FAIL. 5: `node .claude/harness/verify.mjs --set regression`.

## 8. 가결정
- 괄호로 한 줄에 붙임 · 진단 보고는 줄마다 `단계: 메시지`라 따로 줄을 만들면 보고 모양이 바뀜 · 대안: entry.detail(스택 자리)에 넣기 — 스택과 섞임
- ⏳ 없음 · 화면·알림이 안 바뀜 · 대안: 실기기 진단 복사 확인(DNS 끊김을 일부러 만들기 어려움)

## 실행 기록
- 2026-11-26 회차 1 (야간): DONE — 1 ✅ Test 24 `PASS: ring 50/57, 8 redact, 8 describe` (httpFailure 4건 추가: detail 붙음 / null·공백·message와 같음 → 그대로; `src/services/diagnostics.ts` `errorDetail`·`describeError`) · 2 ✅ Test 15 `… + 4 stopDetail cases` — stoppedBy `{kind:network, message:인터넷 연결이 없어요, detail:Request Failed. UnknownHostException …}`, 진단 `network: 인터넷 연결이 없어요 (Request Failed. UnknownHostException Unable to resolve host "generativelanguage.googleapis.com": No address associated with hostname)`, 응답 오류 `quota: HTTP 429` · 3 ✅ 같은 시험 `aiResultMessage` detail 있음/없음 같음 · 4 ✅ 변이 `.scratch/mut57/diag_nodetail.ts` → exit 1 `AssertionError: describeError httpFailure`; `.scratch/mut57/ai/aiAnalysis.ts`(detail 보존 끔) → exit 1 `stopDetail 서버에 못 닿음 → detail 보존: stoppedBy` · 5 ✅ `verify.mjs --set regression --json` → `{"ok":true}` harness·build·test·ui. 가결정: `errorDetail`은 diagnostics.ts에 두고 aiAnalysis가 가져다 씀(같은 규칙 한 곳).
