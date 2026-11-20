# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- 가로모드 위쪽 빈칸 잡기. BRAT **1.0.6** 배포됨 = SPEC_005 진단 + 시험 수정(가로 `.view-content` 패딩: 위 `min(env,28px)`, 아래 `max(env,12px)`).
- SPEC_004 STOPPED(같은 시그니처 「실기기: 가로 상단 여백 그대로」 2회). 1.0.5 기준: 좌우·아래는 화면 끝까지 OK, 버튼 한 줄 배치 OK, 위만 ≈84css 빈칸(상태표시줄 ≈36 + ≈48). 사람 메모: 「액션바 영역같은데」 — ≈48 = Obsidian 헤더(액션바) 높이. 진단 알림에서 env top·root y가 이 48을 설명하는지 먼저 본다.
- 다음: SPEC_005 7 사진이 오면 → 위 여백이 사라졌으면 SPEC_004 마무리. 남았으면 알림 값으로 원인을 확정한 뒤 고친다(env 값·root y·조상 y/transform(T)·fixed(F)·topHits). 확정 뒤 진단 기능(알림·노트·명령 `ear-coach-layout-diagnostics`, `src/utils/layoutDiagnostics.ts`, `EarCoachView` resize 훅)을 지운다(backlog).
- 그 뒤 후보: `memory/backlog.md` (iframe 안 유튜브 overlay, 자막 품질, 모바일 AI 번역, 사전+AnkiDroid — 번호는 만들 때 최대+1).

## 열린 질문 (사람에게)
- SPEC_005 7: 1.0.6 가로 화면 + 진단 알림 스크린샷 대기(버튼 `SPEC_005 7 OK|NG|메모`).
- SPEC_002 9·SPEC_003 7은 따로 묻지 않고 SPEC_004가 해결되면 함께 판정.

## 주의
- 배포: 실기기 ⏳가 필요한 커밋은 묻지 않고 BRAT 배포(version 3파일 올림 → `git push buttdev main` + 같은 이름 태그 → 릴리스 확인은 `curl` GitHub API, `gh` 없음) 후 ⏳ 요청. 그 밖의 push는 사람 지시 때만. `main.js`는 저장소에 없음.
- 가로 CSS는 `styles.css` 끝 SPEC_002·003·004 블록. SPEC_004는 가로+활성일 때 조상(`:has`) transform·contain 등을 풀고 leaf-content를 `position:fixed`로 띄움.
- 화면 검사 HTML은 실기기를 흉내 낸다: Obsidian 테마 변수, `button` 높이 40px, `#app` 바깥 여백 40/24px + `contain:layout`, `.workspace-leaf` transform, 가짜 헤더 48px·내비바 56px. 규칙은 `cases.json` `expect`. iframe 안 유튜브 UI는 측정 안 됨.
- `styles.css`에 `backdrop-filter`·`filter: blur` 글자 금지(npm test). `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
