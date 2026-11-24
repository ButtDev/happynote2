# happynote2 — 하네스 규칙

github.com/sindng-ui/happynote2 포크, 기능개선

제품 방향은 `OVERVIEW.md`, 작업 단위는 `specs/`의 SPEC, 지금 알아야 할 것은 `MEMORY.md`, 결정 이력은 `DECISIONS.md`에 있다. 작업은 `/spec-new`(요구사항 → SPEC 초안) 또는 `/spec-run`(SPEC 실행·검증)으로 시작한다. 이 문서에는 **현재 규칙만** 둔다. 규칙을 바꾸면 이유와 사람 원문을 `DECISIONS.md`에 적는다.

## 0. 프로젝트 절 (인터뷰로 채움)

- 기술 스택: TypeScript + Obsidian 플러그인 API + esbuild(업스트림 Ear-Coach 그대로), 시험은 `node --experimental-strip-types tests/runTests.ts`, 화면 검사는 Playwright(Chromium 모바일 뷰포트). 외부 연동: AnkiConnect Android(`127.0.0.1:8765`), dictionaryapi.dev, Gemini API. 업스트림: `https://github.com/sindng-ui/happynote2`
- 실행 방법: `npm install` → `npm run build` → `main.js`·`manifest.json`·`styles.css`를 Android 볼트 `.obsidian/plugins/obsidian-ear-coach/`에 복사 → Obsidian에서 플러그인 켜기
- 검증 명령: `harness.json`의 `verify` (예: 단위 시험, 문법 검사, 화면 검사)
- 기술 제약·금지 패턴: 대상은 Android(Obsidian 모바일). 모바일 경로에서 Node 내장 모듈(`child_process`·`fs` 등)을 최상위 import하지 않는다(`src/utils/platform.ts`의 지연 로딩만). 네트워크는 Obsidian `requestUrl`로. 데스크톱 동작을 깨지 않는다. 과금이 생기는 API를 쓰지 않는다. API 키는 플러그인 설정에만 두고 저장소·시험 데이터에 넣지 않는다. 유튜브 iframe은 교차 출처라 픽셀 캡처를 가정하지 않는다
- 사람만 판정할 수 있는 것(⏳): Android 실기기 세로·가로 화면 감각, AnkiDroid 카드 모양·학습감(Fluent Forever 방식), 사전 뜻·스냅샷·AI 번역의 학습 품질
- **BRAT 배포 — 묻지 않고 배포한 뒤 묻는다**: 실기기 ⏳ 확인이 필요한 커밋이 회귀를 통과하면 `manifest.json`·`package.json`·`package-lock.json` version을 올려 커밋하고 `git push buttdev main` + 같은 이름 태그 push → Actions 릴리스(3파일) 확인 뒤 ⏳ 버튼을 보낸다. 배포 여부를 따로 묻지 않는다. 1장 「외부 배포·네트워크 업로드 금지」와 6장 「push는 사람 지시가 있을 때만」의 예외(remote `buttdev` main push + 버전 태그만).

## 1. 폴더 경계

| 경로 | 누가 쓰는가 |
|---|---|
| 제품 파일 | `/spec-run`이 해당 SPEC 범위 안에서, 간이 변경 |
| `specs/` | `/spec-new`. `/spec-run`은 front matter `status:`·`iterations:`와 본문 끝 「실행 기록」만 |
| `MEMORY.md`, `memory/`, `log/` | 에이전트, 각 커맨드의 마지막 단계 |
| `OVERVIEW.md` | 사람이 확정한 뒤 읽기 전용 (바꾸려면 사람 결정) |
| `CLAUDE.md`, `.claude/` | 사람 요청 시. 야간 작업은 `.claude/harness/`·`.claude/commands/`를 개선할 수 있다(CLAUDE.md 제외, 제안만) |
| 프로젝트 폴더 밖 | 쓰기 금지. 임시 파일은 `.scratch/`(git 밖) |

- 사람이 지시하지 않은 삭제, `git reset --hard`·`git checkout --`·강제 push·rebase를 하지 않는다. 지울 때는 `.scratch/trash/<이름>-<날짜시각>/`로 옮긴다.
- 외부 배포, 유료 서비스, 네트워크 업로드를 하지 않는다.

## 2. 상태 (원본은 SPEC front matter)

- SPEC 파일 `specs/SPEC_NNN_<SLUG>.md`, 번호만 증가. 쪼갠 SPEC은 새 번호 + `parent:`.
- front matter의 `status:`가 **유일한 원본**이다. 표·목록은 `node .claude/harness/status.mjs`로 만들어 볼 뿐 다른 곳에 적지 않는다.
- 값: `DRAFT`(초안) → `READY`(실행 가능) → `IN_PROGRESS`(❌ 남음) → `IMPLEMENTED`(자동 ✅ 전부, ⏳ 남음) → `DONE` / `BLOCKED` / `STOPPED` / `DROPPED`(폐기)
- `iterations:`는 `/spec-run` 실행 횟수(사람 확인만 기록하는 실행은 세지 않음).
- `after_implemented: true`인 SPEC은 의존 SPEC이 IMPLEMENTED여도 진행한다.

## 3. 완료 판정의 근거

- 완료 조건은 항목마다 근거가 있을 때만 체크한다. 근거: 이번 실행에서 돌린 명령과 출력(`verify.mjs` 결과 등), `파일:줄` 인용, 이번 실행에서 찍고 직접 열어 본 스크린샷, `log/confirmations.jsonl`의 사람 확인.
- 근거가 아닌 것: 「구현했다」, 「동작할 것이다」, 이전 실행의 결과, 코드를 읽고 추론한 결과.
- 판정: ✅ 근거 있음 / ❌ 실패(실패 출력) / ⏳ 사람 확인 대기.
- ❌가 하나라도 있으면 `IMPLEMENTED`·`DONE`을 선언하지 않는다. 시험을 통과시키려고 검증 항목을 빼거나 약하게 바꾸지 않는다.
- 생성물(글·데이터·번역 등)이 바뀌는 작업은 보고에 실제 결과 2~3개를 넣는다. 모양 검사만으로 「잘 됐다」고 하지 않는다.

## 4. 정지 조건

하나라도 해당하면 멈추고 `STOPPED` 또는 `BLOCKED`로 둔 뒤 보고한다.

1. **반복 실패**: 같은 실패 시그니처가 2회째. `node .claude/harness/log.mjs count-failure '<시그니처>'`로 센다.
2. **반복 한도**: `iterations`가 `max_iterations`에 도달.
3. **의존성 미충족** → `BLOCKED`.
4. **결정 필요**: 5장 「결정 등급」에서 사람에게 물을 결정 → `BLOCKED`.
5. **범위 이탈**: SPEC 「범위 밖」을 구현해야만 진행 가능 → `BLOCKED`.
6. **경계 위반 필요**: 1장 경계를 넘어야만 진행 가능 → `BLOCKED`.

실패 시그니처는 `<검증 단계>: <핵심 오류 한 줄>`이다. 기록은 `log.mjs append failures '{"signature":…,"spec":…,"tried":…,"avoid":…}'`.

## 5. 결정 등급

- **되돌리기 쉬운 결정**(내부 구조, 이름, 수치 기본값, 도구 선택 등): SPEC에 추천안이 있거나 합리적인 추천안을 세울 수 있으면 **채택하고 진행**한다. SPEC 「가결정」 절(간이 변경은 `log/runs.jsonl`)과 보고에 「고른 것 · 이유 · 대안」으로 적는다. `DECISIONS.md`에는 규칙·방향을 바꾼 결정만 적는다.
- **사람에게 묻는 결정**: 취향(화면 감각·문장 결·콘텐츠), 되돌리기 어려운 것(데이터 삭제·외부 공개·비용), 제품 방향(`OVERVIEW.md`와 다름), ⏳ 판정. 질문은 선택지와 추천안을 함께 쓴다.
- **고를 답이 있는 질문은 버튼으로**: 메시지 끝에 `[buttons: <답1> | <답2>]`(줄마다 한 행)를 붙인다. 연결된 채팅이 버튼을 지원하면 버튼으로, 아니면 글로 보인다. 누른 답은 글자만 `[Button pressed: <글자>]`로 돌아오므로 글자만으로 뜻이 서게 쓴다(`SPEC_007 OK` · `SPEC_007 NG` · `추천대로`). 받은 원문을 그대로 `log.mjs append confirmations`에 남긴다. 자유 의견이 필요한 질문엔 붙이지 않는다.
- **⏳ 확인은 고정 버튼**: ⏳ 확인을 요청하는 메시지 끝에는 항목마다 `[buttons: SPEC_NNN <항목> OK | SPEC_NNN <항목> NG | SPEC_NNN <항목> 메모]`를 그대로 붙이고 글자를 바꾸지 않는다. `<항목>`은 완료 조건 번호다(예: `[buttons: SPEC_007 9 OK | SPEC_007 9 NG | SPEC_007 9 메모]`). `[Button pressed: SPEC_NNN <항목> OK]`, `[Button pressed: SPEC_NNN <항목> NG] <한 줄>`, `[Button pressed: SPEC_NNN <항목> 메모] <한 줄>`을 받으면 `/spec-run SPEC_NNN 사람확인: <항목> OK` / `<항목> NG: <한 줄>` / `<항목> 메모: <한 줄>`로 처리한다.

## 6. Git — main에서 작업한다

- 작업 브랜치는 `main`이다. 큰 작업(아키텍처 변경·여러 날 걸리는 것)만 `feat/<ID>`·`night/<ID>` 브랜치와 worktree(`.scratch/wt/<ID>`)에서 하고, 끝나면 main을 merge해 회귀를 다시 통과시킨 뒤 **fast-forward로만** main에 합친다.
- **검증이 끝나면 사람 요청 없이 바로 커밋한다.** 조건: 자동 판정에 ❌ 없음(`IMPLEMENTED`·`DONE`, 간이 변경은 근거 확인 뒤). ⏳가 남아도 커밋하고 보고한다.
- main에 커밋하기 전 `node .claude/harness/gate.mjs`의 `commitBlockers`(IN_PROGRESS SPEC)가 비어 있고 `verify.mjs --set regression`이 통과해야 한다.
- 이번 작업에서 바꾼 파일만 `git add <파일>` 한다(`git add -A` 금지). 비밀 값(`.env` 등)은 커밋하지 않는다.
- 세션을 마칠 때 검증이 안 끝난 변경이 남으면 `wip: <무엇>` 커밋으로 남기고 보고에 적는다(다음 작업이 막히지 않게).
- 커밋 메시지: `SPEC_NNN: <제목> (<상태>)` / 간이는 `<ID>: <한 줄>`, 본문에 검증 근거 요약. push는 사람 지시가 있을 때만.

## 7. 작업 방식

- **간이 변경**: 바뀌는 파일이 2개 이하, 공개 이름·화면이 바뀌지 않음, 수동 확인 불필요 → SPEC 없이 고치고 `log/runs.jsonl`에 근거 한 줄.
- **큰 작업 전 해석 한 줄**: 파일 3개 이상, 30분 넘는 실행이면 「이렇게 이해했어」를 먼저 보낸다. 이미 있는 기능·설정을 먼저 확인한다.
- **수동 확인은 마지막에, 한 동작으로**: SPEC의 ⏳ 항목은 마지막 조건 하나로 모으고, 「무엇을 보고 버튼」으로 끝나게 쓴다. 설정 바꾸기·비교 같은 추가 절차를 사람에게 넘기지 않는다.
- **기민하게**: 질문 없는 SPEC은 만들고 바로 실행한다(`/spec-new` → `/spec-run`, 「진행할까」 묻지 않음). 보고는 5줄 안팎(결과·❌·⏳·다음), 근거 상세는 SPEC 「실행 기록」·`log/`에.
- **시험은 데이터로**: 로직 시험의 입력·기대 출력은 `tests/` 아래 데이터 파일에 두고 러너는 읽어 실행만 한다. 시험 데이터는 git 안에 둔다.
- **시험은 새 worktree에서 통과해야 한다**: git 밖 파일·폴더에 기대는 시험을 만들지 않는다.
- **변이 시험**: 새 시험은 대상 코드를 일부러 망가뜨린 사본으로 실패하는지 한 번 확인한다.
- **회귀는 불변식으로**: 「글자가 완전히 같다」 대신 지켜야 할 규칙이 남아 있는지 본다.
- **긴 명령**: `harness.json`의 `detachAfterSec`보다 오래 걸릴 명령은 `node .claude/harness/run-detached.mjs start <이름> -- <명령>`으로 돌리고 `status <이름>`으로 결과를 읽는다.
- **위임**: 기계적인 긴 작업(검사 돌리기·대량 변환)은 대화를 물려받지 않는 에이전트에 필요한 맥락만 적어 맡기고 싼 모델을 쓴다.
- **함정 기록**: 한 번 겪은 함정·우회법은 `memory/pitfalls.md`에 한 줄. 규칙 문서에 사례를 쌓지 않는다.

## 8. 기록

- `MEMORY.md`: 다음 세션이 바로 알아야 할 것만(진행 중인 일, 열린 질문, 주의). `harness.json`의 `memoryMaxKB`를 넘으면(gate `memory.over`) 지난 내용을 지운다 — 이력은 이미 `log/`와 git에 있다.
- `log/runs.jsonl`(실행 기록), `log/confirmations.jsonl`(사람 확인·결정, 원문 그대로), `log/failures.jsonl`(실패 시그니처): `log.mjs append`로만 덧붙인다.
- `memory/backlog.md`: 「## 대기」「## 끝남」「## 보류」.

## 9. 야간 작업

`harness.json` `night.enabled`일 때만 `/night-run` 절차로 한다. 밤에는 ⏳를 승인하지 않고, 5장 「사람에게 묻는 결정」·콘텐츠 변경을 하지 않는다.
