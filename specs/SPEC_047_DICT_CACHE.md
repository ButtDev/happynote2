---
id: SPEC_047
title: 사전 결과 캐시 — 한 번 찾은 낱말은 네트워크 없이 바로(오프라인에서도)
status: READY
iterations: 0
max_iterations: 3
depends_on: [SPEC_013]
---

# SPEC 047 — 사전 결과 캐시

> 2026-11-23 사람: 「심야 스펙 준비해」 — 백로그 「[야간] 사전 결과 캐시」. 화면 변화 없음, 야간 실행.

## 1. 목표
`dictionary.lookup(word)` 결과를 볼트 플러그인 폴더의 파일 하나에 캐시해, 같은 낱말을 다시 누르면 네트워크 없이 바로 뜻·IPA를 보여 준다(지하철·비행기 모드에서도). 없는 낱말(404, 구동사 후보 대부분)도 짧게 기억해 후보 찾기를 빠르게 한다. 발음 소리 파일은 캐시하지 않는다(뜻·IPA·소리 주소만).

## 2. 파일
- 새 `src/services/dictCache.ts`(obsidian import 없음, 파일·시계 주입) + Test 33 + `tests/fixtures/dict-cache/cases.json`, 변이용 `EAR_COACH_DICTCACHE_MODULE`.
- 새 `CachedDictionaryProvider`(같은 파일): `DictionaryProvider`를 감싸 캐시 먼저.
- `src/features/network.ts`(또는 `createDictionary` 자리): 감싸기 연결. 파일 = `<manifest.dir>/dict-cache.json`(learning.json과 같은 방식).
- 연결 검사 기대값(`tests/fixtures/wiring/expected.json`)이 바뀌면 같이.

## 3. 정의
- `DICT_CACHE_MAX = 1000`(넘으면 가장 오래 안 쓴 것부터 버림), `DICT_MISS_TTL_DAYS = 7`(없음 기억 기간), 찾은 결과는 기한 없음. 키 = `normalizeLookupWord(word)`.
- 파일 `{ "schemaVersion": 1, "entries": { "<낱말>": { "entry": DictionaryEntry | null, "at": ISO, "used": ISO } } }`. 깨짐 → 빈 캐시, 더 큰 schemaVersion → 읽기만.
- 네트워크 실패(오프라인·시간 초과·5xx)는 캐시하지 않는다(다음에 다시 시도). 결과 있음·404(없음)만.
- 쓰기는 한 줄로(learningStore와 같은 방식), 여러 번 찾아도 쓰기는 앞 쓰기 뒤에.

## 4. 범위 밖
발음 소리 바이트 캐시, 캐시 지우기 설정 화면, AI 번역 캐시, 데스크톱 전용 개선.

## 5. 완료 조건
1. [ ] Test 33: 처음 찾기 → 네트워크 1번·저장, 다시 → 네트워크 0번·같은 결과, 404 → null 저장·7일 안 다시 → 네트워크 0번·8일 뒤 → 1번, 네트워크 실패 → 저장 안 함·다음에 다시 1번, 1001개째 → 가장 오래 안 쓴 것 빠짐, 깨진 파일 → 빈 캐시, schemaVersion 2 → 쓰기 0번, 대소문자·구두점 다른 같은 낱말 → 한 키. 변이 실패 [자동]
2. [ ] Test 33 실제 응답: `tests/fixtures/dictionary/`의 실제 응답 하나를 캐시에 넣고 파일을 다시 읽어 `lookup` 결과가 처음과 같음(JSON 왕복) [자동]
3. [ ] 회귀 `verify.mjs --set regression`(사전 화면 검사 `expect.dictionary`·`phrase` 포함) [자동]
4. [ ] 실기기: BRAT 업데이트 뒤 낱말 하나를 눌러 뜻을 본 다음, 비행기 모드에서 같은 낱말을 다시 누르면 뜻이 바로 뜨는지 보고 버튼 [수동]

## 6. 자동 검증
- 1·2: `npm test` Test 33(가짜 fetcher 호출 수 세기, 가짜 시계), 변이 `EAR_COACH_DICTCACHE_MODULE`(예: 404를 저장 안 함 / 실패도 저장).
- 3: `node .claude/harness/verify.mjs --set regression --json`.

## 7. 수동 검증
1. BRAT 업데이트. 2. 자막 낱말 하나 눌러 뜻 확인 → 닫기. 3. 비행기 모드 → 같은 낱말 다시 누름 → 뜻이 뜨면 OK(소리는 안 나와도 됨).

## 8. 가결정
- 1000개·없음 7일 · 이유: 낱말 하나 ~1–2KB → 파일 ~2MB 이하, 새 사전 항목이 생길 수 있어 없음은 짧게 · 대안: 500개·30일.
- 소리 바이트 제외 · 이유: 파일 크기 · 대안: 따로 폴더(다음 SPEC).

## 실행 기록
