# 백로그

## 대기
- [야간] Anki 카드·사전 설계 점검 (사람 요청 2026-11-21: 「anki 덱이 fluent forever를 충분히 잘 따르게 설계된건지, 사전 활용도는 높게 설계됐는지 등등 고민해보고 더 나은 방향 모색」). 할 일: 지금 카드(`src/services/anki.ts` Front/Back·노트 타입·그림·발음)와 사전 창(`src/services/dictionary.ts`·`DictionaryModal.ts`)을 Fluent Forever 원칙(그림·소리 우선, 모국어 번역 지양, 개인 연결, 최소쌍·발음 먼저, 한 카드 한 사실, 문맥 문장 cloze 등)과 대조 → 차이·개선안을 `docs/review/anki-fluent-forever.md`에 정리(근거 `파일:줄`, 실제 카드 예 2~3개). 개선안은 SPEC DRAFT로만 쓰고 구현·콘텐츠 변경·카드 모양 결정은 하지 않음(아침에 사람이 고름).

## 끝남
- SPEC_022 자동 자막 대소문자·구두점 복원(AI 칸) — DONE 2026-11-21
- SPEC_021 모바일 AI 번역·분석(Gemini/Groq) — DONE 2026-11-21
- SPEC_020 자동 자막 글자 다듬기(um/uh·I·첫 글자) — DONE 2026-11-21
- SPEC_019 구동사 앞 낱말부터 — DONE 2026-11-21
- SPEC_018 자동 자막 쉼 기준 끊기 — DONE 2026-11-21
- SPEC_017 장면 그림(스토리보드) — DONE 2026-11-21
- SPEC_015 AnkiConnect Android 카드 저장 · SPEC_016 기본 덱 happynote2 (2026-11-21 DONE)
- SPEC_013 단어 탭 → 사전 창 (DONE 2026-11-21, 발음 Commons ogg)
- iframe 안 유튜브 overlay 줄이기(SPEC_007·009 DONE)
- SPEC_005 임시 진단 지우기(SPEC_012), SPEC_004 마무리 — 2026-11-21
- SPEC_001 업스트림 가져오기 (DONE)

## 보류
- 자막 트랙 선택 (2026-11-21 사람 결정 보류): 이미 사람이 만든 영어 자막을 먼저 고르고(`TranscriptService.ts:86`), 바꿀 때마다 AI 해석을 다시 해야 함. 실제로 자막이 이상한 영상이 나오면 다시 정함.
