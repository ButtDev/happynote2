---
id: SPEC_004
title: 가로모드 다듬기 — 화면 끝까지 쓰기 + 버튼 정리
status: STOPPED
iterations: 2
max_iterations: 3
depends_on: []
parent: SPEC_003
---

# SPEC 004 — 가로모드 다듬기 — 화면 끝까지 쓰기 + 버튼 정리

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
실기기 1.0.3 가로 스크린샷(`.scratch/inbox/20261120-220318-329.jpg`)에서 헤더·내비바는 사라졌지만 ① 상태 표시줄 아래 높이의 약 1/5(≈75px)과 아래쪽이 검은 빈칸으로 남고, ② 영상 좌우에 회색 띠가 있어 오른쪽 목록이 좁으며, ③ 필터 툴바가 잘리고(「📖 공개」), 재생 버튼이 제각각 모양이다. 사람 메모 「상단활용필요, 버튼배치 직관, 세련되게 개선」. **가로 + Ear-Coach 활성일 때만** 뷰를 화면 전체(안전 영역 안)로 띄워 빈칸을 없애고, 왼쪽 열을 영상 폭에 딱 맞추고, 재생 컨트롤과 필터 툴바를 한 줄의 정돈된 묶음(세그먼트·알약)으로 바꾼다. 세로·데스크톱·버튼 글자·동작은 그대로(CSS만).

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `styles.css` — 끝에 SPEC_004 가로 블록 추가(SPEC_002·003 블록은 남기고 덮어씀).
- `tests/ui/runUiCheck.mjs` — 검사 HTML에 정체 모를 Obsidian 바깥 여백(위 40px·아래 24px)을 흉내 내고, 새 `expect` 규칙(`rootFillsViewport`, `maxHeight`, `maxVideoSideGap`, `minListWidth`) 판정 추가.
- `tests/ui/cases.json` — landscape에 새 규칙 추가.
- `src/`는 바꾸지 않는다.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 전체화면: `@media (orientation: landscape)` 안에서 `.workspace-leaf.mod-active > .workspace-leaf-content[data-type="ear-coach-listening-view"]`를 `position: fixed; inset: 0; z-index: var(--layer-cover, 5)`로, `.view-content`는 안전 영역(`--safe-area-inset-*` → `env(safe-area-inset-*)` → 0) 패딩 + `container-type: size`.
- 왼쪽 열 폭 = `min(58cqw, (100cqh − 컨트롤 몫) × 16/9 + 좌우 패딩)` — 영상이 열 폭을 꽉 채움.
- 재생 컨트롤: 한 줄, 높이 32px 버튼, 재생은 둥근 강조 버튼, 배속 4개는 하나의 세그먼트(알약 안에 붙은 버튼, 선택만 채움), 시간은 오른쪽 고정폭 숫자.
- 툴바: 한 줄(줄바꿈 없음, 넘치면 가로 스크롤), 필터 3개는 세그먼트, 블라인드·공개는 테두리만 있는 알약으로 오른쪽 끝.
- `cases.json` landscape 규칙: `rootFillsViewport: true`, `maxHeight: {".ear-coach-mobile-toolbar": 44, ".ear-coach-player-controls": 44}`, `maxVideoSideGap: 12`(영상 왼쪽 끝–열 왼쪽, 영상 오른쪽 끝–툴바 왼쪽), `minListWidth: 330`. SPEC_002·003 규칙 유지.

## 4. 범위 밖
- 버튼 글자·아이콘·순서(TS) 변경, 새 버튼.
- 자막 카드 안 버튼·카드 디자인, 세로 배치, iframe 안 유튜브 overlay, 상태 표시줄 숨기기.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [ ] 가로 915×412에서 바깥 여백(위 40·아래 24)이 있어도 `.ear-coach-mobile-container`가 화면 전체를 덮는다(`rootFillsViewport` ok) [자동]
2. [ ] 가로에서 툴바·재생 컨트롤 높이 ≤ 44(한 줄) [자동]
3. [ ] 가로에서 영상 좌우 빈 띠 ≤ 12px, 목록 폭 ≥ 330 [자동]
4. [ ] SPEC_002·003 가로 규칙과 세로 규칙 전부 ok [자동]
5. [ ] 변이: SPEC_004 블록을 뺀 `styles.css` 사본으로 `ui`가 exit 1 (`rootFillsViewport`·`maxHeight` 실패) [자동]
6. [ ] `landscape.png`에서 위아래 빈칸 없이 영상이 왼쪽 열을 채우고, 컨트롤·툴바가 한 줄 알약/세그먼트로 보이며 「공개」가 잘리지 않는다 [자동]
7. [ ] `verify.mjs --set regression` → `verify: ok`, `git diff --stat -- src` 비어 있음 [자동]
8. [ ] Android 실기기 가로에서 위아래 빈칸이 사라지고 버튼 배치가 직관적·세련돼 보이는지 보고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1~4. `verify.mjs`의 `ui` + `.scratch/ui/report.json` `checks`
5. `.scratch/mut/styles.css` → `node tests/ui/runUiCheck.mjs --fail-on-overlap --css .scratch/mut/styles.css --out .scratch/mut/ui` exit 코드
6. 스크린샷 Read
7. `verify.mjs --set regression`, `git diff --stat -- src`

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 새 릴리스로 업데이트(실행자가 배포하고 버전을 알려 줌)
2. 가로로 Ear-Coach 세션을 열어 보고 버튼

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 빈칸 원인을 모르는 채(실기기 DOM 덤프 불가) 뷰를 `position: fixed; inset: 0`으로 띄움 · 조상 여백·패딩과 무관하게 화면을 씀 · 대안: 원인 요소를 추정해 하나씩 숨김(실기기 왕복 필요).
- 왼쪽 열 상한 58% · 915×412에서 영상 ≈ 290px 높이, 목록이 툴바 한 줄을 담을 폭(≥ 380) · 대안: 55%(영상 작음), 62%(툴바 넘침 — 회차 1에서 확인).
- 배속·필터를 세그먼트로 · 「하나만 고르는 묶음」이 한눈에 보임 · 대안: 개별 버튼 유지.

## 실행 기록
- 2026-11-20 회차 1: IMPLEMENTED — 1 ✅ landscape `rootFillsViewport` {x0,y0,w915,h412}(바깥 여백 40/24 있음) · 2 ✅ `maxHeight` toolbar 44, controls 32, `noOverflowX` 둘 다 ok · 3 ✅ `maxVideoSideGap` left 8·right 9, `minListWidth` 384 · 4 ✅ sideBySide·videoAspect 1.777·minVideoHeight 289·minListHeight 369·hidden 2·maxVideoTop 42, portrait stacked·visible 2·minVideoWidth 396 ok · 5 ✅ 변이(SPEC_004 블록 뺀 css) exit 1: rootFillsViewport(y40 h348)·maxHeight toolbar 51 실패 · 6 ✅ landscape.png: 위아래 빈칸 없음, 영상이 왼쪽 열을 채움(둥근 모서리), 아래 [재생 강조알약][루프][0.7 0.85 1x 1.15 세그먼트] ··· 00:00 한 줄, 오른쪽 위 [전체·핀·과속 세그먼트] [블라인드][공개] 한 줄·잘림 없음 · 7 ✅ `verify --set regression` → `verify: ok`, `git diff --stat -- src` 비어 있음 · 8 ⏳ 실기기
  - 가결정: 화면 검사 HTML에 Obsidian 모바일 테마 근사(:root 색 변수, `button{height:var(--input-height)=40px}`)와 `noOverflowX` 규칙 추가 · 이유: 테마 변수 없이는 알약·세그먼트 모양을 볼 수 없고, 실기기처럼 버튼이 커야 툴바 넘침을 잡음 · 대안: 없음. 열 상한 62%→58%(62%면 툴바 386>348 넘침).
- 2026-11-20 회차 2: IMPLEMENTED — 8 ❌→재작업: 사람 「[Button pressed: SPEC_004 8 NG] 동일하게 상단여백」. 원인 가설: 모바일 탭 스와이프의 조상 `transform`(또는 contain)이 fixed를 가둠. 검사 HTML에 `.workspace-leaf{transform:translateX(0)}`·`#app{contain:layout}` 넣으니 이전 CSS가 rootFillsViewport(y40 h348) 실패로 재현 → 조상(`:has`)의 transform·translate·filter·perspective·contain·container-type·will-change를 가로+활성일 때만 해제, 안전 영역은 `env()`만 사용 · 1~4 ✅ ui ok(rootFillsViewport {0,0,915,412}, toolbar 44, controls 32, side gap 8/9, list 384) · 5 ✅ 변이 둘: 해제 규칙만 뺀 css exit 1(rootFillsViewport), SPEC_004 블록 전체 뺀 css exit 1(rootFillsViewport·maxHeight 51) · 6 ✅ landscape.png 회차 1과 같은 모양 · 7 ✅ `verify --set regression` → `verify: ok`(중간에 `test`가 styles.css의 `backdrop-filter` 금지 규칙으로 실패 → 그 줄 제거), src 무변경 · 8 ⏳ 실기기
- 2026-11-20 사람확인(회차 셈 없음): STOPPED — 8 ❌ 1.0.5 사진(`.scratch/inbox/20261120-222219-335.jpg`): 좌우·아래는 화면 끝까지 쓰고(갇힘 해소, 버튼 한 줄 모양 OK), 위만 상태 표시줄 아래 ≈48css(전체 ≈84css) 빈칸. 같은 시그니처 2회째 → 정지. 아래쪽은 제스처 바 밑까지 내려감(env bottom=0 추정).
