---
description: 야간 작업 한 건을 끝까지 한다 (harness.json night.enabled일 때)
---

# /night-run — 야간 작업

`CLAUDE.md` 규칙을 따른다. `harness.json`의 `night.enabled`가 false면 아무것도 하지 않고 끝낸다.

## 1. 할 일 고르기

`node .claude/harness/gate.mjs` 한 번.
- `mode=spec`: `runnable` 첫 SPEC을 `/spec-run` 절차로.
- `mode=improve`: 아래 순서로 첫 후보 한 건 — 이어 할 `night/*` 브랜치 → `memory/backlog.md` 「## 대기」 맨 위 → `verify.mjs` 실패 → 스스로 찾기(빠진 시험, 문서·코드 불일치, 구조 개선).

## 2. 하기

- 간이 변경은 main에 바로. 그보다 크면 `night/<ID>` 브랜치·worktree(`.scratch/wt/<ID>`)에서 SPEC(「야간 자가 확정」) → 검증 → main을 merge해 회귀 재통과 → **fast-forward로만** main에 합침. 열린 `night/*`는 `night.maxNightBranches`(기본 2)까지.
- 구현·검토 짝(`/spec-pair`)은 쓰지 않는다(창을 띄우고 기다리므로 사람이 없으면 막힐 수 있다).
- ⏳는 승인하지 않는다. 사람에게 물을 결정은 하지 않고 백로그·보고에 남긴다. 콘텐츠를 바꾸지 않는다.
- 같은 후보가 두 번 실패하면 백로그 「## 보류」로 옮긴다.

## 3. 보고

`log/night/<날짜>.md`에 세 절: **한 일 / 커밋 / 아침에 볼 것**(⏳, 열린 질문, 보류로 옮긴 것).
