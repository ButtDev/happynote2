---
id: SPEC_061
title: 새 노트 이름에서 링크를 깨는 글자 `# ^ [ ]` 빼기
status: READY
iterations: 0
max_iterations: 3
depends_on: []
parent: SPEC_060
---

# SPEC 061 — 노트 이름 링크 글자

> 2026-11-26 사람 「둘다지금」(브리핑 선택 1: 새 노트 이름에서 `# ^ [ ]` 빼기). SPEC_060 「범위 밖」을 이어 받음.

## 1. 목표
Obsidian 위키 링크 `[[…]]`는 이름 속 `#`(제목 링크)·`^`(블록 링크)·`[ ]`·`|`(이미 뺌) 때문에 깨진다. 새로 만드는 노트 이름에서 이 글자를 빼서, 노트를 링크·검색으로 바로 열 수 있게 한다. 영상 ID를 붙이는 끝 ` [<id>].md`는 앱 규칙이라 그대로 둔다. 하지 않을 것: 이미 만든 노트 이름 바꾸기(옛 데이터 호환 안 함, 사람 11-22).

## 2. 파일
- 수정 `src/utils/noteName.ts` `safeNoteTitle`.
- 수정 `tests/fixtures/note-name/cases.json`(Test 38 데이터). 러너는 기대 필드가 새로 필요할 때만 최소한.

## 3. 정의
- `safeNoteTitle`: 지금 금지 글자에 `#`, `^`, `[`, `]`를 더해 빈칸으로 바꾼 뒤(연속 빈칸은 하나로) 지금 규칙(70 코드 포인트·앞 점·끝 점/빈칸·빈 제목 `YouTube`) 그대로.
- 예: `Song [Official Video] #shorts` → `Song Official Video shorts`, `C# in 100 Seconds` → `C in 100 Seconds`, `Top 10 ^_^` → `Top 10 _`.
- `videoIdFromNoteName`·`findExistingNoteByVideoId`는 그대로 — 옛 이름(`Song [Official] [id].md`)도 지금처럼 ID를 읽고, 같은 영상은 옛 노트를 다시 씀(새 노트를 만들지 않음).

## 4. 범위 밖
이미 있는 노트 이름 바꾸기, 노트 본문 제목(`# 🎧 <제목>`) 바꾸기, 폴더 이름.

## 5. 완료 조건
1. [ ] Test 38: 3장 예 3개가 기대 이름과 같고, 불변식에 「`# ^ [ ] |`가 제목 부분(끝 ` [id].md` 앞)에 없음」 추가, 기존 사례 전부 통과 [자동: Test 38]
2. [ ] 옛 이름 `Song [Official] [dQw4w9WgXcQ].md` ID 되읽기 그대로 [자동: Test 38 id 사례]
3. [ ] 변이: `#`만 남기기 → Test 38 실패 [자동]
4. [ ] 회귀 통과 [자동: `verify.mjs --set regression`]

## 8. 가결정
- 빼는 글자를 빈칸으로(지우지 않고) · `C#Sharp`→`C Sharp`처럼 낱말이 붙지 않게 · 대안: 지우기
- ⏳ 없음 · 이름 규칙만 바뀌고 실기기에서 볼 것은 SPEC_062 확인 때 같이 보임 · 대안: 별도 확인

## 실행 기록
