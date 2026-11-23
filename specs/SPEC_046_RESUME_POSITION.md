---
id: SPEC_046
title: 이어 보기 — 영상별 마지막 재생 위치를 기억하고 다시 열면 그 문장으로
status: READY
iterations: 0
max_iterations: 3
depends_on: [SPEC_040]
---

# SPEC 046 — 이어 보기

> 2026-11-23 사람: 「심야 스펙 준비해」 — 백로그 「[야간] 이어 보기」. 야간 실행, 아침 ⏳.

## 1. 목표
재생 중 위치를 학습 기록(`learning.setPosition`, SPEC_040 — 아직 연결 안 됨)에 남기고, 같은 영상을 다시 열면(특정 시각을 지정하지 않고 열 때) 그 위치로 옮겨 두고(재생은 안 함) 그 문장 카드로 목록을 스크롤한 뒤 알림 「⏩ 지난번 M:SS부터 이어요」를 띄운다. 카드별 단계는 이미 세션 노트에 저장되므로 새로 하지 않는다. 첫 화면(영상 없음)의 「최근 영상 이어서」 목록은 하지 않는다.

## 2. 파일
- 새 `src/utils/resume.ts`(순수) + Test 32 + `tests/fixtures/resume/cases.json`, 변이용 `EAR_COACH_RESUME_MODULE`.
- 새 `src/ui/resumePosition.ts`(저장 타이머·복원 — EarCoachView는 연결 몇 줄).
- `src/ui/EarCoachView.ts`: `loadSession`(복원), 재생 시각 갱신·일시정지·닫기(저장) 연결만. **900줄 한도 유지**.
- `tests/ui/entry.ts`(가짜 `learning.position`·`setPosition`), `tests/ui/runUiCheck.mjs`·`cases.json` `expect.resume`.

## 3. 정의
- `RESUME_MIN_SEC = 5`, `RESUME_END_MARGIN_SEC = 5`, `POSITION_SAVE_EVERY_SEC = 10`.
- `resumePoint(pos, lastSegmentEnd)`: pos 없음 → null, `pos.seconds < 5` → null, `pos.seconds > lastSegmentEnd - 5` → null(끝까지 봄), 아니면 `pos.seconds`.
- `shouldSavePosition(lastSavedSec, nowSec)`: 처음(null)이거나 `|now - last| >= 10`이면 true.
- 저장 때: 재생 중 시각 갱신마다 `shouldSavePosition`이 true면 `setPosition(videoId, sec)`, 일시정지·뷰 닫기·다른 영상 열기 때는 무조건 한 번.
- 복원: `focusTimestampSec`가 없을 때만. `playerBar.seekTo(sec)` + 그 시각 문장으로 `scrollToSegment` + 알림 `⏩ 지난번 ${M:SS}부터 이어요`(시각은 `formatSecondsToTimestamp`와 같은 모양).

## 4. 범위 밖
첫 화면 최근 영상 목록, 자동 재생, 기기 사이 동기화, 단계 기억(이미 세션에 있음).

## 5. 완료 조건
1. [ ] Test 32: `resumePoint`(없음·4초·가운데·끝 5초 안·끝 지남)·`shouldSavePosition`(처음·9초·10초·뒤로 감기) 기대값과 같음 + 변이 실패 [자동]
2. [ ] 화면 검사 `expect.resume`(세로·가로): 가짜 `position` = 가운데 문장 시각 → 영상 다시 열기 → `seekTo` 그 시각 1번·그 문장 카드가 목록 보이는 범위 안·알림 「⏩ 지난번 …부터 이어요」, `focusTimestampSec`를 주고 열면 복원 안 함, position 없음 → seekTo 0번·알림 없음 [자동]
3. [ ] 화면 검사: 재생 시각을 0→25초로 흘리면(`seekTo`로 흉내) `setPosition` 호출이 3번 이하(10초마다), 일시정지 때 1번 더, 값은 그때 시각 ±1초. 변이(간격 무시) 실패 [자동]
4. [ ] 회귀 `verify.mjs --set regression`, `EarCoachView.ts` 900줄 이하 [자동]
5. [ ] 실기기: BRAT 업데이트 뒤 영상을 중간쯤까지 보다 닫고 다시 열면 그 문장 근처로 가 있고 「⏩ 지난번 …부터 이어요」가 뜨는지 보고 버튼 [수동]

## 6. 자동 검증
- 1: `npm test` Test 32, 변이 `EAR_COACH_RESUME_MODULE`.
- 2·3: `ui` 항목, 스크린샷 `resume-<뷰>.png` 열어 관찰. 3 변이는 `resumePosition.ts`의 간격 검사를 뺀 사본으로 한 번.
- 4: `node .claude/harness/verify.mjs --set regression --json`, `wc -l src/ui/EarCoachView.ts`.

## 7. 수동 검증
1. BRAT 업데이트. 2. 영상을 열어 중간까지 재생 → 일시정지 → 노트 닫기. 3. 같은 영상 노트 다시 열기 → 그 문장 근처 + 알림이면 OK.

## 8. 가결정
- 위치만 옮기고 재생 안 함 · 이유: 모바일 자동 재생은 막히고, 갑자기 소리 나는 것 방지 · 대안: 바로 재생.
- 알림으로 알림(되돌리기 버튼 없음) · 이유: 처음부터 보고 싶으면 맨 위로 스크롤하면 됨 · 대안: 「처음부터」 버튼.
- 10초 간격 · 이유: 파일 쓰기 줄이기(모바일) · 대안: 5초.

## 실행 기록
