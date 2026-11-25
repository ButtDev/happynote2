---
id: SPEC_058
title: EarCoachView 덜어내기 — 크기 조절 막대 두 개를 paneResizers.ts로
status: DONE
iterations: 1
max_iterations: 2
depends_on: []
---

# SPEC 058 — EarCoachView 덜어내기 — 크기 조절 막대 두 개를 paneResizers.ts로

야간 자가 확정(백로그 「대기」 맨 위). 화면·동작은 바뀌지 않는다.

## 1. 목표
`src/ui/EarCoachView.ts`가 895줄로 시험 상한(<900, Test 5)에 닿아 다음 기능이 막힌다. 자기 완결적인 두 메서드(모바일 영상·목록 막대 `setupMobileTouchResizer`, 데스크톱 튜터 패널 막대 `setupTutorResizer`)를 새 모듈로 옮겨 750줄 아래로 줄인다. 로직은 한 글자도 바꾸지 않고 `this.plugin.` → `host.`만 바꾼다.

## 2. 파일
- 추가 `src/ui/paneResizers.ts`: `ResizerHost`, `setupMobileTouchResizer(host, …)`, `setupTutorResizer(host, …)`
- 수정 `src/ui/EarCoachView.ts`: 두 메서드 삭제, 호출을 모듈 함수로, `landscapeSplit` import 제거

## 3. 정의
- `export interface ResizerHost { settings: EarCoachSettings; saveSettings(): Promise<void> }` — 플러그인 인스턴스가 그대로 맞는다.

## 4. 범위 밖
- 막대 동작·수치(25~72%, 기본 50/58, 140px 최소) 변경, 다른 묶음(툴바·목록 갱신) 이동.

## 5. 완료 조건
- [x] 1. `EarCoachView.ts` 750줄 미만, 모든 src 파일 <900 (Test 5) [자동]
- [x] 2. `tsc --noEmit` 오류 0, `verify --set regression` 통과 [자동]
- [x] 3. 화면 검사의 양 뷰 rects·checks가 옮기기 전 기준선과 같다(가로 막대 끌기 before/after/reset 포함) [자동]

## 6. 자동 검증
1. `wc -l` + Test 5 출력. 2. 명령 출력. 3. `.scratch/base/report.json`(옮기기 전) vs 새 `report.json`의 `viewports[].rects`·`checks`(시각·타이밍 필드 제외) 비교.

## 8. 가결정
- 옮길 묶음: 크기 조절 막대 두 개 · 상태가 지역 변수뿐이고 설정 읽기/저장만 의존해 위험이 가장 적음 · 대안: 툴바(`renderCommonToolbar`)는 filterMode·session 등 뷰 상태를 많이 써서 이동 시 인터페이스가 커짐.
- 의존을 `ResizerHost`로 좁힘 · 플러그인 전체 타입 대신 필요한 두 개만 · 대안: `EarCoachPlugin` 직접.

## 실행 기록

### 2026-11-26 야간 #1 — DONE
- 1 ✅ `wc -l`: EarCoachView.ts 895→730, paneResizers.ts 180. Test 5 PASS(전 파일 <900).
- 2 ✅ `npx tsc --noEmit` exit 0. `verify.mjs --set regression` → `verify: ok`(harness·build·test·ui).
- 3 ✅ 기준선(옮기기 전 같은 worktree에서 찍음) vs 새 report: rects 양 뷰 같음, checks 50/58개 전부 ok, `landscapeResizer` detail 글자 그대로 같음(before 58 → after 42 → reset). 다른 점은 `resume.save`의 재생 시각 소수점(0→0.1)뿐 — 기준선에서도 뷰마다 다른 타이밍 흔들림이라 이동과 무관.
- 데스크톱 `setupTutorResizer`는 화면 검사에 안 걸림(모바일 뷰만) — 본문은 `this.plugin.`→`host.` 말고 그대로, tsc로 형만 확인. 변이 시험: 새 시험 없음(기존 landscapeResizer 검사가 지킴).
