# terminal-translate

[English](README.md) | **简体中文** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md)

给 Claude Code 加一层**双语对照**:每条回复在原始英文行下面自动补一行译文(中/日/韩/俄),**就在对话里**,一行英文一行译文。

```
● I will refactor the auth module to use async tokens.
  ↳ 我将重构 auth 模块以使用异步令牌。
  This touches 3 files and adds a retry layer.
  ↳ 这涉及 3 个文件并添加重试层。
```

- **非破坏**:屏幕上多了译文,但转录文件和模型看到的上下文**仍是纯英文**——技术文档、skills、代码都不受影响。
- **不污染历史、不耗主对话 token**:翻译由一个**独立的便宜后端**完成,跟你的 Claude Code 会话完全无关。
- **一个键开关**:默认常开;读纯英文/代码时一键关掉。

## 工作原理

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

## 安装

```bash
git clone git@github.com:roy-jiang-opus/cctranslate.git
cd cctranslate
node bin/tt.js install      # 注册钩子到 ~/.claude/settings.json,并把 tt 链接到 ~/.local/bin
```

然后**重启 Claude Code**(开新会话)让钩子生效。发任意消息,回复就会双语对照。

> 需要 `~/.local/bin` 在 PATH 里;否则用别名:
> `alias tt='node /path/to/cctranslate/bin/tt.js'`

## 使用

| 命令 | 作用 |
|------|------|
| `tt on` / `tt off` / `tt toggle` | 开 / 关 / 切换翻译 |
| `tt status` | 查看状态(开关、钩子、后端、语言) |
| `tt lang [code]` | 查看/切换目标语言:`zh-CN` `zh-TW` `ja` `ko` `ru` |
| `tt backend <id>` | 切换翻译引擎 |
| `tt backends` | 列出所有引擎及其可用性 |
| `tt last [N]` | 把最近(或往前第 N 条)回复翻译到终端 |
| `tt test <文本>` | 翻译一段文本,验证引擎 |
| `tt install` / `tt uninstall` | 注册 / 移除钩子 |

**最快的开关方式**:在 Claude Code 输入框里直接输入 `!tt off` 或 `!tt on`(`!` 是 CC 的内置 bash 模式,不调用模型、不花 token)。

## 翻译后端

| 后端 | 前提 | 速度 | 质量 | 说明 |
|------|------|------|------|------|
| `openai`(有 key 时默认) | `OPENAI_API_KEY` | ~1.4s/段 | 高 | `gpt-4o-mini` 批量行翻译,保留代码/路径 |
| `anthropic` | `ANTHROPIC_API_KEY` | ~1s/段 | 高 | `claude-haiku-4-5` + structured outputs,严格等长行数组(约 $0.0005/段) |
| `deepl` | `DEEPL_API_KEY`(免费档 50 万字符/月) | ~0.5s/段 | 高 | 传统 MT 质量天花板;数组接口天然对齐行 |
| `azure` | `AZURE_TRANSLATOR_KEY`(免费 200 万字符/月) | ~0.5s/段 | 中高 | 可加 `AZURE_TRANSLATOR_REGION` |
| `google` | 无 | ~0.3s/段 | 中 | 免费非官方接口;**所有后端失败时的兜底** |
| `claude-code` | `claude` CLI 已登录 | ~3-6s/段 | 高 | 走你的 **Claude 订阅**(`claude -p` headless),零额外费用但明显慢 |

主后端失败/超时会自动**降级到 google**,任何情况下都不会卡住会话。每行译文按「后端+语言+内容」哈希缓存。

环境变量:`TT_BACKEND`、`TT_TARGET`(默认 `zh-CN`)、`TT_MARKER`(默认 `↳ `)、`TT_HOME`(默认 `~/.cc-translate`)、`TT_OPENAI_MODEL`、`TT_ANTHROPIC_MODEL`、`AZURE_TRANSLATOR_ENDPOINT`。

## 多语言

目标语言支持 **CJK + 俄语**(非拉丁文字,可按 Unicode 区间零成本判断"该行已是目标语言"并跳过):

```bash
tt lang ja      # 日语
tt lang ko      # 韩语
tt lang ru      # 俄语
tt lang zh-TW   # 繁体中文
tt lang zh-CN   # 简体中文(默认)
```

切换语言即刻生效(钩子每次调用都读状态),不同语言的缓存相互独立。

## 行为与限制(已核实)

- 钩子在**流式输出中**按片段触发,每段单独翻译并就地替换——所以译文会随英文逐段出现。
- 钩子有 **10 秒**超时;本工具内部 9 秒兜底。任何错误/超时/超长(>9000 字符)都会**安全回退成原始英文**,绝不卡住会话。
- 每行译文按内容哈希**缓存**(`~/.cc-translate/cache`),重绘和重复文本零成本。
- 用 `openai` 时每段约一次 API 调用(~$0.0001),流式输出会比纯英文多约 1 秒/段的延迟;`google` 更快但质量略低。

## 卸载

```bash
node bin/tt.js uninstall    # 移除钩子;重启 Claude Code 生效
```
