---
id: SPEC_013
title: 자막 단어 탭 → 사전 창 (뜻·IPA·발음)
status: READY
iterations: 0
max_iterations: 3
depends_on: []
---

# SPEC 013 — 자막 단어 탭 → 사전 창 (뜻·IPA·발음)

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
사람 선택 「사전+AnkiDroid」(2026-11-21)의 첫 조각. 자막 카드 3단계(정답·쉐도잉)의 영어 문장을 단어 단위로 누를 수 있게 하고, 누르면 영상을 멈추고 사전 창(Obsidian `Modal`)에 단어·IPA·품사별 뜻(최대 3개)·예문·발음 듣기 버튼을 보인다. 사전은 dictionaryapi.dev(무료, 키 없음)를 `requestUrl`로 부르며, 교체할 수 있게 `DictionaryProvider` 인터페이스 뒤에 둔다. Anki 저장·스냅샷은 하지 않는다(SPEC_014·015).

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/services/dictionary.ts` (새) — 타입 `DictionaryEntry`, 인터페이스 `DictionaryProvider`, 순수 함수 `normalizeLookupWord(raw)`·`parseDictionaryApiDev(json)`, 클래스 `DictionaryApiDevProvider`(requestUrl + 메모리 캐시).
- `src/ui/DictionaryModal.ts` (새) — 사전 창.
- `src/ui/components/SegmentCard.ts` — 3단계 `.ear-coach-full-script`를 단어 `span.ear-coach-word`로 나눔, 콜백 `onLookupWord?(word, segment)`.
- `src/ui/EarCoachView.ts` — 콜백 연결: 영상 멈춤 → 창 열기.
- `styles.css` — `.ear-coach-word`, 사전 창 모양.
- `tests/fixtures/dictionary/*.json` + `tests/runTests.ts` — 파싱·단어 정리 데이터 시험(Test 10).
- `tests/ui/obsidianStub.ts`, `tests/ui/entry.ts`, `tests/ui/runUiCheck.mjs`, `tests/ui/cases.json` — 가짜 사전으로 단어 탭 → 창 열림 검사(`expect.dictionary`).

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- `DictionaryEntry { word: string; phonetic: string | null; audioUrl: string | null; meanings: { partOfSpeech: string; definitions: { definition: string; example: string | null }[] }[]; sourceUrl: string | null }` — 품사별 뜻 최대 3개, 품사 최대 3개.
- `DictionaryProvider { name: string; lookup(word: string): Promise<DictionaryEntry | null> }` — 없는 단어(404)는 `null`.
- `normalizeLookupWord`: 앞뒤 문장부호 제거, 소문자, 곧은/굽은 따옴표 통일, 끝 `'s`·`’s` 제거; 숫자만이거나 빈 문자열이면 `""`.
- URL: `https://api.dictionaryapi.dev/api/v2/entries/en/<encodeURIComponent(word)>`.
- 창 문구: 제목 = 단어, 불러오는 중 `사전을 찾는 중…`, 없음 `사전에 없는 단어입니다: <word>`, 오류 `사전을 불러오지 못했습니다`, 발음 버튼 `🔊 발음`, 출처 줄 `dictionaryapi.dev`.

## 4. 범위 밖
- AnkiDroid 저장(SPEC_014), 영상 스냅샷(SPEC_015), 한국어 뜻·AI 번역, 0~2단계에서 단어 누르기, 사전 결과 디스크 저장, 다른 사전 제공자 구현.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] `parseDictionaryApiDev`가 `tests/fixtures/dictionary/` 실제 응답 2개 이상에서 기대 `word`·`phonetic`·`audioUrl`·품사 목록·첫 뜻과 같다(`npm test` Test 10) [자동]
2. [ ] `normalizeLookupWord` 데이터 사례(문장부호·대문자·`'s`·굽은 따옴표·숫자) 전부 통과 [자동]
3. [ ] 화면 검사(세로·가로): 3단계 카드 단어 `.ear-coach-word` ≥ 문장 단어 수, 하나를 누르면 `.ear-coach-dictionary-modal`이 뜨고 제목이 그 단어(정리된 형태), 뜻 줄 ≥ 1, 가짜 플레이어 `pause` 호출 1회 (`expect.dictionary` ok) [자동]
4. [ ] 변이: `parseDictionaryApiDev`의 품사 상한을 망가뜨린 사본으로 Test 10 실패 [자동]
5. [ ] 기존 화면 규칙(SPEC_002~011) 전부 ok, `verify.mjs --set regression` → ok [자동]
6. [ ] 스크린샷 `dictionary-portrait.png`에서 창에 단어·IPA·뜻·발음 버튼이 보인다 [자동]
7. [ ] Android 실기기에서 정답 단계 문장의 단어를 눌러 뜻·발음이 학습에 쓸 만하게 뜨는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1·2. `npm test` Test 10
3·5. `ui` + `.scratch/ui/report.json`
4. `.scratch/mut/` 사본 + 일회 러너
6. 스크린샷 Read

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 새 릴리스로 업데이트(실행자가 배포하고 버전을 알려 줌)
2. 세션을 열어 아무 카드나 「📖 3. 정답·쉐도잉」에서 단어를 눌러 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 창은 Obsidian `Modal` · 모바일에서 아래 시트로 떠 가상 목록 높이 계산을 건드리지 않음 · 대안: 카드 안 펼침(목록 높이 재계산), 말풍선(위치 계산·가로 화면 잘림).
- 단어 누르면 영상 멈춤 · 뜻 읽는 동안 문장이 지나가지 않게 · 대안: 계속 재생.
- 3단계에서만 단어 누르기 · 0~2단계는 일부러 글자를 숨기는 단계 · 대안: 모든 단계.
- 뜻은 영어 그대로 · Fluent Forever는 모국어 번역을 피함, 무료 사전이 영어 전용 · 대안: AI 번역(모바일 AI SPEC 뒤).

## 실행 기록
