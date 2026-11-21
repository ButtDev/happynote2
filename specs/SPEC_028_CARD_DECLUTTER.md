---
id: SPEC_028
title: 카드 버튼·글자 간결화 (반복·핀 아이콘, 단계 이름, 안내 한 줄, 함정 한국어)
status: DRAFT
iterations: 0
max_iterations: 3
depends_on: []
---

# SPEC 028 — 카드 버튼·글자 간결화

> 야간 자가 작성(2026-11-22) 초안. 근거·시안은 `docs/review/ui-ux.md` 3~5절(`docs/review/img/ui-mock-*.png`). **화면 취향 질문이 남아 DRAFT** — 아래 「질문」.

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
세로 화면 카드가 버튼·중복 글자로 커서 목록(402px)에 약 2장만 들어간다(간격 ≈198px). 이번에는 모바일 카드와 툴바의 **글자·CSS만** 바꿔 카드 높이를 줄인다: (A) 카드 반복 버튼 아이콘만 🔁/🔂, (B) 핀 버튼 아이콘만 📌, (C) 단계 이름 「듣기 · 빈칸 · 힌트 · 정답」, (D) 단계 0 안내를 「🎧 N단어 · N초」 한 줄로, (E) 함정 배지 한국어(연음·약형·탈락·플랩 t·구어) + SPEED_SPIKE 배지 빼기, (F) 툴바 「모두 가림 / 모두 공개」, (G) 「루프」를 「반복」으로 통일. 동작(누르면 하는 일)은 바꾸지 않는다.

## 2. 파일
- `src/ui/components/SegmentCard.ts`: 버튼 글자·aria-label·`data-step`, 배지 글자, 단계 0 안내.
- `src/ui/EarCoachView.ts`: 툴바 compact 글자.
- `src/utils/trapLabels.ts`(새): `trapLabel(trap)` 순수 함수 + 시험 데이터 `tests/fixtures/trap-labels/cases.json`.
- `styles.css`: 모바일 카드 머리 한 줄, 아이콘 버튼 최소 36px.
- `tests/ui/runUiCheck.mjs`·`cases.json`: 단계 버튼을 글자 대신 `data-step`으로 찾기, `expect.cardPitchMax` 160px(세로, 카드 간격).

## 3. 정의
- 카드 반복 버튼: 글자 `🔁`(꺼짐)/`🔂`(켜짐), `aria-label="이 문장 반복"`.
- 핀 버튼: 글자 `📌`, `aria-label="안 들림 핀"`, 켜짐은 기존 `is-pinned-btn`.
- 단계: `듣기`·`빈칸`·`힌트`·`정답`, 버튼에 `data-step="0..3"`.
- 단계 0: `🎧 ${words}단어 · ${duration}초`.
- `trapLabel`: LINKING→연음, FLAP_T→플랩 t, WEAK_FORM→약형, ELISION→탈락, SLANG→구어, 모르는 값→그대로. 배지에서 SPEED_SPIKE는 뺌.

## 4. 범위 밖
과속 기준 바꾸기(`docs/review/ui-ux.md` H), Lucide 아이콘 교체(I), 플레이어 줄 버튼, 데스크톱 agy 버튼, 사전 창.

## 5. 완료 조건
1. [ ] `trapLabel` 데이터 시험 통과 + 변이 시험(매핑 망가뜨린 사본) 실패 확인 [자동]
2. [ ] 화면 검사 세로 카드 간격 ≤160px, 겹침 없음, 사전·Anki 검사 통과 [자동]
3. [ ] 회귀 `verify.mjs --set regression` 통과 [자동]
4. [ ] 실기기 세로·가로에서 카드 머리 아이콘 버튼이 누르기 쉽고 뜻이 서는지 보고 버튼 [수동]

## 6. 자동 검증
1 → `npm test`(새 Test). 2 → `runUiCheck.mjs --fail-on-overlap` 보고서 카드 간격·스크린샷 직접 열기. 3 → verify.

## 7. 수동 검증
1. BRAT 업데이트 뒤 리스닝 노트 열기 → 세로·가로에서 카드 몇 장 보이는지, 🔁·📌 눌러 보기 → 버튼.

## 질문 (사람)
- A·B 아이콘만(추천) vs 짧은 글자 남기기(「🔁 반복」「📌 핀」).
- C 단계 이름 「듣기·빈칸·힌트·정답」(추천) vs 「0·1·2·3」 vs 지금 그대로.
- D 긴 안내문 없애기(추천: 한 줄만) vs 첫 카드에만 긴 안내.

## 8. 가결정
- 시안은 글자·CSS만 바꾼 worktree 사본으로 찍음 · 화면 결정 전 비용 최소 · 대안: night 브랜치 구현(취향 결정 전이라 안 함).

## 실행 기록
