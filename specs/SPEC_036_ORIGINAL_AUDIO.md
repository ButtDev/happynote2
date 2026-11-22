---
id: SPEC_036
title: 핀 문장 Anki 듣기 카드 소리를 TTS 대신 유튜브 원음 구간으로
status: DONE
iterations: 1
max_iterations: 3
depends_on: [SPEC_026]
---

# SPEC 036 — 핀 문장 듣기 카드에 유튜브 원음 구간

> 2026-11-22 사람: 「핀설정한 문장을 tts 로 들으면 너무 쉬워, 적당한 속도로 또박또박읽으니까. 그보다, 유튭에서 해당음성을 잘라내서 anki 에 추가하는게 취지에 맞을듯」 — SPEC_026 「범위 밖: 영상 원음 구간 추출」을 이번에 한다.

## 1. 목표 — 이번에 할 것과 하지 않을 것 한 문단
핀 문장 「➕ Anki」(SPEC_026)가 만드는 듣기 카드의 소리를 AnkiDroid TTS(`{{tts en_US:Sentence}}`)에서 **유튜브 원음의 그 문장 구간**으로 바꾼다. Android innertube player 응답의 오디오 전용 스트림(itag 140, AAC m4a, DASH 조각)에서 `sidx` 색인으로 문장 시각을 덮는 조각만 받아(`&range=` 바이트), 웹뷰 `decodeAudioData`로 풀어 앞뒤 여유를 두고 잘라 모노 22,050Hz 16비트 WAV로 만들고 `storeMediaFile` → 노트 Picture 필드에 `[sound:…]`로 넣는다. 원음을 못 받으면 카드를 저장하지 않고 알린다(소리 없는 듣기 카드는 쓸모없음). 노트 타입 필드 구성은 그대로이고, 앞면 템플릿에서 TTS만 사람이 한 번 지운다(AnkiConnect Android에 템플릿 바꾸기 없음). 2026-11-22 데스크톱 시험: ANDROID 클라이언트 itag 140 URL이 서명 없이 `&range=` 받기 200, 초기화(723B)+조각 1개를 Chrome `decodeAudioData`가 9.98초 2채널로 풂.

## 2. 파일 — 추가·수정할 파일, 이전과 달라지는 점
- `src/services/audioClip.ts`(새, 순수·obsidian import 없음): `parseSidx`, `pickAudioFormat`, `fragmentsForRange`, `clipWindow`, `encodeWav`, `fetchSentenceAudio`(요청 함수·디코더 주입).
- `src/ui/audioDecode.ts`(새): 웹뷰 `OfflineAudioContext`로 풀기·자르기·모노 22,050Hz 다시 뜨기 → `Float32Array`.
- `src/main.ts`: `audioClip(videoId, start, end)` → WAV base64(없으면 null). player 응답은 영상별 세션 캐시(URL 만료 대비 1시간). 900줄 한도 안.
- `src/ui/sentenceAnki.ts`: deps `audioClip`, Picture 필드에 소리를 앞에 넣음, 못 받으면 저장 안 함.
- `src/services/anki.ts`: `SentenceNoteInput.audioFilename`, Picture = `[sound:파일]` + `<img>`, `ANKI_SENTENCE_FRONT_TEMPLATE` TTS 뺌, 문구 `ANKI_MESSAGES.noAudio`, `audioFilename()`.
- `src/ui/EarCoachView.ts`: deps에 `audioClip` 넘김.
- 시험: Test 23 + `tests/fixtures/audio-clip/`(실제 itag 140 초기화+sidx 바이트, 조각 고르기·창·WAV 머리 기대값), Test 12 `_sentence.json` 소리 사례, 화면 검사 `expect.sentenceAnki`에 storeMediaFile(wav) 확인 + 실제 조각 하나 디코드 사례.

## 3. 정의 — 공개 이름·데이터 구조·문구·수치를 글자 그대로
- 스트림 고르기 `pickAudioFormat(adaptiveFormats)`: `url`이 있는 itag 140 → 없으면 url 있는 `audio/mp4` 중 bitrate 가장 높은 것 → 없으면 null(webm·서명 암호는 안 씀). `indexRange`·`initRange` 필요.
- `parseSidx(bytes, offsetOfSidx)`: version 0·1, `{ timescale, fragments: [{ start(초), end(초), byteStart, byteEnd }] }`, 첫 조각 바이트 = sidx 끝 + first_offset.
- 창 `clipWindow(start, end, duration?)`: `[max(0, start − 0.25), end + 0.35]`, 길이 상한 20초(넘으면 start부터 20초), end ≤ start면 start + 3초.
- `fragmentsForRange(sidx, a, b)`: 창과 겹치는 연속 조각들(첫·끝 번호). 받기 = 초기화 바이트 + 그 조각들 이어 붙임, 디코드 결과 0초 = 첫 조각 start.
- WAV: RIFF/WAVE PCM 1채널 22,050Hz 16비트, 샘플 −1~1 잘라 32767 곱함.
- 파일 이름 `audioFilename(videoId, start)` = `happynote2_<videoId>_<start 소수 1자리 → 점을 _로>.wav` (예: `happynote2_abc123_12_3.wav`).
- Picture 필드: `[sound:<파일>]` + (그림 있으면) `<img src="…">`.
- 앞면 템플릿 `ANKI_SENTENCE_FRONT_TEMPLATE` = `{{Picture}}<br>{{Cloze}}<br>{{Hint}}`.
- 문구 `ANKI_MESSAGES.noAudio` = `원음을 받지 못해 저장하지 않았습니다 (네트워크·영상 확인)`.
- 저장 순서: deckNames → modelNames → modelFieldNames → storeMediaFile(그림) → storeMediaFile(소리) → canAddNotes → addNote.
- 네트워크는 Obsidian `requestUrl`(player POST는 기존 storyboard와 같은 ANDROID 클라이언트·User-Agent), 조각은 URL `&range=a-b`.

## 4. 범위 밖
단어 카드(SPEC_015)에 원음, 이미 만든 카드 고치기, 원음 실패 시 TTS 대체, webm/opus·서명 암호 스트림, 소리 파일을 볼트에 저장, 노트 타입·템플릿 자동 변경, 재생 속도 조절.

## 5. 완료 조건 — 체크박스, 끝에 [자동]/[수동]. [수동]은 마지막 하나로
1. [x] Test 23: 실제 itag 140 초기화+sidx 바이트에서 timescale 44100·조각 수·첫 조각 바이트 범위가 기대값과 같음, `fragmentsForRange`·`clipWindow`·`pickAudioFormat` 사례 통과, `encodeWav` 머리(RIFF·WAVE·22050·16비트·데이터 길이) 통과 + 변이(sidx 첫 오프셋 무시한 사본) 실패 [자동]
2. [x] Test 12: 소리 파일이 있으면 Picture가 `[sound:happynote2_…wav]`로 시작, 앞면 템플릿에 `tts` 없음 [자동]
3. [x] 화면 검사 `expect.sentenceAnki`: 호출 순서에 storeMediaFile(`.wav`)이 canAddNotes 앞, 원음 실패 흉내면 addNote 0회·알림 `원음을 받지 못해…` [자동]
4. [x] 화면 검사 Chrome에서 실제 조각 fixture를 `audioDecode`로 풀어 자른 WAV 길이가 창 길이 ±0.05초 [자동]
5. [x] 회귀 `verify.mjs --set regression`(main.ts 900줄 한도 포함) [자동]
6. [x] 준비: AnkiDroid → 노트 타입 `happynote2 Listening` → 카드 → 앞면 템플릿에서 `{{tts en_US:Sentence}}<br>` 지우고 저장. 그다음 실기기에서 핀 문장 「➕ Anki」로 카드 하나 만들어 AnkiDroid에서 앞면을 열었을 때 그 문장의 유튜브 원래 목소리가 나오는지(앞뒤가 잘리지 않았는지) 듣고 버튼 [수동]

## 6. 자동 검증 — 조건마다 판정 방법 (verify 항목·grep·스크린샷)
1 → `npm test` Test 23 + 변이 `EAR_COACH_AUDIOCLIP_MODULE`. 2 → Test 12. 3·4 → verify ui(`sentence-anki-portrait.png` 열어 봄). 5 → `verify.mjs --set regression`.

## 7. 수동 검증 — 사람이 따라 할 번호 절차 (있으면)
1. BRAT 업데이트. 2. AnkiDroid 앞면 템플릿에서 TTS 한 줄 지우기(위 6). 3. 핀 문장 「➕ Anki」 → AnkiDroid에서 카드 앞면 듣고 버튼.

## 8. 가결정 — 고른 것 · 이유 · 대안 (있으면)
- 원음은 Picture 필드에 `[sound:]` · 이유: 앞면에 이미 있는 필드라 필드 추가 없이 템플릿 한 줄 지우기만 하면 됨 · 대안: Audio 필드 새로 추가(사람 단계 늘어남).
- 원음 실패면 저장 안 함 · 이유: TTS를 지운 템플릿에선 소리 없는 듣기 카드가 됨 · 대안: 소리 없이 저장 + 알림.
- WAV(모노 22,050Hz) · 이유: 인코더 의존성 없음, 6초 ≈ 265KB · 대안: AAC 조각 그대로(.m4a 재포장, 복잡) 또는 mp3 인코더 추가.
- 여유 앞 0.25초·뒤 0.35초 · 이유: 자동 자막 시각이 살짝 빠르거나 늦음 · 대안: 설정으로.
- itag 140 · 이유: AAC-LC라 웹뷰 디코드가 가장 안전(139는 HE-AAC) · 대안: 139(작음).

## 실행 기록
- 2026-11-22 회차 1: IMPLEMENTED — 1 ✅ Test 23 「sidx 121 fragments, 4 ranges, 5 windows, 4 picks, WAV header, clipper order+cache」(실제 TED iG9CE55wbtY itag 140: timescale 44100, 조각 1 = 164330~325620; 합성 sidx v1 first_offset 100), 변이 m1(first_offset 무시) → 「합성 sidx v1: ept·first_offset 반영」 실패, m2(20초 상한 뺌) → 「clipWindow(10, 40)」 실패 · 2 ✅ Test 12 Picture `[sound:happynote2_uiCheck0001_10_1.wav]<img …>`·원음만·audioNames 3개, 앞면 템플릿 TTS 없음 · 3 ✅ 화면 검사 세로·가로 `sentenceAnki` 호출 deckNames→modelNames→modelFieldNames→storeMediaFile(jpg)→storeMediaFile(happynote2_uiCheck0001_6_7.wav)→canAddNotes→addNote, `sentenceAnki.noAudio` 호출 3개·addNote 0·문구 일치, 변이(원음 확인 뺌) → ui exit 1 「sentenceAnki.noAudio failed」 · 4 ✅ `sentenceAnki.decode` Chrome 실제 조각 1.0~4.0초 → 3.000초, peak 0.702, RIFF 132,344B · 5 ✅ `verify.mjs --set regression --json` harness·build·test·ui ok(main.ts 896줄), `sentence-anki-portrait.png` 열어 봄: 핀 카드 「➕ Anki」 배치 그대로 · 6 ⏳ 실기기
- 2026-11-22 사람 확인: DONE — 6 ✅ log/confirmations.jsonl 「[Button pressed: SPEC_036 6 OK]」(실기기 원음 확인). 1~5는 회차 1 근거, 제품 파일 변경 없음(회차 안 셈).
