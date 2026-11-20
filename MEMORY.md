# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- 가로모드 다듬기. 위 빈칸은 SPEC_006(1.0.7)으로 사진상 해결(명시 OK 대기). SPEC_007(1.0.8): 활성 카드 밀림(4px border→inset shadow), 모바일 카드 버튼 알약·단계 세그먼트, 모바일 유튜브 `controls=0` 등 + 플레이어 위아래 56px 자르기.
- SPEC_008(1.0.9): 모바일 CC 버튼(loadModule/unloadModule captions, 기본 켜짐 cc_load_policy=1). 자막이 56px 자르기에 가려지면 아래 자르기 줄이기.
- 다음: SPEC_006 6·SPEC_007 8·SPEC_008 6 OK면 → SPEC_004 마무리·SPEC_002 9·003 7 함께 판정 → 진단 기능(`src/utils/layoutDiagnostics.ts`, 명령 `ear-coach-layout-diagnostics`, `EarCoachView` resize 훅) 제거(backlog).
- 그 뒤 후보: `memory/backlog.md` (자막 품질, 모바일 AI 번역, 사전+AnkiDroid — 번호는 만들 때 최대+1).

## 열린 질문 (사람에게)
- SPEC_006 6(위 빈칸 — 사진상 OK), SPEC_007 8(메모: 깔끔, CC 아쉬움), SPEC_008 6(1.0.9 CC 버튼) 버튼 대기. SPEC_005 7은 NG(진단 목적 달성).
- SPEC_002 9·SPEC_003 7은 따로 묻지 않고 SPEC_004가 해결되면 함께 판정.

## 주의
- 배포: 실기기 ⏳가 필요한 커밋은 묻지 않고 BRAT 배포(version 3파일 올림 → `git push buttdev main` + 같은 이름 태그 → 릴리스 확인은 `curl` GitHub API, `gh` 없음) 후 ⏳ 요청. 그 밖의 push는 사람 지시 때만. `main.js`는 저장소에 없음.
- 가로 CSS는 `styles.css` 끝 SPEC_002·003·004 블록. SPEC_004는 가로+활성일 때 조상(`:has`) transform·contain 등을 풀고 leaf-content를 `position:fixed`로 띄움.
- 화면 검사 가로 뷰포트는 실기기 891×411. HTML은 실기기를 흉내 낸다: Obsidian 테마 변수, `button` 높이 40px, `#app` 바깥 여백 40/24px + `contain:layout`, `--safe-area-inset` 30/15, 가로 leaf-content 위 패딩 82px(1.0.6 실기기 값), `.workspace-leaf` transform, 가짜 헤더 48px·내비바 56px. 규칙은 `cases.json` `expect`. iframe 안 유튜브 UI는 측정 안 됨.
- `styles.css`에 `backdrop-filter`·`filter: blur` 글자 금지(npm test). `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
