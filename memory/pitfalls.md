# 함정·우회법

한 번 겪은 함정을 한 줄씩: `- <상황> → <원인> → <피하는 법> (<날짜>)`
- 업스트림 `npm test` Test 4가 실패 → 실제 `agy` CLI가 PATH에 있어야 함 → `PATH="$PWD/tests/fixtures/bin:$PATH" npm test`(verify `test`가 이렇게 돎) (2026-11-20)
- `npm test` 뒤 `docs/test_result.txt`가 바뀜 → 시험이 보고서를 덮어씀 → 커밋에 넣지 말 것 (2026-11-20)
- zsh에서 `${PIPESTATUS[0]}` 비어 있음 → zsh는 `pipestatus` → 종료 코드는 파이프 없이 `$?`로 (2026-11-20)
- 이 기기엔 `gh` CLI가 없음 → 릴리스 확인은 `curl -s https://api.github.com/repos/ButtDev/happynote2/releases/tags/<버전>`
- dictionaryapi.dev 발음 mp3(`/media/pronunciations/`)는 2026-11 기준 404 — 발음은 phonetics `sourceUrl` curid → Commons imageinfo ogg로 (SPEC_013 회차 2).
