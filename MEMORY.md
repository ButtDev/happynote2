# MEMORY — happynote2

> 다음 세션이 바로 알아야 할 것만 둔다. 상태는 `node .claude/harness/status.mjs`, 이력은 `log/`·git·`DECISIONS.md`.

## 지금 하는 일
- 배포 최신 BRAT 1.0.65. ⏳ 대기 없음(SPEC_053·054 11-25 사람 5 OK로 DONE). SPEC_049 11은 사람 보류(다시 묻지 않음). 공유 메뉴 문제 생기면 「🩺 진단 복사」(공유 이벤트·공유 메뉴 줄)부터.
- READY SPEC 없음, 백로그 「대기」 비었음, 열린 night 브랜치 0개(11-25 정리). 약점 기록 = `src/utils/weaknessDashboard.ts`(대시보드 끝 숨은 주석, Test 37, 변이 `EAR_COACH_WEAKNESS_MODULE`). 다음 시험 번호 38.
- EarCoachView 730줄(시험 `<900`, SPEC_058에서 막대를 `paneResizers.ts`로) — 새 코드는 되도록 모듈로.
- 버린 아이디어(사람, 다시 제안 금지): 영상 클립 카드·속도 사다리·Anki 대기열·빈칸 난이도 자동 조절·소리 현상 도감·블라인드 챌린지·이어폰 버튼·맞힘 피드백·단계 전환 애니메이션·업스트림 확인·설정 정리안·안 쓰는 코드 정리·학습 기록 문서·밝은 테마 점검·하네스 템플릿 개선. 보류: 설정 스키마 한 표·화면 상태 저장소.

## 열린 질문 (사람에게)
- 오래된 영상 자동 정리(SPEC_033 범위 밖) — 사람이 고르면 새 SPEC.

## 주의
- `log/*.jsonl` `ts`는 UTC(KST −9h) — 밤/아침 판단은 git 커밋 시각(KST)으로. 11-23 06:39에 야간을 「오늘 밤」으로 착각함.
- 사람이 버튼을 다른 SPEC 행·메모로 누르거나 사진만 보내기도 함 — 내용·시각으로 판단해 기록. 메모에 「잘동작함」처럼 판정이 분명하면 OK로 기록.
- 옛 데이터 호환 작업·확인을 하지 않는다(사람 11-22: 「어차피 영상하나뿐인데, 호환작업을 하는건 낭비야」). 확인은 새 영상으로.
- 사람 기기 AI: Gemini·Groq(gpt-oss-120b, json_validate_failed → SPEC_051 plain 재시도·묶음 나누기) 둘 다 씀. Groq는(console.groq.com/keys, xAI Grok 아님). 모바일 명령 팔레트를 사람이 못 찾음 — 명령에 기대는 안내 금지.
- 실기기 ⏳ 요청 문구엔 사람이 할 준비 단계(설정·덱 만들기 등)를 빠뜨리지 않는다(SPEC_015에서 빠뜨려 회차 낭비).
- 배포: 실기기 ⏳가 필요한 커밋은 묻지 않고 BRAT 배포(version 3파일 올림 → `git push buttdev main` + 같은 이름 태그 → 릴리스 확인은 `curl` GitHub API, `gh` 없음) 후 ⏳ 요청. 그 밖의 push는 사람 지시 때만. `main.js`는 저장소에 없음.
- `styles.css`에 `backdrop-filter`·`filter: blur` 글자 금지(npm test). `docs/test_result.txt`는 .gitignore(11-25).
- Playwright 직접 스크립트는 `chromium.launch({ channel: "chrome" })`로(번들 Chromium 미설치).
- 셸 한 줄에 한국어·따옴표 JSON을 길게 넣으면 zsh 파싱 실패로 통째로 안 돎 → 긴 기록·버전 올림은 `.scratch/` 파이썬 스크립트로.
- 모듈 지도(파일·시험 번호·변이 이름·화면 검사 expect)는 `memory/modules.md` — 해당 기능을 고치기 전에 그 줄을 읽는다. 새 모듈은 거기에 한 줄.
- 지킬 것(자세히는 modules.md): 새 요청은 `requestUrl` 직접 말고 `send`(network.ts), 알림은 해요체·`failureNotice`, 새 catch엔 `diagnostics.record`, 명령·공개 메서드 늘리면 wiring 기대값도, 새 코드는 EarCoachView 말고 모듈로.
- node strip-types 시험: src 안 확장자 없는 import·생성자 매개변수 속성을 못 읽음 → 시험 대상 순수 모듈은 import 없이.
