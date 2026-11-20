---
description: 요구사항을 SPEC 한 장으로 바꾸고, 질문이 없으면 바로 실행한다
argument-hint: <요구사항 문장 또는 로드맵의 SPEC ID>
---

# /spec-new — 요구사항 → SPEC 초안

입력: `$ARGUMENTS`

`CLAUDE.md` 규칙을 따른다. 1~4단계는 제품 코드를 만들거나 고치지 않는다(쓰는 곳은 `specs/`, `MEMORY.md`, `log/`뿐). READY면 5단계에서 `/spec-run` 절차로 이어 간다.

## 1. 맥락 읽기

- `OVERVIEW.md`(방향·하지 않을 것), `MEMORY.md`, `node .claude/harness/status.mjs`(지금 상태)
- 관련 있는 기존 SPEC (공개 이름·데이터 구조를 이어받기 위해). 전부 읽지 않는다.

## 2. 범위 판단

- 완료 조건이 15개를 넘거나 서로 독립적인 기능이 둘 이상이면 나눈다. 첫 조각만 쓰고 나머지는 새 번호 + `parent:`로 로드맵(MEMORY 「다음」)에 적는다.
- `OVERVIEW.md` 「하지 않을 것」에 해당하면 쓰지 않고 이유를 보고한다.

## 3. SPEC 파일

`specs/SPEC_NNN_<SLUG>.md` (NNN = 지금 가장 큰 번호 + 1, SLUG = 대문자 영어 한두 단어). 같은 번호 파일이 있으면 멈춘다. 형식은 `specs/_TEMPLATE.md`.

- 모든 완료 조건은 관찰 가능해야 한다(수치·문구·상태값). 「자연스럽다」 같은 말은 ⏳로만.
- `[자동]` 조건마다 무엇으로 판정할지(회귀, `grep`, 스크린샷, 회귀 밖 `harness.json` 항목) 적는다. 회귀 밖 항목은 이 SPEC이 그 대상을 건드릴 때만 넣는다.
- `[수동]`(⏳)은 마지막 조건 하나로 모으고, 「무엇을 보고 고른다」 한 동작으로 쓴다(설정 바꾸기·비교 같은 추가 절차 없이).
- 결정이 필요하면 CLAUDE.md 5장 결정 등급을 따른다: 되돌리기 쉬운 것은 추천안을 골라 본문에 「가결정」으로 적는다. 사람에게 물을 것만 `[사람 확인 필요: <질문> — 선택지 / 추천안]`으로 남긴다.

## 4. 상태·기록

- 묻는 질문이 없으면 `status: READY`, 있으면 `status: DRAFT`.
- `node .claude/harness/log.mjs append runs '{"cmd":"/spec-new","spec":"SPEC_NNN","result":"DRAFT|READY","questions":N}'`
- SPEC 파일·`log/` 변경을 함께 커밋한다(`SPEC_NNN: 초안` 또는 `SPEC_NNN: READY`).

## 5. 이어서 실행 또는 보고

- **READY**: 사람에게 「진행할까」를 묻지 않고 같은 대화에서 `/spec-run SPEC_NNN` 절차(`.claude/commands/spec-run.md`)를 이어서 한다. 입력에 「초안만」「실행하지 마」가 있으면 하지 않는다. 보고는 spec-run 보고 하나로 한다(그 첫 줄에 「SPEC_NNN 만들고 실행」).
- **DRAFT**: 짧게 보고한다.

```
**SPEC_NNN — <제목> (DRAFT)** · 목표: <한 줄>
1. <질문> — 선택지 / 추천안
[buttons: <답1> | <답2>]
```

사람이 답하면: 본문에 반영하고 `[사람 확인 필요]`를 지우고, 답 원문을 `log.mjs append confirmations '{"spec":…,"item":…,"answer":…,"raw":"<원문>"}'`로 남기고, 질문이 다 풀렸으면 `status: READY`로 바꿔 커밋한 뒤 위 「READY」대로 이어서 실행한다.
