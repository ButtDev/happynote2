---
id: SPEC_060
title: 노트 파일 이름 다듬기 — 이모지 반쪽·숨은 파일·제목 속 대괄호
status: DONE
iterations: 1
max_iterations: 2
depends_on: []
---

# SPEC 060 — 노트 파일 이름 다듬기

야간 자가 확정(스스로 찾기: 시험 없는 `NoteGenerator` 이름 규칙). 화면·공개 이름은 바뀌지 않는다. 보통 제목의 노트 이름은 지금과 같다.

## 1. 목표
`NoteGenerator.getNoteFilePath`는 제목을 UTF-16 70칸에서 잘라 끝 이모지의 반쪽(짝 없는 서로게이트)이 파일 이름에 남을 수 있고, 점으로 시작하는 제목(`.NET …`)은 숨은 파일이 되어 Obsidian 목록에 안 보이고, 끝의 점·빈칸이 남는다. `extractVideoIdFromFile`은 frontmatter가 없을 때 이름의 **첫** `[…]`을 골라 `Song [Official] [id].md`에서 `Official`을 영상 ID로 읽는다. 순수 모듈로 옮겨 고치고 데이터 시험으로 지킨다.

## 2. 파일
- `src/utils/noteName.ts`(새, import 없음): `safeNoteTitle`·`noteFileName`·`videoIdFromNoteName`.
- `src/services/NoteGenerator.ts`: 두 곳이 위 함수를 부름.
- `tests/runTests.ts` Test 38 + `tests/fixtures/note-name/cases.json`, 변이 `EAR_COACH_NOTENAME_MODULE`.

## 4. 범위 밖
- 이미 만든 노트 이름 바꾸기, `# ^ [ ]`(링크가 깨지는 글자) 빼기 — 새 노트 이름이 눈에 띄게 바뀌므로 사람 결정.

## 5. 완료 조건
- [x] 1. Test 38 PASS: 제목 8개(보통·금지 글자·이모지 경계·앞 점·끝 점·빈 제목·제어 문자·한글 70자) 기대 이름과 같고, 불변식(70 코드 포인트 이하, 금지 글자·반쪽 서로게이트·앞 점·끝 빈칸 없음, 이름에서 ID 되읽기) 지킴. ID 4개(앱 이름·제목 속 대괄호·끝 아님·없음) [자동]
- [x] 2. 변이 3개가 Test 38에서 실패: 옛 구현 그대로, 첫 대괄호 고르기, 앞 점 남기기 [자동]
- [x] 3. `tsc` 0, `verify.mjs --set regression` 통과 [자동]

## 8. 가결정
- 앞 점·끝 점을 뺌(바꾸지 않고) · 숨은 파일·Windows/Android 끝 점 문제를 없애는 가장 작은 변경 · 대안: 앞에 `_` 붙이기.
- 빈 제목 → `YouTube` · 이름이 ` [id].md`로 시작하지 않게 · 대안: 영상 ID만.
- ID는 끝 `[id].md` 먼저, 없으면 맨 끝 대괄호 · 앱이 만드는 이름 규칙과 같음 · 대안: 11자로 고정(옛 노트에 다른 길이가 있을 수 있어 6~15 유지).

## 실행 기록

### 2026-11-26 야간 #1 — DONE
- 1 ✅ `node --experimental-strip-types tests/runTests.ts` → `[Test 38] … -> PASS: 8 title cases, 4 id cases.`, `ALL TESTS PASSED SUCCESSFULLY!`. 예: `aaa…a😀 tail`(69+이모지) → `aaa…a😀 [abcDEF12345].md`, `.NET 8 in 100 Seconds` → `NET 8 in 100 Seconds [abcDEF12345].md`, `Song [Official] [dQw4w9WgXcQ].md` → `dQw4w9WgXcQ`.
- 2 ✅ 변이(`.scratch/mut/`): 옛 구현 → `note name: 70자 끝의 이모지를 반쪽으로 자르지 않음`; 첫 대괄호 → `note id: 끝이 아니면 맨 끝 대괄호`; 앞 점 남기기 → `note name: 점으로 시작하면 숨은 파일이 되므로 앞 점을 뺌`. 셋 다 AssertionError.
- 3 ✅ `tsc -noEmit` 0, `verify.mjs --set regression` → harness·build·test·ui ✅, `verify: ok`.
