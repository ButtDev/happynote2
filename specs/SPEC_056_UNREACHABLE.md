---
id: SPEC_056
title: 서버에 닿지 못한 요청을 「인터넷 연결이 없어요」로 알아보고 한 번 더 시도
status: READY
iterations: 0
max_iterations: 3
depends_on: []
---

# SPEC 056 — 연결 끊김 알아보기

> 2026-11-25 사람 `[Button pressed: 1번 지금 짝으로]` (백로그 「대기」 1번). 계기: 실기기 진단 `AI 분석: network: Request Failed. UnknownHostException Unable to resolve host "generativelanguage.googleapis.com"` — 사람이 「다시」를 누르니 됨.

## 1. 목표
`src/services/http.ts` `sendWithPolicy`는 오프라인을 `navigator.onLine`(`deps.isOnline`)으로만 알아서, 폰이 잠깐 DNS를 못 찾는 경우(온라인으로 보이지만 요청이 서버에 닿지 못함)는 `network`로 떨어지고 AI·Anki는 재시도가 없다.
할 것: 요청 함수가 던진 오류 글이 「서버에 닿지 못함」 모양이면 `offline`으로 분류하고, 이런 실패는 정책 재시도와 별도로 **2000ms 뒤 한 번만** 더 시도한다(요청이 서버에 안 갔으므로 AI 과금·Anki 카드 두 번 위험 없음). 하지 않을 것: 새 알림 문구, 알림·진단 화면 바꾸기.

## 2. 파일
- 수정 `src/services/http.ts`: 분류 함수·추가 재시도.
- 수정 `tests/fixtures/http/cases.json`: 시나리오 추가(러너 `tests/runTests.ts` Test 27은 그대로 읽어 실행. 러너가 새 기대 필드를 못 읽으면 최소한만 고침).

## 3. 정의
- `export function isUnreachableError(message: string): boolean` — 대소문자 무시, 아래 중 하나를 포함하면 true:
  `UnknownHostException`, `Unable to resolve host`, `ERR_NAME_NOT_RESOLVED`, `ERR_INTERNET_DISCONNECTED`, `ERR_ADDRESS_UNREACHABLE`, `Network is unreachable`, `ENOTFOUND`, `EAI_AGAIN`
  - 아닌 것(지금처럼 `network`): `ERR_CONNECTION_RESET`, `ECONNREFUSED`, `Failed to connect`, `Connection refused`(Anki 앱이 꺼진 경우 — 인터넷 문제가 아님), 상태 코드가 있는 오류.
- `export const UNREACHABLE_RETRY_MS = 2000`
- 분류: throw에 상태 코드가 없고 `isUnreachableError(글)`이면 `HttpFailure("offline", HTTP_MESSAGES.offline, null, attempt)`. 원래 글은 새 필드 `detail: string | null`에 남김(다른 kind는 null 또는 원래 글 — 구현이 고름).
- 추가 재시도: 한 번의 `sendWithPolicy` 호출에서 unreachable 실패가 났고 남은 정책 재시도가 없으면, `UNREACHABLE_RETRY_MS` 기다린 뒤 **딱 한 번** 더 시도. 정책 재시도가 남아 있으면 정책대로(대기도 정책 값) 하고, 그것까지 다 쓴 뒤에도 unreachable이면 추가 1회는 아직 안 썼을 때만. 즉 요청 함수 호출 수 ≤ `retries + 2`.
- 추가 시도도 unreachable이면 `offline` HttpFailure, 다른 실패면 그 실패 그대로, 성공이면 응답.

## 4. 범위 밖
알림 문구·`notices.ts` 원인 표, 진단 기록 모양, aiAnalysis의 `stoppedBy` kind 체계, Anki 「앱 꺼짐」 안내, 정책 수치 변경.

## 5. 완료 조건
1. [ ] `isUnreachableError`가 3장 목록 8개(실기기 글 `Request Failed. UnknownHostException Unable to resolve host "generativelanguage.googleapis.com": No address associated with hostname` 포함)는 true, `ERR_CONNECTION_RESET`·`ECONNREFUSED`·`Failed to connect to /127.0.0.1:8765`·빈 글은 false [자동: Test 27 데이터]
2. [ ] 정책 `ai`(재시도 0): unreachable → 2000ms 뒤 성공이면 응답, 시도 2·sleeps `[2000]` / 두 번 다 unreachable이면 error `offline`, message `인터넷 연결이 없어요`, 시도 2 [자동: Test 27]
3. [ ] 정책 `anki`: `ECONNREFUSED` 한 번 → 추가 시도 없이 `network`, 시도 1 (카드 두 번 방지 유지) / unreachable → 시도 2 [자동: Test 27]
4. [ ] 정책 `fetch`(재시도 1): unreachable 세 번 → 시도 3, sleeps `[800, 2000]`, `offline` / 기존 Test 27 시나리오 전부 그대로 통과 [자동: Test 27]
5. [ ] 변이: 분류 끔(항상 false) → Test 27 실패, 추가 재시도 끔 → Test 27 실패 [자동: `EAR_COACH_HTTP_MODULE` 사본]
6. [ ] 회귀 통과 [자동: `verify.mjs --set regression`]

## 6. 자동 검증
1~4: `npm test` Test 27(입력·기대는 `tests/fixtures/http/cases.json`). 5: `.scratch/`에 망가뜨린 `http.ts` 사본 → `EAR_COACH_HTTP_MODULE=<사본> npm test`에서 Test 27 FAIL 확인. 6: `node .claude/harness/verify.mjs --set regression`.

## 8. 가결정
- 오류 글 문자열로 분류 · Obsidian `requestUrl`이 Android에서 Java 예외 글을 그대로 던짐(실기기 진단) · 대안: 실패 직후 DNS 탐침 요청(요청이 하나 더 생김)
- `Failed to connect`·`ECONNREFUSED`는 offline 아님 · Anki(127.0.0.1)가 꺼진 경우라 「인터넷 연결이 없어요」는 틀린 안내 · 대안: 모두 offline
- 추가 1회·2초 · 순간 끊김(오늘 사례)은 사람이 「다시」를 누르는 몇 초 안에 풀림 · 대안: 지수 대기 여러 번(AI는 90초 제한이라 너무 길어짐)
- ⏳ 없음 · 화면·문구가 안 바뀌고 실기기에서 DNS 끊김을 일부러 만들기 어려움 · 대안: 비행기 모드 확인(navigator.onLine 경로라 이 변경을 안 탐)

## 실행 기록
