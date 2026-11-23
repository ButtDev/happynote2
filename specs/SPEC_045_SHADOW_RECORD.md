---
id: SPEC_045
title: 쉐도잉 녹음 비교 — 정답 단계에서 따라 말하기 녹음 → 원음·내 녹음 번갈아 듣기
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: []
---

# SPEC 045 — 쉐도잉 녹음 비교

> 2026-11-23 사람: 「심야 스펙 준비해」 — 백로그 「[야간] 쉐도잉 녹음 비교」. 야간 실행, 아침 ⏳.

## 1. 목표
정답(3단계) 카드에 녹음 버튼을 둔다. 누르면 마이크로 따라 말하기를 녹음하고(문장 길이 + 2초에서 자동으로 멈춤, 최대 20초), 멈추면 「비교」로 **원음(유튜브 플레이어의 그 문장) → 내 녹음**을 차례로 한 번씩 들려준다. 녹음은 메모리에만 두고(카드마다 마지막 1개) 볼트·Anki에 저장하지 않는다. 발음 채점·파형 그리기는 하지 않는다.

## 2. 파일
- 새 `src/utils/shadowing.ts`(순수: 녹음 한도·MIME 고르기·버튼 상태) + Test 31 + `tests/fixtures/shadowing/cases.json`, 변이용 `EAR_COACH_SHADOWING_MODULE`.
- 새 `src/ui/shadowRecorder.ts`(녹음·재생 — `getUserMedia`·`MediaRecorder`·`Audio`를 주입받음).
- `src/ui/components/SegmentCard.ts`: 3단계 버튼 줄에 녹음·비교 버튼, 콜백 `onPlayOriginal(segment)`.
- `src/ui/EarCoachView.ts`: 콜백 연결만(원음 = `playerBar.playSegment(seg, false)`). **900줄 한도 유지**(넘으면 기존 코드를 모듈로 옮김).
- `styles.css`, `tests/ui/entry.ts`(가짜 마이크·MediaRecorder·Audio), `tests/ui/runUiCheck.mjs`·`cases.json` `expect.shadowing`.

## 3. 정의
- `SHADOW_EXTRA_SEC = 2`, `SHADOW_MAX_SEC = 20`(= `CLIP_MAX_SEC`). `shadowLimitSec(duration) = min(duration + 2, 20)`, duration이 0 이하·숫자 아님 → 20.
- `pickRecorderMime(isSupported)`: `["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]` 중 처음 되는 것, 없으면 `""`(브라우저 기본).
- 버튼 글자(모바일·데스크톱 같음): 대기 `🎙`(aria-label `따라 말하기 녹음`), 녹음 중 `⏹ <남은 초>`(누르면 멈춤), 녹음 있음 → `🎙` 옆에 `🔁 비교`(aria-label `원음과 내 녹음 듣기`).
- 비교: `onPlayOriginal(seg)` → `seg.duration + 0.3`초 뒤 내 녹음 재생. 비교 중 다시 누르면 둘 다 멈춤.
- 실패(권한 거부·`MediaRecorder` 없음·`getUserMedia` 없음): `failureNotice("녹음", err)` 해요체 한 줄 + `diagnostics.record("shadow.record", err)`. 거부면 「마이크 권한을 허용해 주세요」가 들어간 문구.
- 녹음 중 다른 카드에서 녹음을 시작하면 앞 녹음은 멈춤(마이크 하나). 카드가 화면에서 빠지면(가상 목록 재사용) 마이크 트랙을 닫는다.

## 4. 범위 밖
발음 점수·파형·속도 비교, 녹음 파일 저장·Anki 첨부, 원음을 audioClip으로 따로 받기, 데스크톱 전용 개선.

## 5. 완료 조건
1. [ ] Test 31: `shadowLimitSec`(짧은 문장·20초 넘는 문장·0·NaN) · `pickRecorderMime`(opus 됨·mp4만·아무것도 안 됨) 기대값과 같음 + 변이 실패 [자동]
2. [ ] 화면 검사 `expect.shadowing`(세로·가로): 3단계 카드에 `🎙` 1개 → 누름 → 가짜 MediaRecorder start 1번·글자 `⏹ N` → 한도 시각에 자동 stop → `🔁 비교` 보임 → 누름 → `onPlayOriginal` 그 문장 1번, 그 뒤 가짜 Audio play 1번(순서 원음 → 녹음). 1·2단계 카드엔 `🎙` 없음. 카드·버튼 줄 가로 넘침 없음. `shadow-<뷰>.png` 열어 봄 [자동]
3. [ ] 화면 검사: 가짜 `getUserMedia`가 `NotAllowedError`면 알림에 「마이크 권한」 문구, 「니다」 없음, MediaRecorder 생성 0번. 변이(실패를 삼킴) 실패 [자동]
4. [ ] 회귀 `verify.mjs --set regression`, `EarCoachView.ts` 900줄 이하 [자동]
5. [ ] 실기기: BRAT 업데이트 뒤 카드 하나를 정답 단계로 열고 `🎙` → 권한 허용 → 따라 말하기 → `🔁 비교`를 눌러 원음 다음에 내 목소리가 들리는지 보고 버튼 [수동]

## 6. 자동 검증
- 1: `npm test` Test 31, 변이 `EAR_COACH_SHADOWING_MODULE`.
- 2·3: `ui` 항목(가짜 마이크는 `window.__shadow*`로 호출 기록), 스크린샷 열어 관찰. 3 변이는 `shadowRecorder.ts` catch를 빈 블록으로 바꾼 사본으로 한 번.
- 4: `node .claude/harness/verify.mjs --set regression --json`, `wc -l src/ui/EarCoachView.ts`.

## 7. 수동 검증
1. BRAT 업데이트. 2. 영상 카드 하나 → 「정답」 단계 → `🎙` → (처음이면) 마이크 허용. 3. 문장을 따라 말함(자동으로 멈춤). 4. `🔁 비교` → 원음 → 내 목소리 순서로 들리면 OK.

## 8. 가결정
- 원음 = 유튜브 플레이어로 그 문장 재생 · 이유: 이미 있는 길, 네트워크 추가 없음 · 대안: audioClip WAV(SPEC_036)로 받아 Audio로 재생(오프라인 비교 가능하지만 받는 시간).
- 정답(3단계)에서만 · 이유: 쉐도잉은 문장을 본 뒤 하는 연습 · 대안: 모든 단계.
- 메모리에만 · 이유: 저장은 용량·사생활 결정이 필요 · 대안: 볼트에 저장(사람 결정).

## 실행 기록
- 2026-11-24 회차 1 (야간): IMPLEMENTED — 1 ✅ `npm test` Test 32 PASS(7 limit·5 mime·4 label·6 failure), 변이 EAR_COACH_SHADOWING_MODULE 한도(+1)→「shadowLimitSec: 짧은 문장 2.4초 → 4.4 → 3.4」, 형식(항상 "")→「pickRecorderMime: opus 됨」 실패 · 2 ✅ 화면 검사 shadowing 세로·가로 ok: 1·2단계 카드 🎙 [0,0], 3단계 🎙 1개, 누름 → MediaRecorder 1번(opus)·「⏹ 6」, 한도 5.45초에 자동 stop 5454ms, 🔁 비교 보임, 원음 playSegment [[0,false]] 1번 → 3806ms 뒤 Audio play 1번(기대 3750±400), 카드·줄 넘침 0; shadow-portrait/landscape.png 열어 봄 — 정답 문장 아래 「🎙 · 🔁 비교」 한 줄, 겹침 없음 · 3 ✅ shadowing.denied ok: 알림 「❌ 녹음 — 마이크 권한을 허용해 주세요」, MediaRecorder 0번, 진단 shadow.record; 변이(catch 비움) → notices [] 로 세로·가로 실패 · 4 ✅ verify --set regression ok:true exit 0(worktree), EarCoachView 897줄 · 5 ⏳ 실기기
  - 가결정: 시험 번호 Test 32(31은 SPEC_048이 이미 씀) · 대안 없음. 버튼 줄은 새 `src/ui/shadowRow.ts`로(SegmentCard 334줄 유지·상태는 공용 ShadowRecorder) · 대안 SegmentCard 안. 콜백 `onStopOriginal`(= playerBar.pause) 추가 — 내 녹음 직전·비교 멈춤 때 원음을 멈춤(안 그러면 영상이 계속 말함) · 대안 원음을 그대로 둠. 실패 이유 `shadowFailureReason`(거부·마이크 없음·미지원)을 순수 모듈에 둠. 녹음은 메모리 최대 20개(오래된 것 버림).

