---
id: SPEC_019
title: 사전 구동사 — 누른 낱말 앞에서 시작하는 구도 찾기 (forward → look forward to)
status: DONE
iterations: 1
max_iterations: 3
depends_on: [SPEC_014]
---

# SPEC 019 — 사전 구동사 — 누른 낱말 앞에서 시작하는 구도 찾기 (forward → look forward to)

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
사람 선택 「구동사 앞 낱말 진행」(2026-11-21). SPEC_014는 누른 낱말에서 **시작하는** 구만 찾는다(looking을 눌러야 look forward to). 이번에는 누른 낱말 **앞** 1~2낱말에서 시작해 누른 낱말을 포함하는 구도 후보에 넣는다 — `forward`·`to`를 눌러도 `look forward to`, `up`을 눌러도 `pick it up`·`show up`. 사전 창 모양·동작은 SPEC_014 그대로(맨 위 구 칸, 아래 단어 칸).

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/services/dictionary.ts` — 순수 함수 `phraseCandidatesAround(tapped, preceding, following)`, 상수 `MAX_PHRASE_CANDIDATES_AROUND`. `phraseCandidates`는 그대로.
- `src/ui/components/SegmentCard.ts` — `onLookupWord(word, segment, following, preceding)`: 누른 낱말 앞 낱말 최대 2개(글자 그대로, 문장 순서)를 함께 넘김.
- `src/ui/EarCoachView.ts` — `preceding`을 사전 창에 넘김.
- `src/ui/DictionaryModal.ts` — 생성자 끝에 `preceding: string[] = []`, 구 조회는 `phraseCandidatesAround`.
- `tests/fixtures/dictionary/_phrases.json` — `around` 사례 추가, `tests/runTests.ts` Test 11 확장.
- `tests/ui/cases.json`·`tests/ui/runUiCheck.mjs` — `expect.phraseBefore`(「to」 누름 → `go to`).

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `phraseCandidatesAround(tapped: string, preceding: string[], following: string[]): string[]`
  - 앞 낱말: `preceding`의 마지막 2개(p2 p1 순서). 누른 낱말과 가까운 쪽부터 `normalizeLookupWord`; 비면 거기서 멈춤; `.,!?;:`로 끝나는 앞 낱말은 넣지 않고 그보다 앞으로 가지 않는다. 누른 낱말이 `.,!?;:`로 끝나면 뒤로는 잇지 않는다(앞쪽 구는 만든다).
  - 뒤 낱말: `phraseCandidates`와 같은 규칙(최대 2개).
  - 창(window) 순서: 3낱말 [누른 낱말 시작] → [p1 시작] → [p2 시작], 그다음 2낱말 [누른 낱말 시작] → [p1 시작] → [p2 + 누른 낱말](p1을 건너뜀 — 목적어 1낱말이 낀 구동사 `pick it up` → `pick up`). 낱말이 모자란 창은 건너뜀.
  - 각 창의 첫 낱말은 `lemmaVariants` 순서, 나머지는 `normalizeLookupWord`만. 중복 없이 **최대 12개**(`MAX_PHRASE_CANDIDATES_AROUND = 12`).
  - `preceding`이 비면 결과 = `phraseCandidates(tapped, following)`.
  - 예: `("forward", ["was", "looking"], ["to", "it"])` → `["forward to it", "looking forward to", "look forward to", "looke forward to", "was looking forward", "be looking forward", "forward to", "looking forward", "look forward", "looke forward", "was forward", "be forward"]`
- 사전 창: 후보 전부를 동시에 조회, 후보 순서대로 처음 결과가 있는 구를 맨 위 칸에(SPEC_014 그대로).

## 4. 범위 밖
- 여러 낱말 끌어 고르기, 관용구 사전·AI 판별, 사이에 낀 목적어가 2낱말 이상인 구(pick the box up), 누른 낱말 뒤로 목적어를 건너뛰는 구(pick 누름 → pick it up), 문장(카드) 경계를 넘는 구, 사전 창 모양 변경.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] `_phrases.json` `around` 사례 8개 이상(forward·to·up(pick it up)·up(showed up)·앞 낱말 문장부호 끊김·빈 앞 낱말·누른 낱말 끝 문장부호·preceding 빈 경우 = phraseCandidates) 전부 통과, 기존 `lemma`·`phrases` 사례 그대로 통과 (`npm test` Test 11) [자동]
2. [x] 변이: 앞 낱말 창을 빼 버린 사본으로 Test 11 실패 [자동]
3. [x] 화면 검사(세로·가로): 「So I was going to tell you…」에서 「to」를 누르면 맨 위 `.ear-coach-dict-phrase-title` = `go to`, 그 칸이 단어 칸(= `to`)보다 위 (`expect.phraseBefore` ok). 기존 `phrase`(going → go to)·「So」 구 없음 규칙 ok [자동]
4. [x] 실재 조회(Node fetch, dictionaryapi.dev): 「looking forward to」의 forward·「pick it up」의 up·「showed up」의 up에서 후보 순서대로 처음 결과가 있는 구를 실행 기록에 적는다(관찰, 기대 look forward to · pick up 계열 · show up) [자동]
5. [x] `verify.mjs --set regression` ok [자동]
6. [x] Android 실기기에서 「looking forward to」의 「forward」(또는 「showed up」의 「up」)를 눌러 맨 위에 구동사 뜻이 뜨는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1. `npm test` Test 11 · 2. `.scratch/mut/` 사본 + `EAR_COACH_DICT_MODULE` · 3·5. `ui` + `.scratch/ui/report.json`, `phrase-before-portrait.png` 열어 봄 · 4. `.scratch/` Node 스크립트 출력

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT로 새 버전 받기(실행자가 배포·버전 알림) → 아무 영상 3단계(정답) 카드에서 구동사 뒤쪽 낱말을 눌러 보고 버튼.

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 3낱말 창에서 누른 낱말 시작을 먼저 · SPEC_014 결과(looking 누름)가 바뀌지 않게 · 대안: 앞 낱말 시작 먼저(`forward to it` 같은 구가 있으면 밀림 — 사전에 거의 없음).
- 앞 창도 첫 낱말만 원형으로 · 구동사는 동사가 앞 · 대안: 모든 낱말 원형(후보 폭증).
- 최대 12개 동시 조회 · 404는 가볍고 캐시됨 · 대안: 순서 조회(창이 늦게 뜸).

## 실행 기록
- 2026-11-21 회차 1: IMPLEMENTED — 1 ✅ `npm test` Test 11 `16 lemma + 9 phrase + 9 around cases` PASS(앞 낱말 없음 = phraseCandidates 불변식 포함) · 2 ✅ 변이: 앞 낱말 창 4줄 주석 처리 사본 → `phraseCandidatesAround("forward", ["was","looking"], ["to","it"])` AssertionError · 3 ✅ ui portrait·landscape `phraseBefore` ok·`phrase` ok(report.json), `phrase-before-portrait.png`: 맨 위 보라 칸 `go to`·발음·Anki·verb 뜻, 그 아래 `to` 단어 칸 · 4 ✅ 실재 조회: really looking [forward] to it → look forward to · pick it [up] → pick up · she showed [up] late → show up · looking forward [to] seeing → look forward to · 5 ✅ `verify --set regression` ok · 6 ⏳ 실기기
  - 가결정(실행 중): 2낱말 창에 [p2 + 누른 낱말] 추가(pick it up → pick up) — SPEC 3장에 반영, 대안: 빼기(pick it up은 사전에 없어 못 찾음).
- 2026-11-21 사람확인: DONE — 6 ✅ `log/confirmations.jsonl` 「[Button pressed: SPEC_019 6 OK]」(실기기 1.0.25), 1~5는 회차 1 근거 그대로
