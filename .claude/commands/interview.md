---
description: 새 프로젝트 첫 대화 — 질문 7개로 OVERVIEW·CLAUDE.md 0장·harness.json·SPEC_001을 채운다
argument-hint: <한 줄 설명>
---

# /interview — 첫 대화로 프로젝트 틀 채우기

입력: `$ARGUMENTS` (한 줄 설명. 비어 있으면 `OVERVIEW.md` 1절)

`CLAUDE.md` 규칙을 따른다. 이 커맨드는 제품 코드를 만들지 않는다. 쓰는 곳은 `OVERVIEW.md`, `CLAUDE.md` 0장, `harness.json`, `specs/SPEC_001_*.md`, `DECISIONS.md`, `.scratch/interview.md`, `log/`뿐이다.

## 0. 시작
- `DECISIONS.md`에 「인터뷰 확정」 줄이 있으면 다시 묻지 않고 「이미 확정됨 — 바꾸려면 사람이 `/interview 다시`」라고만 답한다(입력이 `다시`면 처음부터).
- 진행은 `.scratch/interview.md`에 질문·답 원문을 덧붙여 둔다. 세션이 끊겨 이 파일만 남아도 이어서 묻는다.

## 1. 질문 — 한 메시지에 하나씩
순서: ① 목표(첫 버전이 끝나면 무엇이 되는가) ② 사용자 ③ 기술 스택 ④ 검증 방법(자동으로 무엇을 돌릴까) ⑤ 사람만 볼 것(⏳) ⑥ 하지 않을 것 ⑦ 야간 작업

- 질문 7개를 **한 메시지에 하나씩** 묻는다(번호를 붙여 「③ 기술 스택」처럼).
- 질문마다 설명에서 추론한 **추천안**을 한 줄 쓴다.
- 고를 답이 있는 질문은 메시지 끝에 버튼을 붙인다:
  - ③·④: `[buttons: 추천대로 | <대안1> | <대안2>]` (대안은 짧게)
  - ⑦: `[buttons: 야간 끔 | 야간 켬]`
  - ①②⑤⑥은 자유 답이라 버튼을 붙이지 않는다(추천안만).
- 사람이 한 메시지에 여러 답을 주면(예: 「① … ② … 나머지 추천대로」) 받은 것은 건너뛴다. 「나머지 추천대로」면 남은 질문을 추천안으로 채우고 바로 2로 간다.

## 2. 쓰기 (답이 다 모이면)
- `OVERVIEW.md` 1~7절 전부(빈 절 없음). 7절은 SPEC 후보 2~5개.
- `CLAUDE.md` 0장의 `[채울 것]` 전부(기술 스택·실행 방법·기술 제약·사람만 판정할 것). 0장 밖은 고치지 않는다.
- `harness.json`: `verify`에 스택에 맞는 명령, `regression`, `night.enabled`(⑦ 야간 켬이면 true). 기존 `harness` 항목은 남긴다.
  - `node .claude/harness/verify.mjs --set regression`이 통과해야 한다. 아직 코드가 없어 통과할 수 없는 명령은 `verify`에만 두고 `regression`에서 뺀 뒤 보고에 적는다.
- `specs/SPEC_001_<SLUG>.md`: `specs/_TEMPLATE.md` 형식, `status: DRAFT`, 첫 버전 핵심 기능의 첫 조각. 완료 조건은 관찰 가능하게, `[수동]`은 마지막 하나.

## 3. 보고
채운 내용 요약 — OVERVIEW 1·3·4절, 0장 기술 스택, `verify` 명령(뺀 것이 있으면 이유), SPEC_001 제목·완료 조건 수 — 와 `verify.mjs --set regression` 출력 한 줄. 메시지 끝:

[buttons: 인터뷰 확정 | 인터뷰 고칠 것]

## 4. 답을 받으면
- `[Button pressed: 인터뷰 확정]` →
  1. SPEC_001 front matter `status: READY`
  2. `DECISIONS.md`에 `- <날짜> | 「인터뷰 확정」 | OVERVIEW·0장·harness.json·SPEC_001 확정` 한 줄
  3. `node .claude/harness/log.mjs append confirmations '{"answer":"인터뷰 확정","raw":"<원문>"}'`
  4. 바꾼 파일만 `git add` → 커밋 `interview: OVERVIEW·0장·harness·SPEC_001 (확정)`
  5. 답: 「다음: `/spec-run SPEC_001`」, 끝에 `[buttons: SPEC_001 바로 실행 | 나중에]`
- `[Button pressed: 인터뷰 고칠 것]` → 「무엇을 고칠까요? 한 줄로」 → 고친 뒤 3으로.

## 금지
- 확정 전 커밋
- `OVERVIEW.md`·`CLAUDE.md` 0장·`harness.json`·SPEC_001 밖의 규칙·문서 수정
- 제품 코드 작성
