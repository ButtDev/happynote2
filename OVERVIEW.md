# happynote2 — 개요

> 인터뷰(`/interview`)로 채운 뒤 사람이 확정한다. 확정 뒤에는 읽기 전용.

## 1. 한 줄 설명
github.com/sindng-ui/happynote2(Obsidian 플러그인 「Ear-Coach」, 유튜브 영어 리스닝 코치)를 포크해 **Android(Obsidian 모바일) 버전**을 개선한다 — 화면을 덜 거추장스럽게, 가로모드를 제대로 쓰게, 사전·AnkiDroid(Fluent Forever 방식) 카드 저장을 붙이고, 자막 품질과 모바일 AI 번역·분석을 살린다.

## 2. 누구를 위한 것인가
사용자 본인 한 사람. Android 폰·태블릿의 Obsidian 모바일에서 유튜브 영어 영상으로 듣기 훈련을 하는 한국어 사용자이며 가로모드도 자주 쓴다. 배포·다국어는 고려하지 않는다.

## 3. 핵심 기능 (첫 버전)
1. **UI 개선 (Android)**
   - YouTube 화면 위 overlay를 줄이거나 걷어 영상을 가리지 않게 한다.
   - 가로모드에서 영상과 컨트롤(자막 카드·플레이어 버튼)을 겹치지 않게 분리한다.
2. **기능 확장**
   - 사전 활용: 자막 단어를 눌러 뜻·발음(IPA)을 본다(dictionaryapi.dev, 교체 가능 구조).
   - AnkiDroid 연동 저장: 책 *Fluent Forever* 방식(그림–단어 연결, 모국어 번역 대신 이미지, 발음·철자 카드, 예문 빈칸)으로 카드를 만든다. 이미지는 동영상 스냅샷(해당 시점 프레임)을 쓴다. 전송은 AnkiConnect Android(`127.0.0.1:8765`).
3. **기능 개선**
   - 자막 품질: 현재 추출 자막이 YouTube CC보다 못한 경우를 고친다(트랙 선택·문장 합치기 등).
   - 모바일 AI 번역·분석: 지금은 데스크톱 `agy` CLI 전용이라 모바일에서 꺼져 있다 → 모바일에서 Gemini API 직접 호출(사용자 API 키)로 살린다.

## 4. 하지 않을 것
- iOS·데스크톱 전용 개선(기존 동작이 깨지지 않는지만 확인).
- Obsidian 커뮤니티 마켓 배포·외부 공개.
- 과금이 생기는 사전·AI API 사용(무료 등급 한도 안에서만).
- `agy` 사운드 닥터(데스크톱 CLI 채팅) 자체의 개선(모바일에선 숨김 또는 AI 경로로 대체).
- AnkiDroid 외 SRS(데스크톱 Anki 직접 동기화, Mochi 등).

## 5. 기술 스택과 실행 방법
- TypeScript + Obsidian 플러그인 API + esbuild (업스트림 그대로). Node 18+ (개발 기기 Node 25).
- 시험: `node --experimental-strip-types tests/runTests.ts`, 화면 검사: Playwright(Chromium, 모바일 뷰포트).
- 외부 연동: AnkiConnect Android(HTTP, 기기 안 `127.0.0.1:8765`), dictionaryapi.dev, Gemini API(`requestUrl`).
- 실행: `npm install` → `npm run build` → `main.js`·`manifest.json`·`styles.css`를 Android 볼트 `.obsidian/plugins/obsidian-ear-coach/`에 복사 → Obsidian에서 플러그인 켜기.

## 6. 검증 방법 (자동 / 사람만 판정)
- 자동
  - `npm run build`: tsc 타입 검사 + esbuild 번들.
  - `npm test`: 데이터(`tests/` 아래) 기반 단위 시험 — Fluent Forever 카드 필드 생성, AnkiConnect 요청 형식, 사전 응답 파싱, 스토리보드 프레임 좌표, 자막 트랙 선택·문장 합치기, AI 응답 파싱.
  - 화면 검사: Playwright로 세로 412×915·가로 915×412에서 뷰를 렌더링해 영상 영역과 컨트롤 영역이 겹치지 않는지, overlay가 영상을 가리지 않는지 좌표로 판정하고 스크린샷을 남긴다.
- 사람만 판정(⏳)
  - Android 실기기 세로·가로 화면 감각(overlay가 덜 거슬리는지, 분리가 편한지).
  - AnkiDroid에 생긴 카드의 모양·학습감(이미지·단어·예문·발음이 Fluent Forever 방식에 맞는지).
  - 사전 뜻·스냅샷 이미지·AI 번역이 기억·학습에 쓸 만한 품질인지.

## 7. 로드맵 (SPEC 후보)
1. **SPEC_001 업스트림 가져오기 + 검증 기반** — 업스트림 코드를 이력째 합치고, 빌드·시험·모바일 화면 검사(현재 레이아웃 기준선)를 돌게 한다.
2. **모바일 UI: overlay 축소 + 가로모드 영상/컨트롤 분리** — 화면 검사로 겹침 0 판정.
3. **자막 품질 개선** — CC보다 못한 사례 재현 데이터 → 트랙 선택·문장 합치기 수정.
4. **모바일 AI 번역·분석** — Gemini API 경로(같은 JSON 스키마), 설정에 API 키.
5. **사전 + AnkiDroid Fluent Forever 카드** — 단어 탭 → 사전 → 스냅샷(스토리보드 프레임 우선 검증) → AnkiConnect Android로 카드 저장. 필요하면 사전/Anki로 쪼갠다.
