---
id: SPEC_041
title: 네트워크 요청 계층 — 시간 제한·잠깐 실패 재시도·오프라인 구분을 한 곳에서
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: [SPEC_039]
---

# SPEC 041 — 네트워크 요청 계층 (야간 자가 확정)

> 2026-11-22 사람: 구조 개선안 1~4를 백로그 맨 앞에(「추천 1~4 백로그 맨 앞에」). 이 SPEC은 그중 4 「네트워크·오류 계층」의 **요청 계층** 부분. 알림 문구 정리·재시도 버튼은 화면·문구가 바뀌어 사람 결정이 필요하므로 이번 범위 밖.

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
`requestUrl`을 부르는 모든 곳(사전·Anki·AI·발음 바이트·원음 구간·장면 그림·자막)이 한 함수 `send`(src/features/network.ts) → 순수 정책 `sendWithPolicy`(src/services/http.ts)를 거친다. 정책: 시간 제한(응답이 없으면 매달리지 않고 실패), 잠깐 실패(408·429·5xx·연결 끊김) 재시도, 오프라인이면 요청을 보내지 않고 「인터넷 연결이 없어요」. 지금까지는 응답이 오지 않으면 화면이 영원히 「불러오는 중」에 머물 수 있었고, 지하철 등에서 한 번 끊기면 바로 실패했다. 돌려받은 응답(상태 코드)을 부르는 쪽이 판단하던 동작은 그대로 둔다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/services/http.ts`(새, 순수): `sendWithPolicy`, `HttpFailure`, `HTTP_POLICIES`, `HTTP_MESSAGES`, `RETRYABLE_STATUS`.
- `src/features/network.ts`: `send(opts, policy)` + `httpDeps`; 기존 `requestUrl` 7곳을 `send`로(정책: 사전·바이트·원음 = fetch, Anki = anki, AI = ai, 장면 그림 = probe).
- `src/services/TranscriptService.ts`: `requestUrl` import를 `send`로 바꿈(자막 3곳, 정책 fetch).
- `tests/fixtures/http/cases.json`, `tests/runTests.ts` Test 27.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 정책: `fetch` 15초·재시도 1·800ms / `ai` 90초·0 / `anki` 20초·0 / `probe` 10초·0.
- 재시도 상태 `[408, 429, 500, 502, 503, 504]`. 재시도 끝에도 그 상태면 마지막 응답을 그대로 돌려줌.
- 실패 종류 `offline`·`timeout`·`network`·`status`, 문구 「인터넷 연결이 없어요」, 「응답이 없어요 (N초)」, network·status는 원래 오류 글 그대로.

## 4. 범위 밖
- 알림(`Notice`) 문구 표 정리, 재시도 버튼(화면·문구 → 사람 결정).
- 사전 캐시, 실패 경로 시험 확대(백로그 따로).
- aiAnalysis 자체 재시도(busy) 변경.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] Test 27: 16 시나리오(성공·503/429/5xx 재시도·404 안 함·연결 실패·응답 없음·오프라인 처음/중간/복귀·throw 404/503·AI·Anki 재시도 없음·대기 목록) 통과 + 변이 4개(재시도 없음·시간 제한 없음·404 재시도·오프라인 확인 없음) 모두 실패 [자동]
2. [x] `src/` 안 `requestUrl(` 호출은 `src/features/network.ts` `send` 한 곳뿐(TranscriptService는 `send as requestUrl` import) — grep [자동]
3. [x] 회귀 `verify.mjs --set regression`(Test 25 연결 검사·화면 검사 포함) [자동]
4. [ ] 실기기: BRAT 업데이트 뒤 비행기 모드에서 자막 단어를 눌러 사전을 열면 「인터넷 연결이 없어요」가 보이고(매달리지 않음), 비행기 모드를 끄고 다시 누르면 뜻이 나오는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1 → `npm test` Test 27 + `EAR_COACH_HTTP_MODULE` 변이. 2 → `grep -rn "requestUrl(" src`. 3 → `verify.mjs --set regression --json`(worktree, main merge 뒤 다시).

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 업데이트. 2. 비행기 모드 켜고 단어 누르기 → 문구 확인. 3. 끄고 다시 누르기 → 버튼.

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- Anki는 재시도 0 · 이유: addNote가 실제로는 들어갔는데 응답만 늦으면 카드가 두 번 생김 · 대안: 읽기 동작만 재시도.
- AI는 여기서 재시도 0, 시간 제한 90초 · 이유: aiAnalysis에 busy 재시도가 이미 있고 묶음 요청이 길다 · 대안: 60초.
- 재시도 끝 응답은 그대로 돌려줌 · 이유: 사전 404·Anki 상태 판단 등 부르는 쪽 동작 유지 · 대안: 모두 throw.
- 시험 러너에 2초 감시 · 이유: 시간 제한이 빠지면 매달린 약속만 남아 node가 exit 0으로 조용히 끝남(변이로 확인) · 대안: 없음.

## 실행 기록
- 2026-11-23 회차 1(야간): IMPLEMENTED — 1 ✅ Test 27 「16 scenarios (retry 408/429/5xx, no retry 404·AI·Anki, timeout, offline, backoff)」 PASS, 변이 m1(재시도 없음) → 「[503 뒤 성공…] status」, m2(race 뺌) → 처음엔 node가 exit 0으로 조용히 끝나 안 잡힘 → 러너에 2초 감시 추가 뒤 「[응답 없음 뒤 성공] 시간 제한이 걸리지 않음」, m3(404 재시도) → 「[404는 다시 안 함] status」, m4(오프라인 확인 없음) → 「[처음부터 오프라인…] 실패해야 함」 · 2 ✅ `grep -rn "requestUrl(" src` → 실제 호출은 `src/features/network.ts:21` 한 곳, TranscriptService 113·155·181은 `src/services/TranscriptService.ts:1` `import { send as requestUrl }` · 3 ✅ worktree `verify.mjs --set regression --json` harness·build·test·ui ok · 4 ⏳ 실기기
