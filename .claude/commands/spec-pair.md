---
description: SPEC 한 장을 구현·검토 짝(herdr 두 창)으로 실행한다 — 짝 불가면 /spec-run으로
argument-hint: <SPEC ID>
---

# /spec-pair — 구현·검토 짝으로 SPEC 실행

입력: `$ARGUMENTS` (SPEC ID)

`CLAUDE.md` 규칙을 따른다. 구현 창이 `/spec-run` 절차를 통째로 하고(회차·상태·커밋), 검토 창이 매 회 새 세션으로 변경을 보고 판정한다. 이 세션은 띄우고 기다리고 결과만 반영한다.

## 0. 쓰지 않는 때

야간(`/night-run`)에서는 쓰지 않는다 — 창을 띄우고 기다리므로 사람이 없으면 막힐 수 있다.

## 1. 이어 받기

`node .claude/harness/run-detached.mjs status pair-<ID>`가 `running`이면 3단계로, `done`인데 4단계를 아직 안 했으면 4단계로.

## 2. 시작

1. SPEC을 읽고 `.claude/commands/spec-run.md` 1단계 3번 점검(DRAFT·의존·반복 한도)에 걸리면 그 처리만 하고 끝(짝을 띄우지 않음).
2. `node .claude/harness/pair.mjs --check` — 종료 0이 아니면 보고 첫 줄을 「짝 불가 — <이유>」로 하고 같은 대화에서 `/spec-run <ID>` 절차로 실행한다.
3. 통과면 `node .claude/harness/run-detached.mjs start pair-<ID> -- node .claude/harness/pair.mjs . --label pair-<ID> --task ".claude/commands/spec-run.md 절차로 <ID>를 실행한다."`

## 3. 기다림

이 세션은 코드를 고치지 않는다(구현 창과 겹치지 않게). `node .claude/harness/run-detached.mjs wait pair-<ID>`를 최대 2번(명령 시간 한도 600초로). 그래도 `running`이면 「짝 진행 중 — 끝나면 `/spec-pair <ID>`로 결과 받기」를 보고하고 끝.

## 4. 결과

`status`의 출력 마지막 줄 `pair: <result> (<n>회 검토)`와 `.scratch/pair/<run>/`의 마지막 `review-N.md`를 읽는다.

- `ok` → SPEC 상태는 구현 창이 정한 대로 둔다.
- `rounds`(검토 지적이 남음) → SPEC이 `IMPLEMENTED`·`DONE`이면 `IN_PROGRESS`로 되돌리고 「실행 기록」에 남은 지적을 적어 커밋한다(❌가 있으면 IMPLEMENTED를 선언하지 않는다).
- `blocked`·`timeout`·`no-verdict`·`error` → 상태를 바꾸지 않고 이유와 herdr 작업 공간 `pair-<ID>`를 보고한다.

보고는 `.claude/commands/spec-run.md` 7장 형식으로, 첫 줄에 「짝: <result> (<n>회 검토)」. 작업 공간은 닫지 않는다(사람이 herdr에서 볼 수 있게).
