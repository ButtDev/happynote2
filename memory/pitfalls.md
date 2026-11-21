# 함정·우회법

한 번 겪은 함정을 한 줄씩: `- <상황> → <원인> → <피하는 법> (<날짜>)`
- 업스트림 `npm test` Test 4가 실패 → 실제 `agy` CLI가 PATH에 있어야 함 → `PATH="$PWD/tests/fixtures/bin:$PATH" npm test`(verify `test`가 이렇게 돎) (2026-11-20)
- `npm test` 뒤 `docs/test_result.txt`가 바뀜 → 시험이 보고서를 덮어씀 → 커밋에 넣지 말 것 (2026-11-20)
- zsh에서 `${PIPESTATUS[0]}` 비어 있음 → zsh는 `pipestatus` → 종료 코드는 파이프 없이 `$?`로 (2026-11-20)
- 이 기기엔 `gh` CLI가 없음 → 릴리스 확인은 `curl -s https://api.github.com/repos/ButtDev/happynote2/releases/tags/<버전>`
- dictionaryapi.dev 발음 mp3(`/media/pronunciations/`)는 2026-11 기준 404 — 발음은 phonetics `sourceUrl` curid → Commons imageinfo ogg로 (SPEC_013 회차 2).
- `npm run build`의 tsc는 `tests/ui/`도 검사 — 화면 검사 entry에 새 확장자(.png 등) import를 넣으면 `tests/ui/*.d.ts` 선언이 필요(SPEC_017).
- 유튜브 srv3 자동 자막은 롤링 자막이 아님(단어 시각이 안 겹침) → 글자만 보는 롤링 중복 제거가 실제 반복 말("do you do you")을 지움. 시각으로 판단(SPEC_018).
