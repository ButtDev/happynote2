---
id: SPEC_053
title: 유튜브 앱 「공유 → Obsidian」 메뉴에 「🎧 Ear-Coach로 열기」
status: IMPLEMENTED
iterations: 2
max_iterations: 3
depends_on: []
---

# SPEC 053 — 공유로 바로 열기

> 2026-11-24 사람 `[Button pressed: 공유로 바로 열기 필요함]`. 지금은 링크 복사 → Obsidian → Ear-Coach 붙여넣기 3단계.

## 1. 목표
유튜브 앱에서 「공유 → Obsidian」을 고르면 Obsidian이 띄우는 공유 메뉴(노트에 붙이기 등)에 「🎧 Ear-Coach로 열기」 줄이 생기고, 누르면 그 영상이 Ear-Coach로 열린다(링크의 시각이 있으면 URI와 같게 핀). 공유 글에 유튜브 주소가 없으면 줄을 넣지 않는다. 하지 않을 것: Android 공유 대상 앱 새로 만들기, Obsidian 공유 메뉴의 기존 줄 바꾸기.

## 2. 파일
- `src/utils/youtubeUrlParser.ts`: `findYouTubeInShare(text)` 추가(순수).
- `src/features/commands.ts`: `workspace.on("receive-text-menu", (menu, text) => …)` 등록(공개 API에 없는 이벤트 — Pinbox 플러그인이 같은 방식, `@ts-ignore` 대신 `as any`).
- 시험: `tests/fixtures/share/cases.json` + `tests/runTests.ts` Test 36, `tests/wiring/runWiringCheck.mjs`·`tests/fixtures/wiring/expected.json`(이벤트 등록 + 메뉴 줄 누르면 `handleYouTubeTrigger`).

## 3. 정의
- `findYouTubeInShare(text: string): { url: string; timestampSeconds?: number } | null` — 글 안의 낱말 중 `youtu`가 들어간 것(앞뒤 괄호·따옴표·구두점 벗김)을 차례로 `parseYouTubeUrl`에 넣어 첫 성공. 맨 11글자 낱말(영상 ID처럼 생긴 일반 낱말)은 받지 않는다. `url`은 찾은 원래 주소.
- 메뉴 줄 제목 `🎧 Ear-Coach로 열기`, 아이콘 `headphones`, 누르면 `plugin.handleYouTubeTrigger(url, timestampSeconds)`.

## 4. 범위 밖
공유 메뉴 맨 위로 줄 옮기기(Obsidian 메뉴 순서), 유튜브 외 사이트, 여러 링크 중 고르기.

## 5. 완료 조건
1. [x] 유튜브 앱 공유 글 모양(`https://youtu.be/ID?si=…`, 제목+주소, `&t=` 시각, shorts, m.youtube, music)에서 영상 ID·시각을 찾고, 유튜브 아닌 글·11글자 일반 낱말은 null [자동: Test 36]
2. [x] 플러그인이 `workspace:receive-text-menu`를 등록, 유튜브 글이면 줄 1개(제목·아이콘 위 글자), 누르면 `handleYouTubeTrigger`가 그 주소·시각으로 불림, 유튜브 아닌 글이면 줄 0개 [자동: wiring check(Test 25)]
3. [x] 변이(11글자 막기 끔, 구두점 벗기기 끔) 실패 [자동]
4. [x] 회귀 통과 [자동]
5. [ ] Android BRAT 업데이트 뒤 유튜브 앱에서 영상 「공유 → Obsidian」 → 뜨는 메뉴에서 「🎧 Ear-Coach로 열기」를 눌러 그 영상이 Ear-Coach로 열리는지 보고 버튼 [수동]

## 6. 자동 검증
1·3: `npm test` Test 36(+`EAR_COACH_SHARE_MODULE` 변이). 2: `npm test` Test 25. 4: `verify.mjs --set regression`.

## 8. 가결정
- `receive-text-menu` 이벤트 · Obsidian 모바일이 공유 받을 때 부르는 이벤트(공개 문서 없음, Pinbox가 씀) · 대안: 메뉴 DOM 관찰(Share to Save 방식, 더 깨지기 쉬움)
- 11글자 낱말은 안 받음 · 「programming」 같은 낱말을 영상 ID로 잘못 읽지 않게 · 대안 없음(유튜브 앱은 늘 주소를 보냄)

## 실행 기록
- 2026-11-24 회차 1: IMPLEMENTED — 1 ✅ Test 36 「11 share cases」 PASS · 2 ✅ Test 25 「wiring OK: 5 commands, 3 events」 + 공유 메뉴 2사례(줄 1개·누름 → [url, 42] / 줄 0개) · 3 ✅ 변이: youtu 거름 끔 → 「11글자 일반 낱말」, 끝 구두점 벗기기 끔 → 「괄호·마침표로 감싼 주소」, 찾기 결과 무시(commands) → 「공유 메뉴 줄: just a note about programming」 실패 · 4 ✅ `verify.mjs --set regression` harness·build·test·ui ok · 5 ⏳ (BRAT 1.0.62 릴리스 3파일 확인)
- 2026-11-24 회차 2: 사람 5 NG(사진: 공유 메뉴에 Ear-Coach 줄 없음 → 이 판 Obsidian은 `receive-text-menu`를 안 부름). 가결정 대안대로 메뉴 DOM 지켜보기 추가 — `src/ui/shareMenuInjector.ts`(body에 붙는 `.menu` 중 `data-section` title·options·danger가 모두 있으면 제목 글에서 유튜브 주소를 찾아 첫 options 앞에 줄, 누르면 Cancel 클릭으로 닫고 `handleYouTubeTrigger`; 이벤트로 줄이 이미 있으면 건너뜀), 모바일에서만 `commands.ts`가 시작. 화면 검사 `expect.shareMenu` + `tests/fixtures/share/menu-dom.json`(사진 주소 그대로·시각·유튜브 아님·이미 있음) 양 뷰 통과, `share-menu-portrait.png` 확인(Choose a file 위에 줄). 변이: 끝에 붙이기 → firstOptionIsOurs false 실패, 관찰 끔 → items 0 실패. `verify.mjs --set regression` ok. 5 ⏳ (BRAT 1.0.63)
- 2026-11-25 야간 메모(회차 아님): 사람 NG 2건(11-24 22:44·22:47)은 둘 다 회차 1 질문(메시지 1045, 1.0.62)에 눌림 — 회차 2(1.0.63, 22:58 배포)는 실기기 판정 없음. Obsidian 1.15.1 app.js 확인: 공유 메뉴는 `receive-text-menu`를 부름(「Today's daily note」도 이 이벤트), section 없는 줄은 Cancel 아래로 감 → SPEC_054에서 section·진단 추가. 5 ⏳는 새 판으로 다시.

