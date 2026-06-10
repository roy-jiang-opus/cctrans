<div align="center">

# cctrans

**토큰 최대 67% 절약: Claude Code를 모국어로, 과금은 100% 영어 그대로.**

[![npm version](https://img.shields.io/npm/v/cctrans?color=cb3837&logo=npm)](https://www.npmjs.com/package/cctrans)
[![npm downloads](https://img.shields.io/npm/dm/cctrans?color=blue)](https://www.npmjs.com/package/cctrans)
[![GitHub stars](https://img.shields.io/github/stars/roy-jiang-opus/cctrans?style=flat&logo=github)](https://github.com/roy-jiang-opus/cctrans)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![node](https://img.shields.io/node/v/cctrans)](package.json)

[English](README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | **한국어** | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

</div>

---

```
● I will refactor the auth module to use async tokens.
  ↳ auth 모듈을 비동기 토큰을 사용하도록 리팩토링하겠습니다.
  This touches 3 files and adds a retry layer.
  ↳ 이 작업은 3개 파일에 영향을 주고 재시도 레이어를 추가합니다.
```

Claude Code의 **이중 언어 오버레이**: 각 영어 줄 아래에 번역(중/일/한/러/힌디/스페인/포르투갈/프랑스/독일) 한 줄씩, **대화 안에 그대로** — 표시 전용이므로 트랜스크립트, 모델 컨텍스트, 토큰 청구는 100% 영어로 유지됩니다.

## ✨ 특징

- 🪞 **인라인 이중 언어 표시** — 번역이 응답 스트리밍과 함께 각 영어 줄 아래에 나타납니다
- 🧩 **세 가지 레이아웃** — 줄 단위 인터리브, 블록 단위(`cctrans mode section`), 또는 응답 전체(`cctrans mode message`)
- 🧾 **비파괴적** — 트랜스크립트와 모델 컨텍스트는 순수 영어 유지; skills, 문서, 코드 영향 없음
- 🆓 **메인 루프 토큰 0** — 번역은 독립적인 저비용(무료 옵션 포함) 백엔드에서 실행, Claude Code 세션 완전 외부
- ⌨️ **입력 번역 (beta)** — 모국어로 입력하고 모델은 영어로 작동하고 영어로 응답(`cctrans input on`)
- 🌏 **10개 대상 언어** — `zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` `es` `pt` `fr` `de`
- 🔌 **6개 백엔드 + 자동 폴백** — OpenAI / Anthropic / DeepL / Azure / 무료 Google / 내 Claude 구독
- 📁 **프로젝트별 오버라이드** — 저장소에 `.cc-translate.json`을 두면 그 프로젝트에서만 언어/모드 전환(또는 비활성화)
- 🔒 **키 격리** — API 키는 chmod-600 파일에만; 셸 환경 변수는 절대 읽지 않음
- 🛟 **페일세이프** — 어떤 오류나 타임아웃도 영어 표시로 폴백; 세션을 절대 막지 않음
- 🩺 **내장 진단** — `cctrans doctor`가 왜 아무것도 번역되지 않는지 설명; `cctrans stats`가 절약한 토큰을 표시

## 🚀 빠른 시작

```bash
npm install -g cctrans@latest && cctrans install
```

설치가 훅을 등록하고 설정을 안내합니다(언어 → 표시 모드 → 백엔드 → API 키 → 실시간 검증). 그다음 **Claude Code를 재시작** — 응답이 이중 언어가 됩니다. Claude Code 입력창에 `!cctrans off` / `!cctrans on`을 입력해 언제든 전환(`!`는 CC 내장 bash 모드 — 모델 호출 없음, 토큰 없음).

**이미 설치되어 있나요?** `npm install -g cctrans@latest`로 업데이트하세요 — 다음 응답부터 바로 적용됩니다(훅은 청크마다 디스크에서 새로 실행됨). 설정, 키, 등록된 훅은 그대로 유지되며 재설정이 필요 없습니다.

<details>
<summary>소스에서 설치</summary>

```bash
git clone https://github.com/roy-jiang-opus/cctrans.git
cd cctrans
node bin/cctrans.js install
```

`~/.local/bin`이 PATH에 있어야 하며, 아니면 별칭 사용: `alias cctrans='node /path/to/cctrans/bin/cctrans.js'`

</details>

## 🤔 왜 만들었나

두 가지 문제, 하나의 아키텍처:

**1. Claude Code는 자꾸 영어로 답합니다.** Skills와 문서는 영어로 유지해야 하고, CLAUDE.md에 "한국어로 답해"라고 적어도 답변은 영어로 돌아가곤 합니다. "한국어로"라고 다시 요청하면 모델 호출 한 턴을 통째로 쓰고 대화 히스토리도 오염됩니다.

**2. 모국어로 작업하면 숨은 토큰세가 붙습니다 — 특히 Claude에서.** 같은 의미를 표현하는 데 영어보다 **약 1.5–3배 많은 토큰**이 듭니다(Claude의 토크나이저는 비라틴 문자 압축이 약함). Claude Code의 5시간 윈도우와 주간 한도는 토큰으로 측정되므로 비영어 세션은 플랜을 1.5–3배 빨리 소진합니다. 중요한 건, **답변 품질은 문제가 아니라는 것**: Claude는 다국어 벤치마크에서 90% 이상. 고통은 순전히 비용입니다.

| | 일본어 | 한국어 | 러시아어 | 힌디어 | 중국어 |
|---|---|---|---|---|---|
| 영어 대비 토큰 비용 | ~2–3× | ~2–3×+ | ~1.5× | ~2–3×+ | ~2–3× |

언어별 한도 조정을 요청한 Anthropic의 issue([#26401](https://github.com/anthropics/claude-code/issues/26401))는 *not planned*로 닫혔습니다 — 공식 해결책은 없습니다.

**그래서 가장 저렴하고 올바른 설계가 바로 이 도구의 방식입니다:** 세션은 처음부터 끝까지 영어로 유지되고(프롬프트, 트랜스크립트, 모델 컨텍스트 — 메인 루프 추가 토큰 0), 당신의 언어는 사람이 읽는 곳에만 존재합니다: 각 영어 줄 아래 표시 전용 번역 줄을 독립적인 저비용 백엔드가 렌더링합니다.

출처가 포함된 전체 조사 노트: [MOTIVATION.md](MOTIVATION.md).

## ⚙️ 작동 원리

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

## 🎛 명령

| 명령 | 동작 |
|------|------|
| `cctrans on` / `cctrans off` / `cctrans toggle` | 번역 켜기 / 끄기 / 전환 |
| `cctrans status` | 상태 표시 (토글, 훅, 백엔드, 언어) |
| `cctrans lang [code]` | 대상 언어 표시/설정: `zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` `es` `pt` `fr` `de` |
| `cctrans mode [line\|section\|message]` | 레이아웃: 줄 단위, 블록 단위, 또는 응답 전체 |
| `cctrans backend <id>` | 번역 엔진 전환 |
| `cctrans backends` | 모든 엔진과 가용성 나열 |
| `cctrans doctor` | 진단: 훅, Claude Code 버전, 백엔드, 키, 마지막 훅 오류 |
| `cctrans stats` | 번역한 줄 수 + 절약한 메인 루프 토큰 추정치 |
| `cctrans cache [clear\|gc]` | 번역 캐시 크기 / 비우기 / 크기 상한 적용 |
| `cctrans setup` | 대화형 마법사: 언어, 표시 모드, 백엔드, API 키 |
| `cctrans key [id] [value]` | `~/.cc-translate/keys.json`의 API 키 관리 |
| `cctrans input on` / `cctrans input off` | **(beta)** 비영어 입력을 영어로 번역 (컨텍스트로 전송) |
| `cctrans input threshold <n>` | 입력 번역을 트리거하는 비라틴 문자 수 (기본 4) |
| `cctrans last [N]` | 최신(또는 N개 전) 응답을 터미널에 번역 |
| `cctrans test <텍스트>` | 텍스트를 번역하여 엔진 검증 |
| `cctrans install` / `cctrans uninstall` | 훅 등록 / 제거 |

## 🧩 표시 모드

`line`(기본)은 인터리브: 각 영어 줄 아래에 번역 한 줄씩, 응답 스트리밍과 함께 표시됩니다. `section`은 Claude가 스트리밍한 영어를 그대로 유지하고 **블록이 완성될 때 묶음 번역 하나**를 끼워 넣습니다 — 목록이 많은 응답에서 훨씬 차분합니다. `message`는 한 걸음 더 나아갑니다: 응답 전체가 순수 영어로 스트리밍되고 **묶음 번역 하나가 맨 마지막에** 도착합니다:

```
Use these flags:
↳ 다음 플래그를 사용하세요:

- Enable the cache
- Set a small timeout
- Prefer the batch API
  ↳ 캐시를 활성화
  ↳ 짧은 타임아웃 설정
  ↳ 배치 API 우선 사용
```

```bash
cctrans mode section   # 블록 단위 · cctrans mode message — 응답 전체 · cctrans mode line — 기본값으로 복귀
```

> section/message 모드에서는 번역이 스트리밍 중이 아니라 **해당 블록(또는 응답)이 완성될 때** 나타납니다 — 느린 백엔드(예: `claude-code`, 3–6초/호출)에서는 그 간격이 눈에 띄므로 여기서는 API 백엔드가 가장 적합합니다. 블록 번역이 실패해도 영어는 영향을 받지 않고 해당 블록만 번역 없이 남습니다.

## 🌐 번역 백엔드

| 백엔드 | 요구사항 | 속도 | 품질 | 비고 |
|--------|----------|------|------|------|
| `openai` (키 있으면 기본) | `cctrans key openai` | ~1.4s/조각 | 높음 | `gpt-4o-mini` 줄 배치 번역, 코드/경로 보존 |
| `anthropic` | `cctrans key anthropic` | ~1s/조각 | 높음 | `claude-haiku-4-5` + structured outputs, 엄격한 등길이 줄 배열 (~$0.0005/조각) |
| `deepl` | `cctrans key deepl` (무료 50만 자/월) | ~0.5s/조각 | 높음 | 전통 MT 최고 품질; 배열 API로 줄이 자연히 정렬 |
| `azure` | `cctrans key azure` (무료 200만 자/월) | ~0.5s/조각 | 중상 | `cctrans key azure-region` 추가 가능 |
| `google` | 없음 | ~0.3s/조각 | 중 | 무료 비공식 엔드포인트; **모든 백엔드 실패 시 폴백** |
| `claude-code` | `claude` CLI 로그인됨 | ~3-6s/조각 | 높음 | **Claude 구독**으로 실행 (`claude -p` headless) — 추가 비용 없지만 눈에 띄게 느림 |

기본 백엔드가 실패/타임아웃하면 자동으로 **google로 폴백** — 세션이 멈추는 일은 없습니다. 모든 번역 줄은 "백엔드+언어+내용" 해시로 캐시됩니다.

API 키는 **오직** `~/.cc-translate/keys.json`(chmod 600)에만 저장됩니다 — `cctrans setup` / `cctrans key`로 설정하거나 파일을 직접 편집하세요. 셸 환경 변수는 절대 읽지 않으므로 이 도구의 키와 터미널의 키가 서로 오염되지 않습니다.

나머지 설정(백엔드, 언어, 마커, 모델, Azure 엔드포인트)은 `~/.cc-translate/state.json`에 있습니다 — `cctrans` 명령으로 변경하거나 파일을 직접 편집하세요.

## 🗣 다국어

```bash
cctrans lang zh-Hans  # 간체 중국어 (기본)            cctrans lang zh-Hant  # 번체 중국어
cctrans lang ja       # 일본어                        cctrans lang ko       # 한국어
cctrans lang ru       # 러시아어                      cctrans lang hi       # 힌디어
cctrans lang es       # 스페인어                      cctrans lang pt       # 포르투갈어
cctrans lang fr       # 프랑스어                      cctrans lang de       # 독일어
```

**CJK + 러시아어 + 힌디어**(비라틴 문자)는 유니코드 범위로 "이 줄은 이미 대상 언어"를 무비용 판별하여 건너뜁니다. **스페인어 / 포르투갈어 / 프랑스어 / 독일어**(라틴 문자)는 대신 보수적인 불용어 휴리스틱으로 판별합니다 — 이미 대상 언어인 줄이 다시 번역되더라도 동일성 검사가 메아리를 억제하므로, 최악의 경우라도 백엔드 호출 한 번이 낭비될 뿐 잘못된 줄이 표시되는 일은 없습니다. 참고로 라틴 문자 언어는 토큰 절약 폭이 더 작습니다(영어 대비 ~1.1–1.2×, 비라틴의 1.5–3×와 대조 — [MOTIVATION.md](MOTIVATION.md) 참고); 이 언어들의 매력은 이중 언어 표시 그 자체입니다.

중국어는 BCP-47 **문자 코드**(`zh-Hans`/`zh-Hant`)를 사용합니다 — 번체는 지역이 아니라 문자 체계입니다; `zh-CN` / `zh-TW`는 별칭으로 계속 사용 가능하며 자동으로 정규화됩니다. 언어 전환은 즉시 적용됩니다 (훅이 호출마다 상태를 읽음); 언어별 캐시는 독립적입니다.

## 📁 프로젝트별 오버라이드

저장소 루트(작업 디렉터리의 어느 상위 디렉터리든 가능)에 `.cc-translate.json`을 두면 그 프로젝트에서만 전역 설정을 오버라이드할 수 있습니다:

```json
{ "target": "ja", "mode": "section" }
```

또는 `{ "enabled": false }`로 특정 프로젝트에서만 오버레이를 끌 수 있습니다. 오버라이드 가능한 필드: `enabled`, `target`, `mode`, `backend`, `marker`, `model`, `inputEn`, `inputMinChars`. 시크릿은 오버라이드할 수 없습니다 — 키는 `~/.cc-translate/keys.json`에 그대로 두며, 엔드포인트 설정도 설계상 전역 전용입니다. 프로젝트 안에서 실행한 `cctrans status`와 `cctrans doctor` 모두 프로젝트 오버라이드가 활성화되어 있음을 표시합니다. 클론한 저장소의 `.cc-translate.json`은 그 저장소 코드의 일부로 취급하세요: 예를 들어 그 저장소에서 하는 작업의 백엔드를 (구독을 소모하는 `claude-code`를 포함해) 바꿀 수 있습니다.

## 🩺 문제 해결

이 오버레이는 설계상 페일세이프입니다: 모든 오류는 세션을 막는 대신 순수 영어 표시로 내려갑니다 — 뒤집어 말하면 실패가 **조용히** 일어난다는 뜻입니다. 아무것도 번역되지 않을 때:

```bash
cctrans doctor
```

가 훅 등록 상태(이전 설치의 오래된 경로 포함), Claude Code 버전(MessageDisplay는 2.1.152 이상 필요), 설정된 백엔드와 그 키, 실시간 연결성(지연 시간 포함), 그리고 **마지막 훅 오류**(스트리밍 도중 실패하면 훅이 `~/.cc-translate/last-error.json`에 기록)를 점검합니다. 오버레이가 그동안 무엇을 해줬는지 보려면:

```bash
cctrans stats    # 번역한 줄 수 + 절약한 메인 루프 토큰 추정치
cctrans cache    # 번역 캐시 크기; clear / gc로 관리 (기본 상한 200 MB)
```

## ⌨️ 입력 번역 (beta)

`cctrans input on`은 `UserPromptSubmit` 훅을 활성화합니다: 입력에 비라틴 문자가 충분히 포함되면(기본 4자 이상 — 절대 개수로 판정하므로 파일 경로나 식별자가 트리거를 희석하지 않습니다; `cctrans input threshold <n>`로 조정), 영어 번역이 컨텍스트로 모델에 첨부되어 정식 지시로 취급되고, 모델에게 **영어로 응답**하도록 요청합니다 — 이로써 이중 언어 오버레이가 계속 작동하고 대화 컨텍스트는 끝까지 영어로 유지됩니다. (CC 2.1.169에서 검증됨: 훅은 prompt 자체를 재작성할 수 없으므로 원문은 히스토리에 남고 영어가 함께 첨부됩니다.) 영어 입력은 그대로 통과; 오류 시 안전하게 원문 그대로 전송됩니다.

> **Beta**: 번역 호출로 인해 비영어 프롬프트 제출마다 약 0.5–1.5초 지연됩니다. 기본은 꺼짐; setup 마법사가 한 번 묻습니다. 피드백 → [issues](https://github.com/roy-jiang-opus/cctrans/issues)

## 📏 동작과 제한 (검증됨)

- 훅은 **스트리밍 중** 조각마다 발화하며, 조각별로 번역하여 그 자리에서 교체 — 번역이 영어와 함께 점진적으로 나타납니다.
- 훅 타임아웃은 **10초**; 이 도구는 내부적으로 9초 가드를 둡니다. 오류/타임아웃/초과(>9,000자)는 모두 **원본 영어로 안전하게 폴백** — 세션을 멈추지 않습니다.
- 모든 번역 줄은 내용 해시로 **캐시**됩니다 (`~/.cc-translate/cache`, 200 MB 상한을 매일 적용); 다시 그리기와 반복 텍스트는 비용이 없습니다. 모든 모드가 캐시를 공유합니다.
- section/message 모드에서는 진행 중인 블록의 텍스트가 `~/.cc-translate/msgstate`에 버퍼링됩니다(저장 시 노출 수준은 캐시와 동일); 파일은 메시지 완료 시 삭제되고 오래된 파일은 24시간 후 정리됩니다.
- `openai` 사용 시 조각당 약 1회 API 호출(~$0.0001), 순수 영어 대비 조각당 약 1초 지연; `google`은 더 빠르지만 품질이 약간 낮습니다.
- **Markdown 테이블**은 그대로 유지됩니다: 테이블은 손대지 않고 통과되어(Claude Code 네이티브의 박스 드로잉 렌더링이 보존됨) 그 바로 뒤에 번역된 테이블 사본이 표시됩니다 — 더 이상 끼어든 번역으로 행이 쪼개지지 않습니다.

## 🔗 프로젝트 팔로우

- ⭐ **Star / Watch** [github.com/roy-jiang-opus/cctrans](https://github.com/roy-jiang-opus/cctrans) — 릴리스 업데이트 받기
- 📦 **npm** — [npmjs.com/package/cctrans](https://www.npmjs.com/package/cctrans) · 업그레이드: `npm install -g cctrans@latest`
- 🗺 **로드맵** — [ROADMAP.md](ROADMAP.md): 완료된 것과 예정된 것
- 📚 **리서치** — [MOTIVATION.md](MOTIVATION.md): 이 프로젝트 배경의 비영어 토큰세 데이터
- 🐛 **이슈 / 언어 요청** — [github.com/roy-jiang-opus/cctrans/issues](https://github.com/roy-jiang-opus/cctrans/issues)

## 📄 라이선스

[MIT](LICENSE) © Roy Jiang
