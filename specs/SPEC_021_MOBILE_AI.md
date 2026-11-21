---
id: SPEC_021
title: 모바일 AI 번역·분석 — Gemini Flash-Lite / OpenAI 호환(Groq) 묶음 요청
status: READY
iterations: 0
max_iterations: 3
depends_on: []
---

# SPEC 021 — 모바일 AI 번역·분석 — Gemini Flash-Lite / OpenAI 호환(Groq) 묶음 요청

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
OVERVIEW 로드맵 4번. 사람 선택 「추천대로 (Gemini Flash-Lite + Groq 선택)」(2026-11-21). 지금 카드의 한국어 해석·연음 함정 분석(`SegmentPhoneticAnalysis`)은 데스크톱 `agy` CLI로만 채워지고, 모바일 카드 3단계에는 `(AI 정밀 해석 대기 중 …)`이 그대로 보인다. 이번에는 **모바일에서만** 사용자 API 키로 Gemini(`generateContent`) 또는 OpenAI 호환 주소(Groq 기본)를 `requestUrl`로 불러, 카드 20장씩 묶어 같은 JSON 형식으로 채운다. 무료 한도(Gemini Flash-Lite 하루 약 500회, Groq 약 1,000회 — 2026-10 정리 글, 비공식)를 생각해 묶음·간격·429 처리를 둔다. 데스크톱 `agy` 경로와 사운드 닥터는 바꾸지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/services/aiAnalysis.ts`(새, obsidian import 없음) — 프롬프트·요청 만들기·응답 읽기·검사·묶음 실행. 요청 함수와 잠자기 함수를 주입받는다.
- `src/types/settings.ts` — 설정 6개 추가.
- `src/ui/SettingsTab.ts` — 모바일 설정에 「🤖 AI 번역·분석」 절(제공자·키·모델·주소·연결 확인 버튼).
- `src/main.ts` — `plugin.aiFetch`(requestUrl), `runMobileAiEnrichment(session, noteFile)`, `activateWorkspaceView` 뒤 모바일 자동 실행, 명령 1개.
- `src/ui/EarCoachView.ts` — `updateVirtualListSegments`를 `public refreshSegments()`로 감싸 바깥에서 부름.
- `tests/fixtures/ai/cases.json`(새), `tests/runTests.ts` Test 15, 변이용 `EAR_COACH_AI_MODULE`.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 설정(`EarCoachSettings`): `aiProvider: "gemini" | "openai"` 기본 `"gemini"` · `geminiApiKey` 기본 `""` · `geminiModel` 기본 `"gemini-3.5-flash-lite"` · `openaiBaseUrl` 기본 `"https://api.groq.com/openai/v1"` · `openaiApiKey` 기본 `""` · `openaiModel` 기본 `"openai/gpt-oss-120b"`.
- `aiAnalysis.ts`:
  - `AI_BATCH_SEGMENTS = 20`, `AI_REQUEST_GAP_MS = 4000`, `AI_RETRY_WAIT_MS = 30000`.
  - `AI_PENDING_PREFIX = "(AI 정밀 해석 대기 중"`; `needsAiAnalysis(seg)` = `analysis` 없음 또는 `translationKr`가 비었거나 이 글자로 시작.
  - `buildAnalysisPrompt(title, segments)` — 데스크톱 `agy` 프롬프트와 같은 7개 항목 + 「JSON 객체 하나만, 키 `summaryKr`·`keyListeningPoints`·`items`」, 세그먼트는 `{index, text, wpm}` JSON.
  - `buildAiRequest(config, prompt)` → `{url, method:"POST", headers, body}`. gemini: `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`, 헤더 `x-goog-api-key`(키는 URL에 넣지 않음), `generationConfig.responseMimeType = "application/json"`, `responseSchema`(같은 구조), `temperature 0.2`. openai: `<baseUrl 끝 / 뺌>/chat/completions`, 헤더 `Authorization: Bearer <키>`, `response_format: {type:"json_object"}`, `temperature 0.2`, 메시지 system+user.
  - `parseAiResponse(provider, status, json, segments)` → `{items}` 또는 오류 `AiError{kind:"auth"|"quota"|"format"|"network", message}`. 401·403 → auth, 429 → quota, 그 밖 비200 → network. 본문 글자는 gemini `candidates[0].content.parts[*].text` 이음, openai `choices[0].message.content`. ```` ```json ```` 울타리 벗김. `items` 배열 없으면 format.
  - 항목 검사: `segmentIndex`가 이 묶음에 없으면 버림, `traps`는 6개 값만 남김(비면 `["LINKING"]`), 낱말 번호는 `0 ≤ i < words.length` 정수만, `translationKr` 빈 글자면 그 항목 버림.
  - `runAiAnalysis(segments, config, deps)` — `needsAiAnalysis`인 것만 순서대로 20개씩. 요청 사이 `AI_REQUEST_GAP_MS` 잠. quota면 `AI_RETRY_WAIT_MS` 쉬고 같은 묶음 1번 더, 또 quota면 멈춤. auth·format(같은 묶음 2번째)·network면 멈춤. 각 묶음 뒤 `deps.onBatch(done, total)`. 결과 `{analyzed, total, stoppedBy?: AiError}`. 받은 항목은 그 자리에서 `seg.analysis`에 넣는다(멈춰도 앞 묶음 결과는 남음).
- `main.ts`: 모바일에서 `activateWorkspaceView` 끝에 키가 있고(`aiProvider`에 맞는 키) 대기 카드가 있으면 `runMobileAiEnrichment`를 백그라운드로(같은 노트 동시 실행 1개). 묶음마다 노트 저장·`refreshSegments()`. 알림 문구: 시작 `🤖 AI 번역·분석 시작 (대기 N장)`, 끝 `✅ AI 번역·분석 완료 (N장)`, 한도 `⏸️ AI 무료 한도에 걸려 멈췄습니다 (N/M장). 나중에 노트를 다시 열면 이어서 합니다.`, 키 오류 `❌ AI 키가 거부되었습니다. 설정에서 키를 확인하세요.`, 그 밖 `❌ AI 분석 실패: <메시지>`.
- 명령: id `ear-coach-mobile-ai-continue`, 이름 `현재 노트 AI 번역·분석 이어서 하기 (모바일)`.
- 설정 화면(모바일만): 제목 `🤖 AI 번역·분석`, 제공자 드롭다운 `Gemini (Google AI Studio)` / `OpenAI 호환 (Groq 등)`, 키 입력은 `type=password`, 설명에 키 발급 주소(`aistudio.google.com/apikey`, `console.groq.com/keys`), 버튼 `🔌 연결 확인`(카드 1장짜리 요청 → `✅ AI 연결 성공` / 오류 알림).

## 4. 범위 밖
- 데스크톱 `agy` 경로·사운드 닥터 바꾸기, 모바일 사운드 닥터(1:1 질문), 툴바 버튼 추가, 고유명사·구두점 복원, 유료 모델, 키를 저장소·시험 데이터에 넣기, 하루 한도 계산·표시.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] 요청 만들기: gemini·openai 사례에서 URL·헤더·본문 핵심(키 위치, `responseMimeType`/`response_format`, 모델)이 기대값과 같고 gemini URL에 키가 없음 (`npm test` Test 15) [자동]
2. [ ] 응답 읽기: gemini·openai 정상, 울타리 ```json, 여러 parts, 401→auth, 429→quota, 500→network, items 없음→format 사례 통과 [자동]
3. [ ] 항목 검사: 묶음 밖 번호 버림, 잘못된 trap 걸러짐·빈 traps → LINKING, 범위 밖 낱말 번호 버림, 빈 번역 항목 버림 [자동]
4. [ ] 묶음 실행(가짜 요청 함수): 대기 45장+분석된 5장 → 요청 3번(20·20·5), 분석된 카드는 안 보냄, 요청 사이 잠 4000ms; 429→200이면 30000ms 쉬고 이어감; 429→429면 앞 묶음 결과는 남고 `stoppedBy.kind = "quota"`; 401이면 1번에 멈춤 [자동]
5. [ ] `aiAnalysis.ts`에 `from "obsidian"`·`child_process`·`fs` import 없음, `main.ts`의 AI 요청은 `requestUrl`만 (grep) [자동]
6. [ ] 시험 데이터·저장소에 실제 키 모양(`AIza[0-9A-Za-z_-]{30,}`, `gsk_[0-9A-Za-z]{20,}`) 없음 (grep) [자동]
7. [ ] 변이: 묶음 밖 번호 검사를 끈 사본, quota 재시도를 끈 사본으로 각각 Test 15 실패 [자동]
8. [ ] `verify.mjs --set regression` ok(빌드·시험·화면 검사, 데스크톱 경로 그대로) [자동]
9. [ ] Android 실기기: 설정 「🤖 AI 번역·분석」에 Gemini 키를 넣고 🔌 연결 확인 → 자동 자막 영상 노트를 열어 잠시 뒤 카드 3단계에 한국어 해석·연음 설명이 뜨는지, 학습에 쓸 만한지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
- 1~4: `npm test` Test 15 (`tests/fixtures/ai/cases.json`, 응답 모양은 공식 문서 형식으로 만든 합성 데이터 — 키가 없어 실제 응답은 못 받음).
- 5·6: `grep`.
- 7: `EAR_COACH_AI_MODULE=<망가뜨린 사본> npm test` 실패 출력.
- 8: `node .claude/harness/verify.mjs --set regression`.

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. aistudio.google.com/apikey 에서 키 만들기(Google 로그인, 카드 등록 없음) → 복사.
2. BRAT로 새 버전 → Obsidian 설정 → Ear-Coach → 「🤖 AI 번역·분석」에 키 붙여 넣기 → 🔌 연결 확인.
3. 리스닝 노트 열기 → 알림 「AI 번역·분석 시작」 → 카드를 3단계로 넘겨 해석 보기 → 버튼.

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 실행 계기 = 모바일에서 노트를 열 때 자동(대기 카드만) + 명령: 툴바는 목록 폭 362px에서 여유가 0이라 버튼을 못 넣음. 한도에 걸려도 다음에 열면 이어서 함. 대안: 툴바 버튼(화면 변경, 취향 질문 필요).
- 묶음 20장·간격 4초·429 때 30초 뒤 1번 재시도: Flash-Lite 분당 한도(약 15회)와 Groq 분당 토큰(약 8,000)을 넘지 않게. 대안: 30장(한 번에 응답이 길어 잘릴 위험).
- Gemini는 네이티브 `responseSchema`, Groq는 `json_object` + 검사: Gemini OpenAI 호환 층은 스키마를 무시한다는 보고, gpt-oss의 json_schema 무시 보고가 있어서.
- 모델 기본값 `gemini-3.5-flash-lite`·`openai/gpt-oss-120b`(2026-11 문서 목록): 설정에서 바꿀 수 있음.
- 설정은 볼트 동기화로 기기 간에 같이 갈 수 있음 — 키는 `data.json`(플러그인 설정)에만, 저장소엔 없음.

## 실행 기록
