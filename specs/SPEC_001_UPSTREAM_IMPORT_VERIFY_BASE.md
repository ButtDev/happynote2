---
id: SPEC_001
title: 업스트림 Ear-Coach 가져오기 + 빌드·시험·모바일 화면 검사 기반
status: READY
iterations: 0
max_iterations: 3
depends_on: []
---

# SPEC 001 — 업스트림 Ear-Coach 가져오기 + 빌드·시험·모바일 화면 검사 기반

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
`https://github.com/sindng-ui/happynote2`의 기본 브랜치를 이력째 이 저장소 `main`에 합쳐 플러그인 코드를 들여오고, `npm run build`·`npm test`가 통과하게 한다. 이후 UI SPEC이 판정에 쓸 **모바일 화면 검사 기반**(`tests/ui/runUiCheck.mjs`)을 만든다. 이 검사는 Obsidian 없이 Chromium에서 `EarCoachView`를 가짜 `obsidian` 모듈로 띄우고, 세로 412×915·가로 915×412에서 영상 영역·컨트롤 영역·overlay의 좌표를 재서 JSON 보고서와 스크린샷을 남긴다. 이번 SPEC은 **현재 레이아웃을 측정만** 하고 고치지 않는다(겹침이 있어도 실패로 보지 않고 기준선으로 기록). 제품 동작은 바꾸지 않는다.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- 업스트림 전체(`src/`, `tests/runTests.ts`, `package.json`, `package-lock.json`, `esbuild.config.mjs`, `tsconfig.json`, `manifest.json`, `styles.css`, `README.md`, `docs/`, `important/`, `assets/`) — merge로 추가. 내용은 바꾸지 않는다.
- `.gitignore` — 업스트림 항목과 하네스 항목(`.scratch/`, `.env`, `.env.*`, `node_modules/`, `.DS_Store`)의 합집합으로 충돌 해결. 빌드 산출물 `main.js`는 업스트림 규칙을 따른다.
- `package.json` — devDependencies에 `playwright` 추가, scripts에 `"ui": "node tests/ui/runUiCheck.mjs"` 추가(기존 scripts는 그대로).
- `tests/ui/runUiCheck.mjs` — 신규. 화면 검사 러너.
- `tests/ui/obsidianStub.ts` (또는 `.js`) — 신규. `ItemView`·`Platform`·`requestUrl`·`setIcon`·`Notice` 등 뷰 렌더링에 필요한 최소 가짜 구현.
- `tests/ui/fixtures/transcript-sample.json` — 신규. 문장 20개 안팎의 고정 자막(시각·문장), 네트워크 없이 렌더링하기 위함.
- `tests/ui/cases.json` — 신규. 뷰포트 목록과 측정할 셀렉터(영상 영역·컨트롤 영역·overlay) 정의.
- `.scratch/ui/` — 스크린샷·보고서 출력(git 밖).

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 업스트림 remote 이름: `upstream`, URL `https://github.com/sindng-ui/happynote2`. merge 커밋 메시지: `merge: upstream sindng-ui/happynote2 <짧은 해시>`.
- 뷰포트: `portrait` = 412×915, `landscape` = 915×412, `isMobile: true`, `hasTouch: true`, `body`에 `is-mobile` 클래스.
- YouTube iframe은 네트워크 없이 같은 크기의 자리표시 요소로 바꿔 렌더링한다(원래 iframe이 놓일 컨테이너 셀렉터는 유지).
- 보고서 `.scratch/ui/report.json` 형식:
  ```json
  { "viewports": [ { "name": "portrait", "width": 412, "height": 915,
      "rects": { "video": {"x":0,"y":0,"w":0,"h":0}, "controls": {...}, "overlays": [{...}] },
      "overlapVideoControlsPx2": 0, "overlayOnVideoPx2": 0, "screenshot": ".scratch/ui/portrait.png" } ] }
  ```
- `runUiCheck.mjs` 종료 코드: 렌더링·측정이 모두 성공하면 0, 뷰가 안 뜨거나 셀렉터가 없으면 1. **겹침 수치는 이번 SPEC에서 종료 코드에 영향을 주지 않는다**(옵션 `--fail-on-overlap`은 SPEC_002에서 켠다).

## 4. 범위 밖
- 레이아웃·overlay·가로모드 수정(SPEC_002), 자막 품질(SPEC_003), AI 번역(SPEC_004), 사전·AnkiDroid(SPEC_005).
- 업스트림 코드의 리팩터링·이름 변경·시험 약화.
- 실제 YouTube 네트워크 접속이 필요한 시험.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] `git log --oneline`에 업스트림 커밋들과 merge 커밋이 있고, `git remote -v`에 `upstream`이 있다 [자동]
2. [ ] `src/main.ts`, `src/ui/EarCoachView.ts`, `tests/runTests.ts`, `manifest.json`(id `obsidian-ear-coach`)이 저장소에 있다 [자동]
3. [ ] `npm ci` 후 `verify.mjs`의 `build`가 ✅ (exit 0) [자동]
4. [ ] `verify.mjs`의 `test`가 ✅ (exit 0, 출력에 `ALL TESTS PASSED`) [자동]
5. [ ] `verify.mjs`의 `ui`가 ✅이고 `.scratch/ui/report.json`에 `portrait`·`landscape` 두 항목이 있으며 각 항목의 `rects.video`·`rects.controls`의 `w`·`h`가 0보다 크다 [자동]
6. [ ] `.scratch/ui/portrait.png`·`.scratch/ui/landscape.png`가 생기고, 열어 보면 자리표시 영상 영역과 자막 카드가 보인다(실행자가 직접 열어 확인) [자동]
7. [ ] 변이 확인: 가짜 `obsidian` 모듈에서 `ItemView`를 빼거나 측정 셀렉터를 틀리게 바꾼 사본으로 `ui`가 exit 1이 된다 [자동]
8. [ ] `harness.json` `regression`에 `build`·`test`·`ui`를 추가한 뒤 `node .claude/harness/verify.mjs --set regression`이 `verify: ok` [자동]
9. [ ] 기준선 측정값(세로·가로 각각 `overlapVideoControlsPx2`·`overlayOnVideoPx2`)을 「실행 기록」에 적는다 [자동]
10. [ ] Android 실기기 Obsidian에 빌드한 3개 파일을 넣고 플러그인을 켜서, 유튜브 URL 하나로 세션을 만들면 영상과 자막 카드가 업스트림과 같게 뜬다 — 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1. `git remote -v | grep upstream`, `git log --oneline | grep 'merge: upstream'`
2. `ls` + `grep '"id": "obsidian-ear-coach"' manifest.json`
3. `node .claude/harness/verify.mjs` 출력의 `build` 줄
4. 같은 출력의 `test` 줄 + tail의 `ALL TESTS PASSED`
5. `ui` 줄 + `node -e`로 report.json 필드 검사
6. 스크린샷 두 장을 Read로 열어 확인
7. `.scratch/mut/`에 사본을 만들어 실행, exit 코드 기록(사본은 커밋하지 않음)
8. `verify.mjs --set regression` 출력 마지막 줄
9. report.json에서 수치 인용

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. 빌드된 `main.js`·`manifest.json`·`styles.css`(실행자가 위치를 알려 줌)를 Android 볼트 `.obsidian/plugins/obsidian-ear-coach/`에 복사
2. Obsidian 재시작 → 커뮤니티 플러그인에서 Ear-Coach 켜기
3. 유튜브 영어 영상 URL 하나로 세션 생성 → 영상·자막 카드가 뜨는지 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 업스트림을 `git merge --allow-unrelated-histories`로 합침 · 포크 이력 보존, 이후 업스트림 변경을 merge로 받기 쉬움 · 대안: 파일 복사(이력 없음), subtree.
- 화면 검사는 Obsidian 실행 대신 가짜 `obsidian` 모듈 + Chromium · 자동·재현 가능, CI 없이 로컬에서 돎 · 대안: Android 에뮬레이터+Obsidian(무겁고 비결정적).
- 이번 SPEC은 겹침을 실패로 보지 않음 · 현재 레이아웃 기준선을 먼저 얻어야 SPEC_002의 개선을 수치로 판정 가능 · 대안: 바로 0 강제(SPEC_001이 범위 밖 수정을 하게 됨).

## 실행 기록
