---
id: SPEC_055
title: 약점 대시보드가 앱을 다시 켜도 지난 기록을 지키기
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 055 — 약점 대시보드 기록 지키기

> 야간 초안(2026-11-25). 사람 11-25 「모두 확인, 허락, 이어진행」으로 READY. 백로그 「대기」 맨 위 버그. night 브랜치 한도(열린 5개 / 한도 2) 때문에 밤에 실행하지 않고 DRAFT로 둠 — 사람이 「대기작업진행」이면 READY로 올려 낮에 main에서 실행.

## 1. 목표
「📌 안 들림 핀」을 꽂으면 `WeaknessTracker`가 메모리 목록 `entries`로 `My_Listening_Weakness.md`를 통째로 다시 쓴다. 앱을 다시 켜면 `entries`가 비어 있어 첫 핀이 지난 기록·TOP 횟수를 지우고 1줄만 남긴다(재현 `.scratch/weak/repro.mjs`: 다시 켜기 전 2줄 → 뒤 1줄).
할 것: 처음 기록할 때 기존 대시보드 파일을 읽어 `entries`를 되살린 뒤 덧붙인다. 하지 않을 것: 대시보드 모양·문구 바꾸기.

## 2. 파일
- 추가 `src/utils/weaknessDashboard.ts`: import 없는 순수 모듈 — `renderWeaknessDashboard(entries, now)`(지금 그리는 마크다운 그대로 + 끝에 숨은 주석), `parseWeaknessDashboard(markdown)`(entries 되살리기).
- 수정 `src/services/WeaknessTracker.ts`: 첫 기록 때 한 번 파일을 읽어 `parseWeaknessDashboard`, 그리기는 `renderWeaknessDashboard`로.
- 시험 `tests/runTests.ts` Test 37 + `tests/fixtures/weakness/cases.json`.

## 3. 정의
- 숨은 주석: 파일 끝 `<!-- ear-coach-weakness: <entries JSON> -->` (읽기 보기에 안 보임).
- 읽기: 숨은 주석이 있으면 그 JSON, 없거나 망가졌으면 빈 목록(지금과 같음). 고치기 전 옛 파일의 보이는 줄 되살리기는 하지 않는다 — 사람 규칙 「옛 데이터 호환 작업·확인을 하지 않는다」(11-22).
- 저장 개수: 숨은 주석엔 최대 500개(보이는 목록은 지금처럼 50개).

## 4. 범위 밖
대시보드 화면 모양·문구, 다른 볼트 파일·플러그인 폴더 저장, 약점 기록 지우기 기능.

## 5. 완료 조건
1. [x] 다시 켠 뒤 첫 핀이 지난 기록을 지키고 TOP 횟수가 누적된다 [자동: Test 37 「다시 켬」 사례]
2. [x] 숨은 주석 없는 파일·망가진 주석은 빈 목록(오류 없음), 주석을 깨는 글자(`-->`)가 든 문장도 그대로 되읽힌다 [자동: Test 37 parse·「주석을 깨는 글자」]
3. [x] 같은 영상·같은 시각(0.5초 안) 핀은 덮어쓰기(지금 규칙 유지), 망가진 주석은 빈 목록으로 [자동: Test 37]
4. [x] 보이는 마크다운이 고치기 전과 같은 규칙(제목·TOP 표·최근 50개)을 지킨다 [자동: Test 37 불변식]
5. [x] 변이(읽기 끔) 실패, 회귀 통과 [자동]
6. [ ] ⏳ 실기기: 핀 하나 → Obsidian 다시 켜기 → 핀 하나 → `My_Listening_Weakness.md`에 두 줄이 다 보이면 버튼 [수동]

## 6. 자동 검증
1~4: `npm test` Test 37(입력·기대는 `tests/fixtures/weakness/cases.json`). 5: 사본에서 읽기를 끄고 Test 37 FAIL 확인, `verify.mjs --set regression`.

## 8. 가결정
- 볼트 파일 하나 안 숨은 주석에 저장 · 파일 하나만 옮기면 기록이 따라감 · 대안: 플러그인 폴더 `weakness.json`(볼트 동기화에서 빠질 수 있음)
- 옛 파일 되살리기 안 함 · 사람 규칙(옛 데이터 호환 안 함, 11-22) · 대안: 보이는 줄 파싱(규칙 위반)

## 실행 기록
- 2026-11-25 회차 1: IMPLEMENTED — `src/utils/weaknessDashboard.ts`(순수: upsert·render·parse, 숨은 주석 최대 500), `WeaknessTracker` 첫 기록 때 `vault.read`로 되살림. 1·2·3·4 ✅ Test 37 「3 restart cases, 4 parse cases, limits」 PASS(행 순서·TOP 누적·0.5초 덮어쓰기·`-->` 되읽기·보이는 50/저장 500·제목 유지). 실제 트래커 재현 `.scratch/weak/repro.mjs`: 고치기 전 다시 켠 뒤 1줄 → 고친 뒤 3줄. 5 ✅ 변이: 읽기 끔 → 「weakness rows: 다시 켬」 FAIL, 이스케이프 둘 다 끔 → 「주석을 깨는 글자」 FAIL(하나만 끄면 다른 하나가 막아 통과 — 의도), `verify.mjs --set regression` harness·build·test·ui ok. 6 ⏳ (BRAT 1.0.65)
