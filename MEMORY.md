# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- SPEC_002(가로 좌우 배치)·SPEC_003(가로 전체화면: 헤더·`.mobile-navbar` 숨김) IMPLEMENTED — 실기기 ⏳만 남음. BRAT 1.0.3 배포됨.
- 다음 후보: `memory/backlog.md` (iframe 안 유튜브 overlay, 자막 품질, 모바일 AI 번역, 사전+AnkiDroid — 번호는 만들 때 최대+1).

## 열린 질문 (사람에게)
- SPEC_002 9, SPEC_003 7 실기기 확인(버튼 `SPEC_00N <항목> OK|NG|메모`). SPEC_002 이전 메모: 「상하단공간활용이 떨어짐」→ SPEC_003으로 대응.

## 주의
- 배포: 실기기 ⏳가 필요한 커밋은 묻지 않고 BRAT 배포(version 3파일 올림 → `git push buttdev main` + 같은 이름 태그 → Actions 릴리스 확인) 후 ⏳ 요청(CLAUDE.md 6장). 그 밖의 push는 사람 지시 때만. `main.js`는 저장소에 없음.
- 가로 배치는 CSS만(`styles.css` 끝 SPEC_002·SPEC_003 블록), `src/` 무변경. 화면 검사는 `cases.json`의 `expect` 규칙 + `--fail-on-overlap`, 검사 HTML에 가짜 헤더 48px·내비바 56px.
- 「YouTube overlay」는 iframe 안 유튜브 UI라 DOM 측정에 안 잡힘. 화면 검사는 설치된 Chrome을 씀.
- `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
