# cctranslate

[English](README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | **한국어** | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

Claude Code에 **이중 언어 오버레이**를 추가합니다: 모든 응답에서 원본 영어 줄 아래에 번역(중/일/한/러/힌디)이 한 줄씩, **대화 안에 그대로** 표시됩니다.

```
● I will refactor the auth module to use async tokens.
  ↳ auth 모듈을 비동기 토큰을 사용하도록 리팩토링하겠습니다.
  This touches 3 files and adds a retry layer.
  ↳ 이 작업은 3개 파일에 영향을 주고 재시도 레이어를 추가합니다.
```

- **비파괴적**: 화면에 번역이 추가될 뿐, 트랜스크립트와 모델의 컨텍스트는 **순수 영어 그대로** 유지됩니다 — 기술 문서, skills, 코드에 전혀 영향이 없습니다.
- **히스토리 오염 없음, 메인 루프 토큰 소비 없음**: 번역은 **독립적인 저비용 백엔드**에서 실행되며 Claude Code 세션과 완전히 무관합니다.
- **원키 토글**: 기본은 항상 켜짐; 영어/코드만 읽고 싶을 때 즉시 끌 수 있습니다.

## 작동 원리

Claude Code 네이티브 **`MessageDisplay` 훅**(v2.1.152+)을 활용합니다: 어시스턴트 메시지가 렌더링될 때 발화하여 완성된 텍스트 조각(`delta`)을 훅에 전달하고, 훅이 반환하는 `displayContent`는 **화면 표시만 교체**하며 저장된 메시지는 변경하지 않습니다.

```
Claude가 영어를 스트리밍 출력
        │  조각 완성마다 발화 (stdin: turn_id/message_id/index/final/delta)
        ▼
  hook/message-display.js  ──►  src/interleave.js  ──►  src/translate.js
   (delta 읽기·토글 확인)       (산문/코드/이미 대상 언어 분류)   (멀티 백엔드 + 캐시)
        │
        ▼  displayContent = "영어 줄\n↳ 번역 줄" 반환
   Claude Code가 그 자리에서 표시 교체 (원문은 트랜스크립트/컨텍스트에 유지)
```

> CC 2.1.169에서 검증됨: `delta`는 **겹치지 않는** 완성 조각(누적 텍스트 아님)이며, 일반 `\n`으로 두 언어가 별도 줄에 표시되고, 코드 블록/경로/이미 대상 언어인 줄은 자동으로 건너뜁니다.

## 설치

```bash
git clone git@github.com:roy-jiang-opus/cctranslate.git
cd cctranslate
node bin/tt.js install      # 훅 등록, tt를 ~/.local/bin에 링크 후 setup 마법사 실행
```

그다음 **Claude Code를 재시작**(새 세션)하여 훅을 로드합니다. 아무 메시지나 보내면 응답이 이중 언어로 표시됩니다.

> `~/.local/bin`이 PATH에 있어야 합니다; 아니면 별칭을 사용하세요:
> `alias tt='node /path/to/cctranslate/bin/tt.js'`

## 사용법

| 명령 | 동작 |
|------|------|
| `tt on` / `tt off` / `tt toggle` | 번역 켜기 / 끄기 / 전환 |
| `tt status` | 상태 표시 (토글, 훅, 백엔드, 언어) |
| `tt lang [code]` | 대상 언어 표시/설정: `zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` |
| `tt backend <id>` | 번역 엔진 전환 |
| `tt backends` | 모든 엔진과 가용성 나열 |
| `tt setup` | 대화형 마법사: 언어, 백엔드, API 키 |
| `tt key [id] [value]` | `~/.cc-translate/keys.json`의 API 키 관리 |
| `tt input on` / `tt input off` | 비영어 입력을 영어로 번역 (컨텍스트로 전송) |
| `tt last [N]` | 최신(또는 N개 전) 응답을 터미널에 번역 |
| `tt test <텍스트>` | 텍스트를 번역하여 엔진 검증 |
| `tt install` / `tt uninstall` | 훅 등록 / 제거 |

**가장 빠른 토글**: Claude Code 입력창에 `!tt off` / `!tt on`을 직접 입력 (`!`는 CC 내장 bash 모드 — 모델 호출 없음, 토큰 소비 없음).

## 번역 백엔드

| 백엔드 | 요구사항 | 속도 | 품질 | 비고 |
|--------|----------|------|------|------|
| `openai` (키 있으면 기본) | `tt key openai` | ~1.4s/조각 | 높음 | `gpt-4o-mini` 줄 배치 번역, 코드/경로 보존 |
| `anthropic` | `tt key anthropic` | ~1s/조각 | 높음 | `claude-haiku-4-5` + structured outputs, 엄격한 등길이 줄 배열 (~$0.0005/조각) |
| `deepl` | `tt key deepl` (무료 50만 자/월) | ~0.5s/조각 | 높음 | 전통 MT 최고 품질; 배열 API로 줄이 자연히 정렬 |
| `azure` | `tt key azure` (무료 200만 자/월) | ~0.5s/조각 | 중상 | `tt key azure-region` 추가 가능 |
| `google` | 없음 | ~0.3s/조각 | 중 | 무료 비공식 엔드포인트; **모든 백엔드 실패 시 폴백** |
| `claude-code` | `claude` CLI 로그인됨 | ~3-6s/조각 | 높음 | **Claude 구독**으로 실행 (`claude -p` headless) — 추가 비용 없지만 눈에 띄게 느림 |

기본 백엔드가 실패/타임아웃하면 자동으로 **google로 폴백** — 세션이 멈추는 일은 없습니다. 모든 번역 줄은 "백엔드+언어+내용" 해시로 캐시됩니다.

API 키는 `~/.cc-translate/keys.json`(chmod 600)에 저장되며 `tt setup` 또는 `tt key`로 설정합니다 — 기본적으로 셸의 `OPENAI_API_KEY` 같은 환경 변수를 **읽지 않으므로** 이 도구의 키와 터미널의 키가 서로 오염되지 않습니다. `tt setup`이 감지된 환경 변수 키의 가져오기를 제안합니다; 일반 환경 변수 읽기는 `TT_USE_ENV_KEYS=1`로 옵트인, `TT_OPENAI_KEY` 형식의 전용 오버라이드는 항상 동작합니다.

환경 변수: `TT_BACKEND`, `TT_TARGET` (기본 `zh-Hans`), `TT_MARKER` (기본 `↳ `), `TT_HOME` (기본 `~/.cc-translate`), `TT_OPENAI_MODEL`, `TT_ANTHROPIC_MODEL`, `AZURE_TRANSLATOR_ENDPOINT`.

## 다국어

대상 언어는 **CJK + 러시아어 + 힌디어**를 지원합니다 (비라틴 문자이므로 유니코드 범위로 "이 줄은 이미 대상 언어"를 무비용 판별하여 건너뜁니다):

```bash
tt lang ja       # 일본어
tt lang ko       # 한국어
tt lang ru       # 러시아어
tt lang hi       # 힌디어
tt lang zh-Hant  # 번체 중국어
tt lang zh-Hans  # 간체 중국어 (기본)
```

중국어는 BCP-47 **문자 코드**(`zh-Hans`/`zh-Hant`)를 사용합니다 — 번체는 지역이 아니라 문자 체계입니다; `zh-CN` / `zh-TW`는 별칭으로 계속 사용 가능하며 자동으로 정규화됩니다. 언어 전환은 즉시 적용됩니다 (훅이 호출마다 상태를 읽음); 언어별 캐시는 독립적입니다.

## 입력 번역

`tt input on`은 `UserPromptSubmit` 훅을 활성화합니다: 입력이 대부분 비영어일 때 영어 번역이 컨텍스트로 모델에 첨부되어 정식 지시로 취급됩니다 — 당신은 모국어로 계속 입력하고 모델은 영어로 작동합니다. (CC 2.1.169에서 검증됨: 훅은 prompt 자체를 재작성할 수 없으므로 원문은 히스토리에 남고 영어가 함께 첨부됩니다.) 영어 입력은 그대로 통과; 오류 시 안전하게 원문 그대로 전송됩니다.

## 동작과 제한 (검증됨)

- 훅은 **스트리밍 중** 조각마다 발화하며, 조각별로 번역하여 그 자리에서 교체 — 번역이 영어와 함께 점진적으로 나타납니다.
- 훅 타임아웃은 **10초**; 이 도구는 내부적으로 9초 가드를 둡니다. 오류/타임아웃/초과(>9,000자)는 모두 **원본 영어로 안전하게 폴백** — 세션을 멈추지 않습니다.
- 모든 번역 줄은 내용 해시로 **캐시**됩니다 (`~/.cc-translate/cache`); 다시 그리기와 반복 텍스트는 비용이 없습니다.
- `openai` 사용 시 조각당 약 1회 API 호출(~$0.0001), 순수 영어 대비 조각당 약 1초 지연; `google`은 더 빠르지만 품질이 약간 낮습니다.

## 제거

```bash
node bin/tt.js uninstall    # 훅 제거; Claude Code 재시작으로 반영
```
