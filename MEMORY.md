# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- SPEC_001 IMPLEMENTED — 조건 10(Android 실기기에서 플러그인이 업스트림처럼 뜨는지) ⏳. 다음 후보: SPEC_002 모바일 UI(가로모드 영상 899×105로 납작함이 기준선).

## 열린 질문 (사람에게)

## 주의
- 화면 검사 `node tests/ui/runUiCheck.mjs`는 설치된 Chrome을 씀. 「YouTube overlay」는 iframe 안 유튜브 UI라 DOM 측정에 안 잡힘(SPEC_002에서 다룰 것).
- `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
