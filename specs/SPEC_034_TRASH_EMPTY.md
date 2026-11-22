---
id: SPEC_034
title: 「🗑 저장된 영상」에 휴지통 비우기 — Ear-Coach가 옮긴 파일만 영구 삭제
status: READY
iterations: 0
max_iterations: 3
depends_on: [SPEC_033]
after_implemented: true
---

# SPEC 034 — 「🗑 저장된 영상」에 휴지통 비우기 — Ear-Coach가 옮긴 파일만 영구 삭제

> 사람(2026-11-22): 「휴지통은 어디서 비워」 → 선택지 A/B 중 `[Button pressed: A 휴지통 비우기 버튼]`.

## 1. 목표
Obsidian엔 `.trash`를 비우는 화면이 없다. SPEC_033 「지우기」로 휴지통에 옮긴 파일을 플러그인이 기록해 두고, 같은 섹션의 「🧹 휴지통 비우기」 → 확인 창 → **기록한 파일만** 영구 삭제한다. 사람이 Obsidian에서 지운 다른 노트(같은 `.trash`)는 건드리지 않는다.

## 2. 파일
- 새 `src/services/videoTrash.ts` — obsidian import 없음. `.trash` 전후 목록 비교, 기록 파일 상태, 비우기(경로가 `.trash/` 밑일 때만). 변이용 `EAR_COACH_VIDEOTRASH_MODULE`.
- `src/ui/videoDataSection.ts` — 지우기 때 새로 생긴 `.trash` 파일 기록, 비우기 줄·확인 창.
- `src/ui/SettingsTab.ts` — trash 저장소(`adapter.list`·`stat`·`remove`)와 기록 연결.
- `src/types/settings.ts` — `videoDataTrash: string[]`(기본 `[]`).
- `tests/runTests.ts` Test 22 + `tests/fixtures/video-trash/cases.json`, 화면 검사 `expect.videoTrash`.
- `styles.css` 필요하면.

## 3. 정의
- 기록 = 설정 `videoDataTrash`(볼트 기준 경로, 예 `.trash/abcDEF12345.json`). 지우기 직전·직후 `.trash` 파일 목록의 차이를 더한다(같은 이름 충돌로 Obsidian이 이름을 바꿔도 잡힘).
- 비우기 줄(목록 아래): 이름 `🧹 휴지통 비우기`, 설명 `Ear-Coach가 옮긴 파일 N개 · <크기>`, 버튼 `비우기`(class `mod-warning`). N=0이면 설명 `휴지통에 Ear-Coach 파일이 없어요.`, 버튼 disabled.
- 확인 창: 제목 `휴지통의 Ear-Coach 파일 N개를 영구 삭제할까요?`, 경로 목록, 안내 `되돌릴 수 없어요. 다른 노트는 그대로예요.`, 버튼 `영구 삭제` / `취소`. 끝나면 알림 `🧹 파일 N개를 영구 삭제했어요`.
- 안전 규칙: `.trash/`로 시작하지 않거나 `..`이 든 경로는 지우지 않고 기록에서도 뺀다. 이미 없는 경로는 기록에서만 뺀다. 지우다 실패한 경로는 기록에 남긴다.

## 4. 범위 밖
- 기록 없이 `.trash`에 있는 파일(1.0.43으로 지운 것 포함 — 옛 데이터 호환 안 함), 다른 노트, Obsidian 「삭제된 파일」 설정, 자동 비우기, 되살리기 버튼.

## 5. 완료 조건
- [ ] 1. `videoTrash` 데이터 시험(전후 차이, 크기·개수, 비우기는 기록·존재·`.trash/` 밑만, `..`·밖 경로 거부, 실패 경로는 남김) + 변이 실패 확인 [자동]
- [ ] 2. 화면 검사 `expect.videoTrash`: 세로·가로 — 처음 `휴지통에 Ear-Coach 파일이 없어요.`·버튼 disabled → 영상 하나 지우기 → `Ear-Coach가 옮긴 파일 3개` → 비우기 → 확인 창 → 영구 삭제 → remove 호출이 기록 3개뿐(미리 넣어 둔 남의 `.trash` 노트는 안 지움) → 다시 0개, 넘침 없음, 스크린샷 열어 봄 [자동]
- [ ] 3. 회귀 통과(`verify.mjs --set regression`) [자동]
- [ ] 4. 실기기에서 영상 하나 지운 뒤 「🧹 휴지통 비우기」를 눌러 개수가 0이 되는지 보고 버튼 [수동]

## 6. 자동 검증
1 → Test 22 + 망가진 사본. 2 → `runUiCheck`, `video-trash-<뷰>.png`. 3 → `verify.mjs --set regression`.

## 7. 수동 검증
1. BRAT로 새 버전 받기 → 설정 → Ear-Coach → 맨 아래.
2. 지워도 되는 영상 `지우기` → `휴지통으로`.
3. `🧹 휴지통 비우기`의 `비우기` → `영구 삭제` → 「휴지통에 Ear-Coach 파일이 없어요.」가 보이는지 보고 버튼.

## 8. 가결정
- 기록 방식(전후 목록 차이) · 이유: 공식 API(`vault.trash`·`trashLocal`)를 그대로 쓰면서 바뀐 이름도 잡음 · 대안: 플러그인이 `.trash/ear-coach/`로 직접 옮기기(노트 색인 갱신 위험).
- 기록은 설정(data.json)에 · 이유: 이미 저장 경로가 있음, 작음 · 대안: 별도 JSON 파일.
- 1.0.43으로 이미 휴지통에 간 파일은 잡지 않음 · 이유: 옛 데이터 호환 안 함(사람 11-22) · 대안: 이름 패턴(`<id>.json`)으로 추정.

## 실행 기록
