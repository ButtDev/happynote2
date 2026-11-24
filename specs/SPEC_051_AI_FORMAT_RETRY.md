---
id: SPEC_051
title: AI 분석 형식 오류 견디기 — JSON 모드 없이 재시도 · 묶음 반으로 나누기 · 진단에 원인
status: DONE
iterations: 1
max_iterations: 3
depends_on: [SPEC_021]
after_implemented: true
---

# SPEC 051 — AI 분석 형식 오류 견디기

> 2026-11-24 사람 진단(1.0.59): `AI 분석 ×2: format: Failed to validate JSON ... failed_generation` — 1.0.59에서 400을 format으로 바꿨지만 재시도도 같은 오류로 멈춤(Groq `openai/gpt-oss-120b` 기본).

## 1. 목표
Groq JSON 모드 검사에 걸려도 AI 분석이 멈추지 않고 이어진다.

## 2. 파일
- `src/services/aiAnalysis.ts`: `buildAiRequest(…, plain)`, 형식 재시도는 plain, 두 번 형식 오류면 묶음 반으로(`AI_SPLIT_MIN` 5 이하는 멈춤), 잡글 붙은 JSON은 첫 `{`~마지막 `}`, json_validate_failed 메시지에 생성 길이·끝 60자
- `tests/runTests.ts`(Test 15: `plain`·`bodyMustNotHave`·`run.provider`·`groq400`·`jsonModes`), `tests/fixtures/ai/cases.json`

## 3. 범위 밖
기본 모델 바꾸기(사람 결정), 프롬프트 줄이기, 설정 화면.

## 5. 완료 조건
1. [x] plain 요청엔 `response_format` 없음 [자동: Test 15 requests]
2. [x] 앞뒤 잡글 붙은 답도 items를 읽음 [자동: Test 15 responses]
3. [x] groq400 → 같은 묶음 plain 재시도, 두 번 형식 오류 20장 → 10+10, 5장 이하는 format으로 멈춤 [자동: Test 15 runs]
4. [x] 변이(나누기·plain·잡글 처리 끔) 모두 실패 [자동]
5. [x] 회귀 통과 [자동]
6. [x] Android BRAT 업데이트 뒤 AI 분석이 안 된 영상을 열어 「✅ AI 번역·분석 완료」가 뜨는지 보고 버튼(또 멈추면 진단 복사해서 보내기) [수동]

## 8. 가결정
- 재시도에서 JSON 모드 끔 · Groq 검사가 실패 원인이라 우리 파서(관대)에 맡김 · 대안 json_schema 모드(모델마다 지원 다름)
- 반으로 나누기 최소 5 · 답이 짧을수록 덜 깨짐, 요청 수는 많아야 2배 남짓 · 대안 처음부터 묶음 10(정상일 때 요청 2배)

## 실행 기록
- 2026-11-24 실행 1: Test 15 PASS(3 request + 20 response + 11 batching). 변이 3개 잡힘 — 나누기 끔→「20 장 형식 오류 두 번」batch sizes, plain 끔→「groq400 then ok」JSON mode, 잡글 처리 끔→「앞뒤 잡글」format. `verify.mjs --set regression` ok.
- 2026-11-24 사람 확인: 6 OK (`[Button pressed: SPEC_051 6 OK]`, log/confirmations.jsonl) → DONE.
