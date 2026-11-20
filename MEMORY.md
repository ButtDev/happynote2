# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- SPEC_002(가로 좌우)·SPEC_003(헤더·내비바 숨김)·SPEC_004(가로 뷰 `position:fixed` 전체화면 + 컨트롤·툴바 한 줄 세그먼트) IMPLEMENTED — 실기기 ⏳만. BRAT 1.0.5(1.0.4는 상단 여백 그대로 NG → 조상 transform 해제 추가).
- 다음 후보: `memory/backlog.md` (iframe 안 유튜브 overlay, 자막 품질, 모바일 AI 번역, 사전+AnkiDroid — 번호는 만들 때 최대+1).

## 열린 질문 (사람에게)
- SPEC_004 8 실기기 확인(SPEC_003 1.0.3 사진: 위 ≈75px 빈칸·툴바 잘림 → SPEC_004로 대응). SPEC_002 9·SPEC_003 7은 SPEC_004 결과로 함께 판정 가능.
- SPEC_004 STOPPED(1.0.5: 좌우·아래 OK, 위 ≈84css 빈칸 남음 — 같은 시그니처 2회). 사람에게 다음 길 질문 중: 진단 명령 SPEC_005(env()·조상 rect·elementsFromPoint 덤프) 추천. 의심: env(safe-area-inset-top)가 실제보다 큼(아래는 0), 또는 덮는 요소.

## 주의
- 배포: 실기기 ⏳가 필요한 커밋은 묻지 않고 BRAT 배포(version 3파일 올림 → `git push buttdev main` + 같은 이름 태그 → Actions 릴리스 확인) 후 ⏳ 요청(CLAUDE.md 6장). 그 밖의 push는 사람 지시 때만. `main.js`는 저장소에 없음.
- 가로 배치는 CSS만(`styles.css` 끝 SPEC_002·003·004 블록), `src/` 무변경. 검사 HTML은 Obsidian 테마 근사 변수·`button` 높이 40px·`#app` 바깥 여백 40/24px를 흉내. 화면 검사는 `cases.json`의 `expect` 규칙 + `--fail-on-overlap`, 검사 HTML에 가짜 헤더 48px·내비바 56px.
- 「YouTube overlay」는 iframe 안 유튜브 UI라 DOM 측정에 안 잡힘. 화면 검사는 설치된 Chrome을 씀.
- `styles.css`에 `backdrop-filter`·`filter: blur` 글자 금지(npm test). `docs/test_result.txt`는 `npm test`가 덮어씀 — 커밋하지 않음.
