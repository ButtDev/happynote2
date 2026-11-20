---
id: SPEC_014
title: 사전 창에 구동사 뜻 (looking forward to → look forward to)
status: DONE
iterations: 2
max_iterations: 3
depends_on: [SPEC_013]
---

# SPEC 014 — 사전 창에 구동사 뜻 (looking forward to → look forward to)

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
사람 선택 「구동사 먼저」(2026-11-21, SPEC_013 7 메모 「looking forward to 같은 구동사는 사전에 않나오네」). 3단계 문장에서 단어를 누르면 누른 단어 + 뒤 1~2단어를 원형으로 바꾼 구(句) 후보를 dictionaryapi.dev에 함께 조회하고, 사전에 있는 첫 후보를 사전 창 맨 위 「구동사」 칸에 뜻과 함께 보인다. 아래에는 지금처럼 누른 단어의 뜻이 나온다. 사전에 `looking forward to`는 없고(404) `look forward to`·`show up`·`get up`·`go to`는 있다(200, 2026-11-21 확인). 누르는 방법은 바꾸지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/services/dictionary.ts` — 순수 함수 `lemmaVariants(word)`·`phraseCandidates(tapped, following)` 추가.
- `src/ui/components/SegmentCard.ts` — `onLookupWord(word, segment, following)`: 누른 단어 뒤 낱말 2개(글자 그대로)를 함께 넘김.
- `src/ui/EarCoachView.ts` — `following`을 사전 창에 넘김.
- `src/ui/DictionaryModal.ts` — 구 후보를 단어와 함께 조회, 찾으면 맨 위에 구동사 칸.
- `styles.css` — 구동사 칸 모양.
- `tests/fixtures/dictionary/_phrases.json`(새, 원형·후보 사례), `tests/fixtures/dictionary/look-forward-to.json`·`show-up.json`(새, 실제 응답) + `tests/runTests.ts` Test 11 확장.
- `tests/ui/entry.ts`·`tests/ui/runUiCheck.mjs`·`tests/ui/cases.json` — 가짜 사전에 구 몇 개를 넣고 `expect.phrase` 검사.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `lemmaVariants(word: string): string[]` — `normalizeLookupWord` 결과를 첫째로, 원형 후보를 이어 붙여 중복 없이 **최대 3개**. 빈 단어면 `[]`.
  - 불규칙 표(정확히 일치하면 아래 규칙은 쓰지 않음): went·gone→go, got·gotten→get, took·taken→take, came→come, gave·given→give, made→make, ran→run, brought→bring, thought→think, found→find, told→tell, said→say, saw·seen→see, kept→keep, left→leave, held→hold, stood→stand, broke·broken→break, fell→fall, felt→feel, met→meet, paid→pay, sat→sit, spoke→speak, threw·thrown→throw, wore→wear, woke→wake, ate·eaten→eat, did·done·does→do, goes→go, had·has→have, was·were→be.
  - `-ing`(어간 2자 이상): 어간, 겹자음이면 하나 뺀 어간(running→run), 어간+`e`(making→make).
  - `-ied`→`y`(tried→try); `-ed`(어간 2자 이상): 어간, 겹자음 하나 뺀 어간(stopped→stop), `-d`만 뺀 형태(liked→like).
  - `-ies`→`y`; `-es`(어간이 s·x·z·ch·sh로 끝남)→어간; 그 밖의 `-s`(전체 4자 이상, `ss`로 끝나지 않음)→`-s` 뺀 형태.
- `phraseCandidates(tapped: string, following: string[]): string[]` — 낱말 3개짜리 먼저, 그다음 2개짜리. 각 길이에서 첫 낱말은 `lemmaVariants(tapped)` 순서, 뒤 낱말은 `normalizeLookupWord`만. 누른 낱말이 `.,!?;:`로 끝나면 `[]`; 뒤 낱말은 비면 거기서 멈추고, `.,!?;:`로 끝나는 낱말은 넣되 그 뒤로는 이어 가지 않는다. 중복 없이 **최대 6개**.
  - 예: `("looking", ["forward", "to"])` → `["looking forward to", "look forward to", "looke forward to", "looking forward", "look forward", "looke forward"]`
- 사전 창: 단어와 구 후보를 함께 조회한다. 후보 순서대로 처음 결과가 있는 구를 `.ear-coach-dict-phrase` 칸(사전 창 맨 위, 단어 머리 위)에 보인다. 칸 안: 꼬리표 없음(2026-11-21 사람 결정 「숙어표현 등도 보여주고 있으니, 구동사 태그를 떼자」 — 칸 안에 글자 `구동사` 없음), 제목 `.ear-coach-dict-phrase-title` = 사전 응답의 `word`, 🔊 발음 버튼(있으면), 품사별 뜻·예문(단어와 같은 모양). 결과가 없거나 오류면 칸을 만들지 않는다(단어 쪽은 그대로).
- 단어 쪽 문구·동작은 SPEC_013 그대로.

## 4. 범위 밖
- 누른 단어 **앞** 낱말에서 시작하는 구(forward를 눌러 look forward to 찾기), 여러 낱말 끌어 고르기, 관용구 사전·AI 판별, 0~2단계, 한국어 뜻, Anki 저장(SPEC_015로 밀림).

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] `lemmaVariants`·`phraseCandidates` 데이터 사례(`_phrases.json`: looking·running·making·stopped·liked·tried·goes·watches·looks·got·showed·문장부호 끊김·빈 뒤 낱말 등 12개 이상) 전부 통과 (`npm test` Test 11) [자동]
2. [ ] 실제 응답 `look-forward-to.json`·`show-up.json`이 `parseDictionaryApiDev`에서 기대 `word`·품사·첫 뜻과 같다 (Test 11) [자동]
3. [ ] 화면 검사(세로·가로): 「going」을 누르면 사전 창 맨 위 `.ear-coach-dict-phrase-title` = `go to`, 그 칸이 `.ear-coach-dict-word`(= `going`)보다 위, 구 뜻 줄 ≥ 1; 구가 없는 낱말을 누르면 `.ear-coach-dict-phrase` 없음 (`expect.phrase` ok) [자동]
4. [ ] 변이: `lemmaVariants`의 `-ing` 규칙을 망가뜨린 사본으로 Test 11 실패 [자동]
5. [ ] 기존 화면 규칙·SPEC_013 `dictionary` 규칙 ok, `verify.mjs --set regression` → ok [자동]
6. [ ] 스크린샷 `phrase-portrait.png`에서 맨 위 구 칸(제목·뜻, 꼬리표 없음)과 그 아래 단어 칸이 보인다 [자동]
7. [ ] Android 실기기에서 「looking forward to」 같은 문장의 첫 낱말을 눌러 맨 위에 구동사 뜻이 뜨는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·2. `npm test` Test 11
3·5. `ui` + `.scratch/ui/report.json`
4. `.scratch/mut/` 사본 + `EAR_COACH_DICT_MODULE`
6. 스크린샷 Read

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 새 릴리스로 업데이트(실행자가 배포하고 버전을 알려 줌)
2. 구동사가 있는 문장의 첫 낱말을 「📖 3. 정답·쉐도잉」에서 눌러 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 누른 낱말에서 **시작하는** 구만 · 구동사는 동사를 먼저 누르는 게 자연스럽고 요청 수가 적음 · 대안: 앞 낱말부터도(요청 2배).
- 후보 최대 6개를 단어와 **동시에** 조회 · 순서대로 기다리면 창이 늦게 뜸, 404는 가볍고 캐시됨 · 대안: 순서대로 조회해 첫 결과에서 멈춤.
- 원형은 규칙 + 작은 불규칙 표 · 무료·오프라인·검증 가능 · 대안: 원형 사전 API(외부 의존 추가).
- 구동사 칸은 맨 위, 단어 칸은 그 아래 · 사람 요청 그대로.

## 실행 기록
- 2026-11-21 회차 1: IMPLEMENTED — 1 ✅ `npm test` Test 11 `… 16 lemma + 9 phrase cases` PASS · 2 ✅ 같은 실행 `6 response fixtures`(look-forward-to·show-up 실제 응답: word·품사 verb·첫 뜻) · 3 ✅ ui portrait·landscape `phrase` ok: 「going」 → phraseTitle `go to`, 꼬리표 `구동사`, 구 뜻 1줄, word `going`, phraseAboveWord true; 「So」(후보 so i was·so i 없음) → phraseOnFirst false · 4 ✅ 변이 `-ing` 어간을 `slice(0,-2)`로 → `lemmaVariants("looking")` exit 1 · 5 ✅ `verify --set regression` ok(dictionary 규칙 포함) · 6 ✅ `phrase-portrait.png`: 시트 맨 위 보라 테두리 칸에 「구동사」 꼬리표·`go to`·🔊 발음·verb 뜻, 그 아래 `going /həˈləʊ/`·뜻 목록; `phrase-landscape.png` 같은 구성 · 실재 조회(Node fetch): looking forward to → look forward to(ogg 있음), showed up. → show up, got up early → get up, gave up smoking → give up, ran into my → run into · 7 ⏳ 실기기
  - 가결정: 불규칙 표에 있으면 접미 규칙은 쓰지 않음(goes→goe 방지, SPEC 3장에 반영) · 단어 뜻 줄 수 검사를 `.ear-coach-dict-body` 안으로 한정(구 칸 뜻과 섞이지 않게, 기준은 그대로 ≥1) · 대안: 규칙 함께 적용, 전체 개수.
- 2026-11-21 회차 2: DONE — 사람확인 7 메모 「기능은 만족, … 구동사 태그를 떼자」(`log/confirmations.jsonl`) → 7 ✅(기능) + 꼬리표 제거. 3 ✅ ui portrait·landscape `phrase` ok, 규칙에 「꼬리표 요소 없음·칸 안 글자 `구동사` 없음」 추가(`tagText:false`) · 변이: 꼬리표 줄을 되살린 사본 → `portrait: phrase failed ("tag":"구동사","tagText":true)` exit 1, 원본 복원 · 5 ✅ `verify --set regression` ok · 6 ✅ `phrase-portrait.png`: 맨 위 보라 테두리 칸에 `go to`·🔊 발음·verb 뜻, 꼬리표 없음, 그 아래 `going` 칸 · 1·2·4 ✅ 회차 1 그대로(Test 11 이번 회귀에서 PASS)
