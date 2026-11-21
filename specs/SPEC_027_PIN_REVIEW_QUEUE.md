---
id: SPEC_027
title: 핀 문장 간격 재청취 큐 + 핀 졸업
status: DRAFT
iterations: 0
max_iterations: 3
depends_on: []
---

# SPEC 027 — 핀 문장 간격 재청취 큐 + 핀 졸업

> 야간 자가 작성(2026-11-22) 초안. 근거·발산은 `docs/review/anki-fluent-forever.md` 5·6절(#12·#14). **사람 질문이 남아 DRAFT**.

## 1. 목표
핀 문장을 Anki가 아닌 **원래 영상 소리로** 간격을 두고 다시 듣게 한다(간격 효과·인출 연습). 핀을 켠 시각과 다시 들은 결과를 노트(세션 데이터)에 남기고, 간격(1·3·7·14일)이 된 핀 문장만 「오늘 다시 들을 문장」으로 모아 블라인드(0단계)부터 연다. 블라인드에서 받아쓰기를 2번 연속 맞히면 핀 해제를 제안한다(자동 해제 아님).

## 2. 파일
- 새 `src/utils/reviewQueue.ts`(순수: 다음 복습일·오늘 큐·졸업 판정), Test 17 + `tests/fixtures/review/cases.json`.
- `src/types/transcript.ts`: `TranscriptSegment`에 `pinnedAt?`, `reviews?: { at: string; ok: boolean }[]`.
- `src/ui/EarCoachView.ts`: 필터 「📌 오늘」(기존 핀 필터 옆) — 화면 바뀜.
- 화면 검사 `expect.reviewQueue`.

## 3. 정의 (초안)
- 간격 `[1, 3, 7, 14]`일, 실패하면 처음으로. 졸업 = 연속 성공 2.

## 4. 범위 밖
여러 영상에 걸친 전역 큐(첫 판은 지금 연 영상만), 알림, Anki 연동.

## 5. 완료 조건
- [ ] 1. `reviewQueue` 데이터 시험 + 변이 [자동]
- [ ] 2. 화면 검사: 간격 된 핀만 「오늘」 필터에 보임 [자동]
- [ ] 3. 회귀 통과 [자동]
- [ ] 4. 실기기에서 「📌 오늘」 필터를 눌러 다시 들을 문장 목록이 쓸 만한지 보고 버튼 [수동]

## 6. 자동 검증
Test 17, `runUiCheck` 스크린샷, `verify.mjs --set regression`.

## 질문 (사람)
- 범위: **지금 연 영상만(추천, 작음)** vs 모든 영상 핀을 모은 전역 목록(큼, 새 화면).
- 간격 1·3·7·14일 그대로 둘지.

## 실행 기록
