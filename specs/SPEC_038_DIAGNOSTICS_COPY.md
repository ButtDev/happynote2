---
id: SPEC_038
title: 설정 「🩺 진단 복사」 — 최근 오류 50개를 가려서 클립보드로
status: DONE
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 038 — 설정 「🩺 진단 복사」 — 최근 오류 50개를 가려서 클립보드로

> 야간 자가 확정(2026-11-23): 백로그 「대기」 맨 위 「[야간] 진단 복사」(사람 11-22 구조 개선 1번으로 고름). 화면엔 설정 버튼 한 줄만 늘어 아침 ⏳.

## 1. 목표
실기기에서 무언가 실패하면 지금은 알림만 잠깐 뜨고 사라져 원인을 알 수 없다. 오류를 메모리 링버퍼(최근 50개)에 모으고, 설정 맨 아래 「🩺 진단 복사」 버튼으로 앱 버전·플랫폼·기기·오류(시각·단계·메시지)를 **API 키·URL 쿼리를 가린 채** 클립보드에 복사한다. 사람은 그 글을 대화에 붙여 넣기만 하면 된다. 오류 안내 문구·재시도는 바꾸지 않는다(「네트워크·오류 계층」 백로그).

## 2. 파일
- 새 `src/services/diagnostics.ts` — obsidian import 없음. `DiagnosticsLog`(링버퍼), `redactDiagnostics`, `formatDiagnosticsReport`, 공용 인스턴스 `diagnostics`. 변이용 `EAR_COACH_DIAGNOSTICS_MODULE`.
- 새 `src/ui/diagnosticsSection.ts` — 설정 줄 그리기, 전역 오류 잡기(`installDiagnosticsCapture`).
- `src/ui/SettingsTab.ts` — 모바일·데스크톱 모두 맨 아래에 줄 추가.
- `src/main.ts` — 전역 잡기 설치, 오류 catch 자리에서 기록(줄 수 늘리지 않음, 900줄 한도).
- 오류 catch 자리 기록: `src/ui/sentenceAnki.ts`, `src/ui/DictionaryModal.ts`, `src/ui/SettingsTab.ts`(Anki 불러오기), `src/ui/videoDataSection.ts`, `src/ui/EarCoachView.ts`(agy).
- `tests/runTests.ts` Test 24 + `tests/fixtures/diagnostics/cases.json`, 화면 검사 `expect.diagnostics`(`tests/ui/entry.ts`·`runUiCheck.mjs`·`cases.json`).

## 3. 정의
- 항목: `{ at: ISO 시각, stage: 단계 이름, message: 한 줄, detail?: 스택 앞 3줄 }`. 상한 50, 넘치면 오래된 것부터 버림. 같은 단계·메시지가 연달아 오면 새 항목 대신 `count`를 올림(`×N`).
- 단계 이름: `노트 만들기`, `재정렬`, `AI 분석`, `세션 불러오기`, `Anki 저장`, `원음 받기`, `Anki 불러오기`, `사전`, `영상 지우기`, `휴지통 비우기`, `agy 분석`, `처리 안 된 오류`(window `error`·`unhandledrejection`).
- 가리기: 넘겨받은 비밀 값(설정 API 키, 6자 이상)은 `***`; 모양으로도 가림 — `AIza…`(Gemini), `gsk_…`(Groq), `sk-…`(OpenAI) → `***`; URL의 `?` 뒤 쿼리 → `?…`; `key=`/`token=`/`api_key=` 뒤 값 → `***`.
- 보고 글(첫 줄 `Ear-Coach 진단 <ISO 시각>`):
  ```
  Ear-Coach 진단 2026-11-23T01:02:03.000Z
  앱 1.0.48 · Obsidian 1.7.7 · android
  기기 <userAgent>
  화면 411×891
  오류 2개 (최근 50개까지)
  [2026-11-23T01:00:00.000Z] Anki 저장: Request failed, status 500
  [2026-11-23T01:01:00.000Z] AI 분석 ×3: 429 Too Many Requests
  ```
  오류가 없으면 `오류 없음`. 보고 전체를 가리기에 한 번 더 통과시킨다.
- 설정 줄(class `ear-coach-diagnostics`): 이름 `🩺 진단 복사`, 설명 `최근 오류 N개 — 문제가 생기면 복사해서 보내 주세요.`(N=0이면 `기록된 오류가 없어요. 문제가 생기면 복사해서 보내 주세요.`), 버튼 `복사`. 누르면 클립보드에 보고 글, 알림 `📋 진단을 복사했어요 (오류 N개)`. 클립보드 실패면 알림 `복사하지 못했어요: <메시지>`.
- 기록은 메모리만(앱을 다시 켜면 비워짐).

## 4. 범위 밖
- 오류 안내 문구·재시도 버튼·http 계층(「네트워크·오류 계층」), 파일 저장, 자동 전송, 오류 아닌 로그(정보·경고).

## 5. 완료 조건
- [x] 1. `diagnostics` 데이터 시험(상한 50·오래된 것 버림, 연속 같은 오류 묶음, 가리기: 설정 키·Gemini·Groq·OpenAI 모양·URL 쿼리·key=, 보고 글 머리·오류 없음, 보고에 비밀 값 글자가 남지 않음) + 변이 실패 확인 [자동]
- [x] 2. 화면 검사 `expect.diagnostics`: 세로·가로 — 처음 `기록된 오류가 없어요…` → 오류 2개(하나는 키·URL 쿼리 포함) 기록 → 다시 그리면 `최근 오류 2개 —` → `복사` → 클립보드 글이 `Ear-Coach 진단 `으로 시작, 단계 두 개 포함, 비밀 키·쿼리 글자 없음, 알림 `📋 진단을 복사했어요 (오류 2개)`, 넘침 없음, 스크린샷 열어 봄 [자동]
- [x] 3. `main.ts` 900줄 미만 + 전역 잡기·catch 자리 기록이 들어갔는지 grep [자동]
- [x] 4. 회귀 통과(`verify.mjs --set regression`) [자동]
- [x] 5. 실기기 설정 맨 아래 「🩺 진단 복사」의 `복사`를 눌러 대화창에 붙여 넣었을 때 `Ear-Coach 진단`으로 시작하는 글이 붙는지 보고 버튼 [수동]

## 6. 자동 검증
1 → Test 24 + 망가진 사본(`EAR_COACH_DIAGNOSTICS_MODULE`). 2 → `runUiCheck`, `diagnostics-<뷰>.png`. 3 → `wc -l`·grep `diagnostics.record`. 4 → `verify.mjs --set regression`.

## 7. 수동 검증
1. BRAT로 새 버전 받기 → 설정 → Ear-Coach → 맨 아래 「🩺 진단 복사」.
2. `복사` → 아무 대화창 입력칸에 붙여 넣기 → `Ear-Coach 진단 …`으로 시작하는 글이 붙는지 보고 버튼.

## 8. 가결정
- 메모리 링버퍼만 · 이유: 같은 세션에서 문제 직후 복사하는 용도, 저장 쓰기 없음 · 대안: 플러그인 data.json에 저장(다시 켜도 남음).
- 모듈 공용 인스턴스 `diagnostics` · 이유: catch 자리에서 한 줄 덧붙임으로 기록, main.ts 줄 수 그대로 · 대안: plugin 속성으로 주입(뷰·모달까지 넘겨야 함).
- 위치 = 설정 맨 아래(저장된 영상 아래) · 이유: 평소엔 안 보여도 되는 도구 · 대안: 맨 위.
- userAgent는 가리지 않음 · 이유: 기기·WebView 버전이 원인 찾기에 필요, 개인 식별 정보 아님 · 대안: 앞부분만.

## 실행 기록
- 2026-11-23 회차 1(야간, night/SPEC_038): IMPLEMENTED — 1 ✅ Test 24 `tests/fixtures/diagnostics/cases.json` PASS(ring 50/57 처음 「오류 7」, 연속 묶음 [AI×3, Anki×1, AI×1], redact 8: Gemini `?key=AIza…`→`?…`·`gsk_`·`sk-`·`token=`/`api_key=`·설정 키·6자 미만 그대로·유튜브 쿼리, describe 4, 보고 머리·`AI 분석 ×2`·비밀/`key=` 없음·`오류 없음`), 변이 dg1(상한 빼기)→「링버퍼 상한」, dg2(설정 키 가리기 빼기)→「redact my custom key…」, dg3(보고 전체 가리기 빼기)→「보고에 … chat?…」, dg4(단계 비교 빼기)→「연달아 같은 오류만 묶음」 실패 · 2 ✅ `runUiCheck` 세로·가로 diagnostics: 처음 「기록된 오류가 없어요. 문제가 생기면 복사해서 보내 주세요.」 → 오류 2개 기록 뒤 「최근 오류 2개 — …」, 복사 글 「Ear-Coach 진단 …\n앱 9.9.9 · Obsidian 1.7.7 · android\n기기 …\n화면 412×915\n오류 2개 (최근 50개까지)\n[…] Anki 저장: Request failed, status 500 …\n[…] AI 분석: fetch https://generativelanguage.googleapis.com/v1beta/x?… failed」, `ui-fake-secret-123456`·`key=` 없음, 알림 「📋 진단을 복사했어요 (오류 2개)」, 넘침 0, 높이 63px. `diagnostics-portrait.png`·`diagnostics-landscape.png` 열어 봄: 구분선 아래 「🩺 진단 복사」 제목·설명 한 줄, 오른쪽 「복사」 버튼. UI 변이(`const n = 0`) → 「diagnostics after … 기록된 오류가 없어요」 실패 · 3 ✅ `wc -l src/main.ts` 898(<900), grep: `src/main.ts:128` installDiagnosticsCapture, record 자리 main.ts:291·652·752·875·877, DictionaryModal.ts:77·183, sentenceAnki.ts:40·71, SettingsTab.ts:418, EarCoachView.ts:694, videoDataSection.ts:98·142 · 4 ✅ worktree `verify.mjs --set regression --json` harness·build·test·ui ok · 5 ⏳ 실기기.

- 2026-11-23 사람 확인: DONE — 5 ✅ `log/confirmations.jsonl` 「[Button pressed: SPEC_038 5 OK]」(실기기 1.0.49 진단 복사 → 대화창 붙여넣기). 1~4는 회차 1 근거 그대로.
