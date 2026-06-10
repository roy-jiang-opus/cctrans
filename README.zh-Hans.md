<div align="center">

# cctrans

**省下最多 67% 的 token：用母语读 Claude Code，token 100% 按英文计费。**

[![npm version](https://img.shields.io/npm/v/cctrans?color=cb3837&logo=npm)](https://www.npmjs.com/package/cctrans)
[![npm downloads](https://img.shields.io/npm/dm/cctrans?color=blue)](https://www.npmjs.com/package/cctrans)
[![GitHub stars](https://img.shields.io/github/stars/roy-jiang-opus/cctrans?style=flat&logo=github)](https://github.com/roy-jiang-opus/cctrans)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![node](https://img.shields.io/node/v/cctrans)](package.json)

[English](README.md) | **简体中文** | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

</div>

---

```
● I will refactor the auth module to use async tokens.
  ↳ 我将重构 auth 模块以使用异步令牌。
  This touches 3 files and adds a retry layer.
  ↳ 这涉及 3 个文件并添加重试层。
```

给 Claude Code 加一层**双语对照**:每行英文下面一行译文(中/日/韩/俄/印地/西/葡/法/德),**就在对话里**——仅作显示,转录、模型上下文和你的 token 账单 100% 保持英文。

## ✨ 特性

- 🪞 **行内双语显示** —— 译文随回复流式出现在每行英文下方,就在对话里
- 🧩 **三种排版** —— 逐行对照、按块成组(`cctrans mode section`),或整条回复成组(`cctrans mode message`)
- 🧾 **非破坏** —— 转录与模型上下文保持纯英文;skills、文档、代码不受影响
- 🆓 **主对话零 token** —— 翻译走独立便宜后端(也有免费选项),完全在 Claude Code 会话之外
- ⌨️ **输入翻译(beta)** —— 用母语打字,模型按英文工作、按英文回复(`cctrans input on`)
- 🌏 **10 种目标语言** —— `zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` `es` `pt` `fr` `de`
- 🔌 **6 个后端自动降级** —— OpenAI / Anthropic / DeepL / Azure / 免费 Google / 你自己的 Claude 订阅
- 📁 **项目级覆盖** —— 在仓库里放一个 `.cc-translate.json`,只为该项目切换语言/模式(或直接关闭)
- 🔒 **密钥隔离** —— API key 只存在 chmod-600 的文件里,从不读终端环境变量
- 🛟 **故障安全** —— 任何错误或超时都回退为纯英文,绝不卡住会话
- 🩺 **内置诊断** —— `cctrans doctor` 解释为什么没在翻译;`cctrans stats` 显示你省下的 token

## 🚀 快速开始

```bash
npm install -g cctrans@latest && cctrans install
```

安装会注册钩子并引导你完成配置(语言 → 显示模式 → 后端 → API key → 实时验证)。然后**重启 Claude Code**——回复变成双语。随时在 Claude Code 输入框里输入 `!cctrans off` / `!cctrans on` 开关(`!` 是 CC 内置 bash 模式,不调用模型、不花 token)。

**已经装过?** 用 `npm install -g cctrans@latest` 更新——从下一条回复起生效(钩子每个分块都从磁盘重新运行);你的设置、密钥和已注册的钩子原样保留,无需重新配置。

<details>
<summary>从源码安装</summary>

```bash
git clone https://github.com/roy-jiang-opus/cctrans.git
cd cctrans
node bin/cctrans.js install
```

需要 `~/.local/bin` 在 PATH 里,或用别名:`alias cctrans='node /path/to/cctrans/bin/cctrans.js'`

</details>

## 🤔 为什么做这个

两个痛点,一个架构解决:

**1. Claude Code 老是回英文。** Skills 和文档必须保持英文,即使在 CLAUDE.md 里写了"用中文回复",回复还是会漂回英文。手动让它重答一遍中文,既花一整轮模型调用,又污染对话历史。

**2. 用母语工作有一笔隐形的 token 税——尤其在 Claude 上。** 表达同样的意思,非英语要多花 **约 1.5–3 倍 token**(Claude 的分词器对非拉丁文字压缩很差),而 Claude Code 的 5 小时窗口和每周额度都按 token 计——非英语会话烧额度快 1.5–3 倍。关键是,**模型质量根本不是问题**:Claude 多语言基准 >90%。痛点纯粹是成本。

| | 日语 | 韩语 | 俄语 | 印地语 | 中文 |
|---|---|---|---|---|---|
| 相对英文的 token 开销 | ~2–3× | ~2–3×+ | ~1.5× | ~2–3×+ | ~2–3× |

Anthropic 关于按语言调整额度的 issue([#26401](https://github.com/anthropics/claude-code/issues/26401))已被关闭(*not planned*)——官方没有解法。

**所以最省钱且正确的设计正是本工具的做法:** 会话全程保持英文(输入、转录、模型上下文——主对话零额外 token),你的语言只出现在人需要读的地方:每行英文下面一行仅作显示的译文,由独立的便宜后端渲染。

完整调研数据与来源:[MOTIVATION.md](MOTIVATION.md)。

## ⚙️ 工作原理

利用 Claude Code 原生的 **`MessageDisplay` 钩子**(v2.1.152+):它在每条助手消息渲染时触发,把完成的文本片段(`delta`)交给钩子;钩子返回的 `displayContent` **替换屏幕显示**,但不改变存储的消息。

```
Claude 流式输出英文
        │  每完成一行/段触发一次(stdin: turn_id/message_id/index/final/delta)
        ▼
  hook/message-display.js  ──►  src/interleave.js  ──►  src/translate.js
   (读 delta、查开关)          (区分散文/代码/已是目标语言)    (多后端 + 缓存)
        │
        ▼  返回 displayContent = "英文行\n↳ 译文行"
   Claude Code 就地替换显示(原文仍在转录/上下文中)
```

> 已在 CC 2.1.169 实测:`delta` 是**互不重叠**的已完成片段(不是累积文本),普通 `\n` 即可让两种语言分行显示,代码块/路径/已是目标语言的行自动跳过。

## 🎛 命令

| 命令 | 作用 |
|------|------|
| `cctrans on` / `cctrans off` / `cctrans toggle` | 开 / 关 / 切换翻译 |
| `cctrans status` | 查看状态(开关、钩子、后端、语言) |
| `cctrans lang [code]` | 查看/切换目标语言:`zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` `es` `pt` `fr` `de` |
| `cctrans mode [line\|section\|message]` | 排版:逐行、按块,或整条回复 |
| `cctrans backend <id>` | 切换翻译引擎 |
| `cctrans backends` | 列出所有引擎及其可用性 |
| `cctrans doctor` | 诊断:钩子、Claude Code 版本、后端、密钥、最近一次钩子错误 |
| `cctrans stats` | 已翻译行数 + 估算省下的主对话 token |
| `cctrans cache [clear\|gc]` | 翻译缓存:大小 / 清空 / 按上限清理 |
| `cctrans setup` | 交互式向导:语言、显示模式、后端、API key |
| `cctrans key [id] [value]` | 管理 `~/.cc-translate/keys.json` 里的 API key |
| `cctrans input on` / `cctrans input off` | **(beta)** 把非英文输入翻译成英文(作为上下文发给模型) |
| `cctrans input threshold <n>` | 触发输入翻译的非拉丁字符数(默认 4) |
| `cctrans last [N]` | 把最近(或往前第 N 条)回复翻译到终端 |
| `cctrans test <文本>` | 翻译一段文本,验证引擎 |
| `cctrans install` / `cctrans uninstall` | 注册 / 移除钩子 |

## 🧩 显示模式

`line`(默认)逐行对照:每行英文下面一行译文,随回复流式出现。`section` 让英文完全按 Claude 的流式输出原样呈现,在**一个块完成时**插入一段成组译文——对列表很多的回复要安静得多。`message` 更进一步:整条回复以纯英文流式输出,**一段成组译文在最后才出现**:

```
Use these flags:
↳ 使用以下参数：

- Enable the cache
- Set a small timeout
- Prefer the batch API
  ↳ 启用缓存
  ↳ 设置较短的超时
  ↳ 优先使用批量 API
```

```bash
cctrans mode section   # 按块 · cctrans mode message —— 整条回复 · cctrans mode line —— 切回默认
```

> section/message 模式下,译文在**所在块(或整条回复)完成时**才出现,而不是边流式边出——后端慢时(如 `claude-code`,3–6 秒/次)这个停顿会比较明显,所以这里 API 后端体验最好。某个块翻译失败时,英文不受影响,该块只是保持未翻译。

## 🌐 翻译后端

| 后端 | 前提 | 速度 | 质量 | 说明 |
|------|------|------|------|------|
| `openai`(有 key 时默认) | `cctrans key openai` | ~1.4s/段 | 高 | `gpt-4o-mini` 批量行翻译,保留代码/路径 |
| `anthropic` | `cctrans key anthropic` | ~1s/段 | 高 | `claude-haiku-4-5` + structured outputs,严格等长行数组(约 $0.0005/段) |
| `deepl` | `cctrans key deepl`(免费档 50 万字符/月) | ~0.5s/段 | 高 | 传统 MT 质量天花板;数组接口天然对齐行 |
| `azure` | `cctrans key azure`(免费 200 万字符/月) | ~0.5s/段 | 中高 | 可加 `cctrans key azure-region` |
| `google` | 无 | ~0.3s/段 | 中 | 免费非官方接口;**所有后端失败时的兜底** |
| `claude-code` | `claude` CLI 已登录 | ~3-6s/段 | 高 | 走你的 **Claude 订阅**(`claude -p` headless),零额外费用但明显慢 |

主后端失败/超时会自动**降级到 google**,任何情况下都不会卡住会话。每行译文按「后端+语言+内容」哈希缓存。

API key **只**存放在 `~/.cc-translate/keys.json`(chmod 600)——用 `cctrans setup` / `cctrans key` 设置,或直接编辑该文件。终端环境变量永远不会被读取,本工具的 key 和终端的 key 互不污染。

其余设置(后端、语言、标记、模型、Azure 端点)都在 `~/.cc-translate/state.json` 里——用 `cctrans` 命令修改或直接编辑文件。

## 🗣 多语言

```bash
cctrans lang zh-Hans  # 简体中文(默认)    cctrans lang zh-Hant  # 繁体中文
cctrans lang ja       # 日语                cctrans lang ko       # 韩语
cctrans lang ru       # 俄语                cctrans lang hi       # 印地语
cctrans lang es       # 西班牙语            cctrans lang pt       # 葡萄牙语
cctrans lang fr       # 法语                cctrans lang de       # 德语
```

**CJK + 俄语 + 印地语**(非拉丁文字)可按 Unicode 区间零成本判断"该行已是目标语言"并跳过;**西班牙语 / 葡萄牙语 / 法语 / 德语**(拉丁文字)则改用保守的停用词启发式——即使某行已是目标语言仍被重新翻译,同一性检查也会抑制原样回显,最坏情况只是浪费一次后端调用,绝不会出现错行。注意拉丁文字语言省下的 token 较少(相对英文约 1.1–1.2×,非拉丁文字为 1.5–3×——见 [MOTIVATION.md](MOTIVATION.md));对这些语言而言,吸引力主要是双语显示本身。

中文采用 BCP-47 **文字码**(`zh-Hans`/`zh-Hant`)——繁体是文字系统而非地区;`zh-CN` / `zh-TW` 仍可作为别名使用,会自动归一化。切换语言即刻生效(钩子每次调用都读状态),不同语言的缓存相互独立。

## 📁 项目级覆盖

在仓库根目录(工作目录的任意上级目录均可)放一个 `.cc-translate.json`,即可只为该项目覆盖全局设置:

```json
{ "target": "ja", "mode": "section" }
```

或者用 `{ "enabled": false }` 为某个项目关闭 overlay。可覆盖的字段:`enabled`、`target`、`mode`、`backend`、`marker`、`model`、`inputEn`、`inputMinChars`。机密不可覆盖——key 仍只存放在 `~/.cc-translate/keys.json`,端点设置也有意只在全局层面生效。在项目里运行 `cctrans status` 和 `cctrans doctor` 都会显示项目覆盖是否生效。请把克隆来的仓库里的 `.cc-translate.json` 当作其代码的一部分看待:例如,它可以为在该仓库中进行的工作切换后端(包括会消耗你订阅额度的 `claude-code`)。

## 🩺 故障排查

overlay 在设计上是故障安全的:任何错误都降级为纯英文,而不是卡住会话——这也意味着失败是**无声的**。当什么都没在翻译时:

```bash
cctrans doctor
```

它会检查钩子注册(包括旧版安装留下的失效路径)、Claude Code 版本(MessageDisplay 需要 ≥ 2.1.152)、配置的后端及其 key、实时连通性(含延迟),以及**最近一次钩子错误**(钩子在流式中途失败时会把错误记录到 `~/.cc-translate/last-error.json`)。想看看 overlay 为你做了什么:

```bash
cctrans stats    # 已翻译行数 + 估算省下的主对话 token
cctrans cache    # 翻译缓存大小;clear / gc 管理(默认 200 MB 上限)
```

## ⌨️ 输入翻译(beta)

`cctrans input on` 启用 `UserPromptSubmit` 钩子:当你的输入包含足够多的非拉丁字符时(默认 4 个以上——按绝对数量计,文件路径和标识符不会稀释触发条件;用 `cctrans input threshold <n>` 调整),英文译文会作为上下文附给模型并被视为权威指令,同时要求模型**用英文回复**——这样双语 overlay 持续生效,对话上下文全程保持英文。(已在 CC 2.1.169 核实:钩子无法改写 prompt 本身,所以原文仍在历史里,英文随附。)英文输入原样通过;任何错误都安全回退为原样发送。

> **Beta**:翻译调用会在每条非英文输入提交前阻塞约 0.5–1.5 秒。默认关闭;setup 向导会询问一次。反馈 → [issues](https://github.com/roy-jiang-opus/cctrans/issues)。

## 📏 行为与限制(已核实)

- 钩子在**流式输出中**按片段触发,每段单独翻译并就地替换——所以译文会随英文逐段出现。
- 钩子有 **10 秒**超时;本工具内部 9 秒兜底。任何错误/超时/超长(>9000 字符)都会**安全回退成原始英文**,绝不卡住会话。
- 每行译文按内容哈希**缓存**(`~/.cc-translate/cache`,200 MB 上限,每日清理),重绘和重复文本零成本。所有模式共享同一缓存。
- section/message 模式下,进行中块的文本会缓冲在 `~/.cc-translate/msgstate`(落盘暴露面与缓存相同);消息完成后该文件即删除,过期残留文件 24 小时后清理。
- 用 `openai` 时每段约一次 API 调用(~$0.0001),流式输出会比纯英文多约 1 秒/段的延迟;`google` 更快但质量略低。
- **Markdown 表格**保持完整:表格原样透传(从而保留 Claude Code 原生的框线渲染),并在其紧后展示一份翻译后的表格副本——不再因逐行插入译文而把表格行拆散。

## 🔗 关注项目

- ⭐ **Star / Watch** [github.com/roy-jiang-opus/cctrans](https://github.com/roy-jiang-opus/cctrans),第一时间获取版本更新
- 📦 **npm** —— [npmjs.com/package/cctrans](https://www.npmjs.com/package/cctrans) · 升级:`npm install -g cctrans@latest`
- 🗺 **路线图** —— [ROADMAP.md](ROADMAP.md):已完成与计划中的功能
- 📚 **调研** —— [MOTIVATION.md](MOTIVATION.md):本项目背后的非英语 token 税数据
- 🐛 **Issue / 新语言请求** —— [github.com/roy-jiang-opus/cctrans/issues](https://github.com/roy-jiang-opus/cctrans/issues)

## 📄 许可证

[MIT](LICENSE) © Roy Jiang
