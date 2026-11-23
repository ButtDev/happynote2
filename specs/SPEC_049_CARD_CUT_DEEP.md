---
id: SPEC_049
title: 문장 끊기 심화 — 영상 종류 넓히기 · 시간 길이 · 자르는 자리 품질
status: IMPLEMENTED
iterations: 1
max_iterations: 3
depends_on: [SPEC_048]
after_implemented: true
---

# SPEC 049 — 문장 끊기 심화

> 2026-11-23 사람: SPEC_048 OK 뒤 「이항목은 심야 스펙으로 좀더 심화해봐」. 야간 실행. 화면은 바뀌지 않지만 카드 글자가 바뀌므로 아침 ⏳ 하나.

## 1. 목표
SPEC_048은 TED 한 편(수동·자동)과 노래 한 곡으로만 길이를 맞췄다. 이번에는 (1) 말투가 다른 실제 자막을 더 모아 시험 대상을 넓히고, (2) 낱말 수뿐 아니라 **재생 시간**이 너무 짧거나 긴 카드도 재고, (3) 길이가 맞아도 **엉뚱한 자리에서 자른** 카드(관사·전치사 뒤, 구동사 사이, 「you know」 사이)를 줄인다. 시험이 먼저, 고치기는 그다음이다. SPEC_048의 수치 기준(Test 31·Test 14)은 약하게 바꾸지 않는다(좁히는 것만 된다).

## 2. 파일
- `tests/fixtures/transcript/` — 새 실제 자막 3~4개(srv3, 받은 날짜·영상 id·종류를 `cases.json` `_about`이나 `segment-length/cases.json`에 적음)
- `tests/fixtures/segment-length/cases.json` — 새 영상 `real` 항목, 시간 기준, 자르는 자리 기준, 합성 사례 추가
- `tests/runTests.ts` Test 31 — 시간·자르는 자리 지표 추가(지표 계산은 러너가, 기준값은 데이터)
- `src/workers/segmentBalance.ts`, `src/workers/transcriptProcessor.ts` — 고치기
- 새 `scripts/segment-report.mjs`(또는 `.ts`) — 영상 하나를 넣으면 고치기 전후 카드 길이 분포와 바뀐 카드 예시를 글로 찍는 도구(사람·다음 세션용, 시험 아님)

## 3. 정의
- **새 실제 자막(3~4개, 말투를 다르게)**: 빠른 대화체(팟캐스트·인터뷰, 화자 둘 이상), 천천히 또렷한 학습용 영상, 일상 브이로그(자동 자막만), 뉴스·강의 중 하나. 공개 영상만, Android innertube player baseUrl로 srv3 받기(SPEC_018 방식, `src/services/captionPayload.ts`로 파싱). 가능하면 같은 영상의 수동·자동 둘 다. 파일 하나 300KB 이하(넘으면 앞부분만 잘라 저장하고 `_about`에 적음).
- **시간 지표**: 카드 재생 시간 < `minCardSec` 1.0초 비율, > `maxCardSec` 10초 비율. 노래(rick)는 시간 기준 제외 가능(`_about`에 이유).
- **자르는 자리 지표(cut quality)**: 카드 경계마다 「앞 카드 마지막 낱말 · 다음 카드 첫 낱말」 쌍을 보고 나쁜 자름으로 센다.
  - 앞이 `DANGLING_TAIL_WORDS`(SPEC_048) — 이미 있음
  - 구동사 쪼갬: 앞이 동사, 다음 첫 낱말이 붙는 부사(up·down·out·off·on·in·back·away·over)이고 다음 카드가 그 낱말 하나로 문장을 시작 — 목록은 `segmentBalance.ts` 상수로
  - 말버릇 쪼갬: 「you | know」「I | mean」「kind | of」「sort | of」「a lot | of」 사이
  - 숫자·고유명 쪼갬: 앞뒤가 둘 다 숫자이거나 둘 다 대문자로 시작하는 낱말(문장 첫 낱말 제외, 수동 자막만)
- **자동 자막 자르기 점수**: `ASR_MAX_WORDS`로 넘쳐 자를 때 지금은 「가장 긴 쉼」만 본다. 점수 = 쉼 길이 − 나쁜 자름 벌점 + (다음 낱말이 접속사·wh-낱말이면 가산)으로 바꾼다. 수치는 가결정으로 고르고 SPEC 「가결정」에 적는다.
- **구두점 자막**: 쉼표가 없는 25낱말 넘는 문장은 절 시작 낱말(and·but·because·which·who·that·when·where·so) 앞에서 자를 수 있게 한다. 양쪽 6낱말 이상일 때만.
- 바뀐 카드 수가 많으면 `segment-report`로 예시 10개 이상을 실행 기록에 남긴다.

## 4. 범위 밖
AI 문장 복원(SPEC_022)의 카드 다시 자르기, 화면·설정 추가(길이 기준을 사람이 고르는 설정은 만들지 않음), 이미 저장된 영상 다시 자르기, 유료 API·음성 인식 직접 돌리기.

## 5. 완료 조건
1. [ ] 새 실제 자막 3개 이상이 `tests/fixtures/transcript/`에 있고 각자 종류·영상 id·받은 날짜가 데이터에 적혀 있다 [자동: 파일·`_about` grep]
2. [ ] Test 31이 새 영상 전부에 SPEC_048과 같은 지표(최대 낱말·짧은·긴·말 걸림·글자 없음)를 검사한다 [자동: 회귀]
3. [ ] Test 31에 시간 지표(<1초, >10초 비율)가 영상마다 기준값과 함께 있다 [자동: 회귀]
4. [ ] Test 31에 자르는 자리 지표(구동사·말버릇·숫자/고유명 쪼갬)가 있고, 고치기 전 수치(`before`)와 후 수치가 실행 기록에 있다 [자동: 회귀 출력]
5. [ ] 합성 사례 추가: 구동사(「pick | up the phone」), 말버릇(「you | know」), 넘칠 때 접속사 앞 자르기, 쉼표 없는 긴 구두점 문장 자르기 — 각 글자 그대로 [자동: 회귀]
6. [ ] 모든 영상에서 나쁜 자름 비율이 고치기 전보다 줄거나 같고, 적어도 한 영상에서 줄었다 [자동: 회귀 출력의 before→after]
7. [ ] SPEC_048 기준(Test 31 기존 항목 기준값, Test 14 불변식)은 그대로이거나 더 좁다 [자동: `git diff`로 기준값 확인]
8. [ ] 새 지표마다 변이 시험: SPEC_048 커밋(`745ed98`)의 `transcriptProcessor`로 돌리면 Test 31 새 항목이 실패한다 [자동: `EAR_COACH_SEGMENT_MODULE`]
9. [ ] `scripts/segment-report`가 영상 파일 하나로 전후 분포와 바뀐 카드 예시를 찍는다(실행 출력을 실행 기록에) [자동: 명령 출력]
10. [ ] 회귀 통과(`verify.mjs --set regression`) [자동]
11. [ ] Android에서 **새 영상**(말이 빠른 것 하나)을 열고 카드 몇 개를 넘겨 보며 엉뚱한 데서 끊긴 카드가 줄었는지 보고 버튼 [수동]

## 6. 자동 검증
1 `ls`·grep, 2~6 Test 31 출력, 7 `git diff 745ed98 -- tests/fixtures/segment-length tests/fixtures/transcript/cases.json tests/runTests.ts`에서 기존 기준값이 느슨해지지 않았는지, 8 옛 모듈을 `.scratch/old/`에 꺼내 `EAR_COACH_SEGMENT_MODULE=… npm test`, 9 스크립트 실행 출력, 10 `verify.mjs --set regression`.

## 7. 수동 검증 (아침)
BRAT로 새 버전 업데이트 → 말이 빠른 새 영상(팟캐스트·인터뷰) 하나 열기 → 카드 10개쯤 넘겨 보기 → 버튼.

## 8. 가결정
- 새 영상 고르기는 야간 에이전트가 한다 · 시험 데이터일 뿐 학습 콘텐츠가 아님 · 대안: 사람이 영상 지정(아침에 바꿀 수 있음)
- 기준값은 「고친 뒤 수치 + 약간의 여유」로 정하되 고치기 전 코드가 실패하도록 · SPEC_048과 같은 방식

## 실행 기록
- 2026-11-24 회차 1: IMPLEMENTED (야간, night/SPEC_049) — 1 ✅ 새 실제 자막 5개 `tests/fixtures/transcript/`(sinek-interview-asr hER0Qp6QJNU 인터뷰·casey-vlog-asr jG7dSXcfVqE 브이로그·mit-lecture-manual/asr HtSuA80QTyo 강의(asr은 앞 28분 150KB로 자름)·treasure-talk-manual eIho2S0ZahI 또렷한 강연), `segment-length/cases.json` real에 video·style·fetched 2026-11-24 5건(grep 5) · 2 ✅ Test 31이 8개 영상 모두 최대 낱말·짧은·긴·말 걸림·글자 없음 검사(회귀 PASS) · 3 ✅ 시간 지표 underSec(<1초)·overSec(>10초) 영상별 기준값(rick은 노래라 timeExempt) · 4 ✅ 구동사·말버릇·숫자/고유명·badCut 지표, 회귀 출력 before049→after: ted-asr badCut 0.062→0.048 phrasal 0.01→0, sinek 0.039→0.012, casey 0.042→0.04, mit-asr 0.057→0.033 (filler 0.007→0), mit-manual >10초 0.078→0.047, 나머지 0→0 · 5 ✅ 합성 4건 글자 그대로(「I asked my brother」/「To pick up the phone when it rang」, 「…and said」/「You know what we should do」, 넘침 → 「…old board games」/「Because the rain…」, 쉼표 없는 26낱말 → because 앞) · 6 ✅ 모든 영상 badCut ≤ 전, 4개 영상에서 줄어듦 · 7 ✅ `git diff 745ed98`: shortWords·longWords·기존 3영상 max* 값 그대로, 기존 합성 6건 그대로, transcript/cases.json(Test 14) 바뀜 없음 · 8 ✅ 옛 코드(13e6955 transcriptProcessor+segmentBalance)로 `EAR_COACH_SEGMENT_MODULE` → Test 31 「ted-asr.srv3.xml: 구동사 쪼갬 0.01 > 0.005」 실패, 항목별로는 phrasal·filler·badCut·overSec·합성 4건 실패; underSec·properNum은 옛 코드가 더 나빠지지 않아 별도 변이(ASR_MAX_WORDS 3·PUNCT_MAX_WORDS 7)로 underSec 6영상·properNum mit-asr 0.001>0 실패 확인 · 9 ✅ `node --experimental-strip-types scripts/segment-report.ts <파일> [--before <ref>] [--examples n]` sinek 출력: 231→241 카드, 바뀐 93장, 예 「…they get a job and ‖ The thrust and turn it…」 → 「…they get a job」/「And the thrust and turn it into the real world」, 「…the entire self-image ‖ Is shattered and so…」 → 「…the entire self-image is shattered」/「And so you have an entire generation…」; mit-manual: 563→577, >10초 44→27장, 예 「…modules on hashing, where we do things like genome comparison.」(10초) → 「…modules on hashing,」/「where we do things like genome comparison.」 · 10 ✅ worktree `verify.mjs --set regression` harness·build·test·ui 모두 ok(exit 0) · 11 ⏳ 실기기 새 영상.
  - 가결정: 나쁜 자름 벌점 0.5초·접속사 가산 0.15초(쉼 0.25초 기준 위에서 벌점이 쉼 두 배를 넘어야 자리를 옮김) · 대안 벌점 0.3. 구동사 쪼갬은 동사를 다음 카드로 보냄(조사를 앞으로 당기면 「to pick up」의 to가 남음) · 쉼표 없는 긴 문장 자르기는 가운데에 가장 가까운 절 낱말 · 구두점 카드가 10초를 넘으면 쉼표 자리에서 자르는 규칙(`PUNCT_SOFT_MAX_SEC` 10) 추가(SPEC 정의의 시간 지표를 고치는 쪽) · 지표 계산은 `tests/segmentMetrics.ts`(러너·리포트 공용), 목록은 데이터 `cut`, 코드 상수와 같은지 Test 31이 확인 · 「set」은 명사(problem set) 오탐이 많아 구동사 목록에서 뺌 · ted-asr <1초 카드 0.039→0.045(동사·관사 이동 부작용, 기준 0.05) · mit-manual 옛 지표 dangling 0→0.003(「and--」로 끝나는 카드 1장, 기준 0.01 안).

