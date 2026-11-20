# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- SPEC_001 IMPLEMENTED — 조건 10(Android 실기기에서 플러그인이 업스트림처럼 뜨는지) ⏳. 사람이 ButtDev fork를 받아 기기에서 확인 중.
- 다음: SPEC_002 모바일 UI(overlay 축소 + 가로모드 영상/컨트롤 분리). 기준선: 가로 915×412에서 영상 899×105(납작), 겹침 0. SPEC_003~005는 `memory/backlog.md`.

## 열린 질문 (사람에게)
- SPEC_001 10 확인 결과 대기 (버튼 `SPEC_001 10 OK|NG|메모`).

## 주의
- push 대상은 remote `buttdev`(SSH `git@github.com:ButtDev/happynote2.git`, 공개 fork). push는 사람이 지시할 때만. `main.js`는 저장소에 없음. 배포는 BRAT: manifest·package version 올리고 같은 이름 태그 push → `.github/workflows/release.yml`이 Release(3파일) 생성.
- 화면 검사 `node tests/ui/runUiCheck.mjs`는 설치된 Chrome을 씀. 「YouTube overlay」는 iframe 안 유튜브 UI라 DOM 측정에 안 잡힘(SPEC_002에서 다룰 것).
- `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
