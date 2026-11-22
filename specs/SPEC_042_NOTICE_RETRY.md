---
id: SPEC_042
title: 알림 문구 정리 — 해요체·「무엇 — 원인 한 줄」·「다시」 버튼
status: READY
iterations: 0
max_iterations: 3
depends_on: [SPEC_041]
---

# SPEC 042 — 알림 문구 정리 — 해요체·「무엇 — 원인 한 줄」·「다시」 버튼

> 2026-11-23 사람: 「알림 정리 하기」 → 초안 표(10개 예) 「알림 표 추천대로」(`log/confirmations.jsonl`). SPEC_041 범위 밖으로 남긴 것.

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
Ear-Coach가 띄우는 알림(`Notice`)과 그 알림에 들어가는 문구 상수를 해요체로 맞춘다. 실패 알림은 원문 오류(영어·상태 코드·URL) 대신 「무엇 — 원인 한 줄」로 보이고, 원문은 🩺 진단 기록에만 남긴다. 원인은 네 가지 중 하나(또는 이미 사람이 읽을 수 있게 만든 이유)다. 다시 해 볼 수 있는 실패에는 알림 안에 「다시」 버튼을 달아 10초 동안 보이고, 누르면 알림을 닫고 같은 동작을 다시 한다. 입력 중 키보드 배치 진단 알림(숫자 줄)은 없애고 진단 기록으로 옮긴다. 데스크톱 전용 알림(agy·북마클릿)은 어미만 바꾼다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- 새 `src/services/notices.ts`(순수, obsidian import 없음): `NOTICE_CAUSES`, `KnownFailure`, `failureCause`, `failureNotice`, `RETRY_NOTICE_MS`, `RETRY_LABEL`. 변이용 `EAR_COACH_NOTICES_MODULE`.
- 새 `src/ui/notify.ts`: `notifyRetry(text, retry)` — 글 + 「다시」 버튼 DocumentFragment로 `Notice(…, 10000)`.
- 실패 → 원인 + 다시: `src/features/sessionPipeline.ts`(자막 추출·재정렬), `src/features/mobileAi.ts`(AI 실패·붐빔), `src/ui/EarCoachView.ts`(핀 문장 Anki: 연결·원음), `src/ui/SettingsTab.ts`(Anki 불러오기), `src/ui/DictionaryModal.ts`(발음 재생, 사전 오류 원인).
- 문구 상수: `src/services/anki.ts`(`ANKI_MESSAGES`·target 안내·`ankiStatusMessage`), `src/services/aiAnalysis.ts`(`AI_MESSAGES`·`aiResultMessage`·연결 확인 문구), `src/services/TranscriptService.ts`(이유가 분명한 실패는 `KnownFailure`).
- 어미·원문 빼기: `src/ui/videoDataSection.ts`, `src/ui/diagnosticsSection.ts`, `src/features/commands.ts`, `src/features/workspaceView.ts`, `src/ui/UrlInputModal.ts`, `src/ui/components/AgyTutorPanel.ts`, `src/ui/mobileTypingMode.ts`(알림 → `diagnostics.record`).
- 시험: `tests/fixtures/notices/cases.json` + `tests/runTests.ts` Test 28, 기존 문구 기대값(Test 12 anki·fixtures) 새 문구로, `tests/ui/obsidianStub.ts` Notice(조각 그리기·`hide`), `tests/ui/runUiCheck.mjs` `sentenceAnki.retry`.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 원인(`NOTICE_CAUSES`): offline 「인터넷 연결이 없어요」 · timeout 「응답이 없어요 (N초)」(HttpFailure 글 그대로) · busy 「서버가 잠깐 바빠요」 · unknown 「알 수 없는 오류 — 🩺 진단 복사로 보내 주세요」.
- `failureCause(err)`: `KnownFailure` → 그 글 / HttpFailure offline·timeout → 그 글 / HttpFailure status 중 408·429·5xx, `{status}`가 그 값, AI 오류 `kind: "busy"` → busy / 글이 offline 문구이거나 `응답이 없어요 (N초)` 모양 → 그 글 / 나머지 → unknown.
- `failureNotice(what, err)` = `❌ <what> — <원인>`.
- 「다시」 버튼: 글자 `다시`, 알림 10000ms, 누르면 알림 닫고 같은 동작.
- 문구(사람 확정 표):
  - `❌ 자막을 받지 못했어요 — <원인>` [다시] · `❌ 문장을 다시 나누지 못했어요 — <원인>` [다시]
  - `❌ AI 번역을 못 했어요 — <원인>` [다시] · 붐빔 `⏳ AI 서버가 붐벼서 멈췄어요 (n/m장). 나중에 노트를 다시 열면 이어서 해요.` [다시]
  - `AnkiConnect Android에 연결하지 못했어요 — 앱에서 서비스를 켜 주세요` [다시] · `원음을 받지 못해 저장하지 않았어요` [다시] · `발음을 재생하지 못했어요` [다시]
  - `유튜브 링크가 아니에요` · `Anki에 저장했어요` · `지우기를 못 했어요 — 🩺 진단 복사로 보내 주세요` · `비우기를 못 했어요 — 🩺 진단 복사로 보내 주세요`
  - 나머지 알림·문구 상수는 뜻은 두고 「~습니다/~합니다/~입니다」를 해요체로.
- KnownFailure 글: 「이 영상에는 자막이 없어요」, 「유튜브 페이지를 읽지 못했어요」, 「자막 문장을 찾지 못했어요」.

## 4. 범위 밖
- 설정 화면 설명 글(`setDesc`)·카드 안 글의 어미(알림 아님).
- 지우기·비우기·복사 실패에 「다시」(두 번 지우기 방지·의미 없음).
- 단어 사전 창 Anki 저장(창 안 상태 줄 + 버튼이 이미 다시 누를 수 있음)에 「다시」.
- 재시도 횟수·시간 제한 정책(SPEC_041).

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] Test 28 `tests/fixtures/notices/cases.json`: `failureCause` 사례(KnownFailure·offline·timeout·status 503/429/404·`{status:502}`·AI busy·글 모양 offline/timeout·일반 Error·문자열) 기대 원인과 같음, `failureNotice` 모양, 원인·알림 글에 `http`·`status`·영어 원문이 남지 않음 + 변이 실패 확인 [자동]
2. [ ] 해요체 불변식: `src/` 안 `new Notice(` 줄(여러 줄 호출은 다음 3줄 포함)과 `ANKI_MESSAGES`·`AI_MESSAGES`·`NOTICE_CAUSES`·`aiResultMessage` 결과에 `니다`가 없음 — Test 28 안 소스 검사 [자동]
3. [ ] 실패 알림에 원문이 없음: 자막 추출·재정렬·AI 실패·Anki 불러오기·지우기·비우기·복사 실패 `new Notice` 자리에 `err.message`·`String(e` 가 없음(데스크톱 agy 제외) — grep [자동]
4. [ ] 「다시」 연결: `notifyRetry(` 자리 = 자막 추출·재정렬·AI 실패·AI 붐빔·핀 문장 Anki(연결·원음)·Anki 불러오기·발음 재생 — grep. 화면 검사 `sentenceAnki.retry`: 원음 실패 알림에 `다시` 버튼 1개, 글 `원음을 받지 못해 저장하지 않았어요`, 누르면 알림이 닫히고 Anki 호출이 다시 일어남(세로·가로) [자동]
5. [ ] 입력 중 진단 알림 없음: `mobileTypingMode.ts`에 `new Notice` 없음, `diagnostics.record` 있음 — grep [자동]
6. [ ] 회귀 `verify.mjs --set regression` [자동]
7. [ ] 실기기: BRAT 업데이트 뒤 비행기 모드에서 핀 문장 「➕ Anki」를 누르면 알림 「원음을 받지 못해 저장하지 않았어요」에 「다시」 버튼이 보이는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·2 → `npm test` Test 28 + `EAR_COACH_NOTICES_MODULE` 변이(busy 빼기·unknown으로 원문 내보내기). 3·4·5 → `grep -n`. 4 화면 → `runUiCheck` `sentenceAnki` 확장 + `sentence-anki-<뷰>.png` 열어 봄. 6 → `verify.mjs --set regression --json`.

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 업데이트(Anki 연결 설정·핀 문장은 이미 있음). 2. 비행기 모드 켜기 → 영상의 핀 문장 「➕ Anki」 누름 → 알림에 「다시」가 있는지 보고 버튼.

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- Anki 연결 문구는 「…앱에서 서비스를 켜 주세요」 유지(초안의 「AnkiDroid 앱에서」 대신) · 이유: 서비스는 AnkiDroid가 아니라 AnkiConnect Android 앱에 있음, 문구가 사실과 어긋나지 않게 · 대안: 초안 그대로.
- 원인이 분명한 자막 실패(자막 없음 등)는 unknown 대신 그 이유 · 이유: 「알 수 없는 오류」로 덮으면 사람이 할 일이 없어짐 · 대안: 네 원인만.
- AI `network` 실패는 글 모양(offline·timeout 문구)으로 원인 판별 · 이유: aiAnalysis가 오류 객체 대신 글만 넘김, 구조를 바꾸지 않음 · 대안: aiAnalysis에 kind 추가.

## 실행 기록
