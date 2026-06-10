<div align="center">

# cctrans

**省下最多 67% 的 token：用母語讀 Claude Code，token 100% 按英文計費。**

[![npm version](https://img.shields.io/npm/v/cctrans?color=cb3837&logo=npm)](https://www.npmjs.com/package/cctrans)
[![npm downloads](https://img.shields.io/npm/dm/cctrans?color=blue)](https://www.npmjs.com/package/cctrans)
[![GitHub stars](https://img.shields.io/github/stars/roy-jiang-opus/cctrans?style=flat&logo=github)](https://github.com/roy-jiang-opus/cctrans)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![node](https://img.shields.io/node/v/cctrans)](package.json)

[English](README.md) | [简体中文](README.zh-Hans.md) | **繁體中文** | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

</div>

---

```
● I will refactor the auth module to use async tokens.
  ↳ 我將重構 auth 模組以使用非同步權杖。
  This touches 3 files and adds a retry layer.
  ↳ 這會影響 3 個檔案並加入重試層。
```

為 Claude Code 加上一層**雙語對照**:每行英文下方一行譯文(中/日/韓/俄/印地),**就在對話裡**——僅作顯示,轉錄、模型上下文和你的 token 帳單 100% 保持英文。

## ✨ 特性

- 🪞 **行內雙語顯示** —— 譯文隨回覆串流出現在每行英文下方,就在對話裡
- 🧩 **兩種排版** —— 逐行對照,或 `cctrans mode section`:整塊英文先出,再跟一段成組譯文
- 🧾 **非破壞性** —— 轉錄與模型上下文保持純英文;skills、文件、程式碼不受影響
- 🆓 **主對話零 token** —— 翻譯走獨立低成本後端(也有免費選項),完全在 Claude Code 工作階段之外
- ⌨️ **輸入翻譯(beta)** —— 用母語打字,模型按英文工作、按英文回覆(`cctrans input on`)
- 🌏 **6 種目標語言** —— `zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi`
- 🔌 **6 個後端自動降級** —— OpenAI / Anthropic / DeepL / Azure / 免費 Google / 你自己的 Claude 訂閱
- 🔒 **金鑰隔離** —— API key 只存在 chmod-600 的檔案裡,從不讀終端機環境變數
- 🛟 **故障安全** —— 任何錯誤或逾時都回退為純英文,絕不卡住工作階段

## 🚀 快速開始

```bash
npm install -g cctrans && cctrans install
```

安裝會註冊鉤子並引導你完成設定(語言 → 顯示模式 → 後端 → API key → 即時驗證)。然後**重新啟動 Claude Code**——回覆變成雙語。隨時在 Claude Code 輸入框輸入 `!cctrans off` / `!cctrans on` 開關(`!` 是 CC 內建 bash 模式,不呼叫模型、不花 token)。

**已經裝過?** 用 `npm update -g cctrans` 更新——從下一則回覆起生效(鉤子每個分塊都從磁碟重新執行);你的設定、金鑰和已註冊的鉤子原樣保留,無需重新設定。

<details>
<summary>從原始碼安裝</summary>

```bash
git clone https://github.com/roy-jiang-opus/cctrans.git
cd cctrans
node bin/cctrans.js install
```

需要 `~/.local/bin` 在 PATH 中,或使用別名:`alias cctrans='node /path/to/cctrans/bin/cctrans.js'`

</details>

## 🤔 為什麼做這個

兩個痛點,一個架構解決:

**1. Claude Code 老是回英文。** Skills 與文件必須保持英文,即使在 CLAUDE.md 裡寫了「用中文回覆」,回覆仍會飄回英文。手動讓它重答一遍中文,既花一整輪模型呼叫,又污染對話歷史。

**2. 用母語工作有一筆隱形的 token 稅——尤其在 Claude 上。** 表達同樣的意思,非英語要多花 **約 1.5–3 倍 token**(Claude 的分詞器對非拉丁文字壓縮很差),而 Claude Code 的 5 小時視窗與每週額度都按 token 計——非英語工作階段燒額度快 1.5–3 倍。關鍵是,**模型品質根本不是問題**:Claude 多語言基準 >90%。痛點純粹是成本。

| | 日語 | 韓語 | 俄語 | 印地語 | 中文 |
|---|---|---|---|---|---|
| 相對英文的 token 開銷 | ~2–3× | ~2–3×+ | ~1.5× | ~2–3×+ | ~2–3× |

Anthropic 關於按語言調整額度的 issue([#26401](https://github.com/anthropics/claude-code/issues/26401))已被關閉(*not planned*)——官方沒有解法。

**所以最省錢且正確的設計正是本工具的做法:** 工作階段全程保持英文(輸入、轉錄、模型上下文——主對話零額外 token),你的語言只出現在人需要讀的地方:每行英文下方一行僅作顯示的譯文,由獨立的低成本後端渲染。

完整調研資料與來源:[MOTIVATION.md](MOTIVATION.md)。

## ⚙️ 運作原理

利用 Claude Code 原生的 **`MessageDisplay` 鉤子**(v2.1.152+):它在每則助理訊息渲染時觸發,把完成的文字片段(`delta`)交給鉤子;鉤子回傳的 `displayContent` **只替換螢幕顯示**,不改變儲存的訊息。

```
Claude 串流輸出英文
        │  每完成一行/段觸發一次(stdin: turn_id/message_id/index/final/delta)
        ▼
  hook/message-display.js  ──►  src/interleave.js  ──►  src/translate.js
   (讀 delta、查開關)          (區分散文/程式碼/已是目標語言)    (多後端 + 快取)
        │
        ▼  回傳 displayContent = "英文行\n↳ 譯文行"
   Claude Code 就地替換顯示(原文仍在轉錄/上下文中)
```

> 已在 CC 2.1.169 實測:`delta` 是**互不重疊**的已完成片段(不是累積文字),普通 `\n` 即可讓兩種語言分行顯示,程式碼區塊/路徑/已是目標語言的行會自動跳過。

## 🎛 指令

| 指令 | 作用 |
|------|------|
| `cctrans on` / `cctrans off` / `cctrans toggle` | 開 / 關 / 切換翻譯 |
| `cctrans status` | 檢視狀態(開關、鉤子、後端、語言) |
| `cctrans lang [code]` | 檢視/切換目標語言:`zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` |
| `cctrans mode [line\|section]` | 排版:譯文跟在每行下方,或按區塊成組 |
| `cctrans backend <id>` | 切換翻譯引擎 |
| `cctrans backends` | 列出所有引擎及其可用性 |
| `cctrans setup` | 互動式精靈:語言、顯示模式、後端、API key |
| `cctrans key [id] [value]` | 管理 `~/.cc-translate/keys.json` 中的 API key |
| `cctrans input on` / `cctrans input off` | **(beta)** 把非英文輸入翻譯成英文(作為上下文傳給模型) |
| `cctrans input threshold <n>` | 觸發輸入翻譯的非拉丁字元數(預設 4) |
| `cctrans last [N]` | 把最近(或往前第 N 則)回覆翻譯到終端機 |
| `cctrans test <文字>` | 翻譯一段文字,驗證引擎 |
| `cctrans install` / `cctrans uninstall` | 註冊 / 移除鉤子 |

## 🧩 顯示模式

`line`(預設)逐行對照:每行英文下方一行譯文,隨回覆串流出現。`section` 讓英文完全按 Claude 的串流輸出原樣呈現,在**一個區塊完成時**插入一段成組譯文——對列表很多的回覆要安靜得多:

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
cctrans mode section   # 隨時切回:cctrans mode line
```

> section 模式下,一個區塊的譯文在**該區塊完成時**才出現,而不是邊串流邊出——後端慢時(如 `claude-code`,3–6 秒/次)這個停頓會比較明顯,所以這裡 API 後端體驗最好。某個區塊翻譯失敗時,英文不受影響,該區塊只是保持未翻譯。

## 🌐 翻譯後端

| 後端 | 前提 | 速度 | 品質 | 說明 |
|------|------|------|------|------|
| `openai`(有 key 時預設) | `cctrans key openai` | ~1.4s/段 | 高 | `gpt-4o-mini` 批次行翻譯,保留程式碼/路徑 |
| `anthropic` | `cctrans key anthropic` | ~1s/段 | 高 | `claude-haiku-4-5` + structured outputs,嚴格等長行陣列(約 $0.0005/段) |
| `deepl` | `cctrans key deepl`(免費額度 50 萬字元/月) | ~0.5s/段 | 高 | 傳統 MT 品質天花板;陣列介面天然對齊行 |
| `azure` | `cctrans key azure`(免費 200 萬字元/月) | ~0.5s/段 | 中高 | 可加 `cctrans key azure-region` |
| `google` | 無 | ~0.3s/段 | 中 | 免費非官方介面;**所有後端失敗時的保底** |
| `claude-code` | `claude` CLI 已登入 | ~3-6s/段 | 高 | 走你的 **Claude 訂閱**(`claude -p` headless),零額外費用但明顯較慢 |

主後端失敗/逾時會自動**降級到 google**,任何情況下都不會卡住工作階段。每行譯文按「後端+語言+內容」雜湊快取。

API key **只**存放在 `~/.cc-translate/keys.json`(chmod 600)——用 `cctrans setup` / `cctrans key` 設定,或直接編輯該檔案。終端機環境變數永遠不會被讀取,本工具的 key 與終端機的 key 互不污染。

其餘設定(後端、語言、標記、模型、Azure 端點)都在 `~/.cc-translate/state.json` 中——用 `cctrans` 指令修改或直接編輯檔案。

## 🗣 多語言

目標語言支援 **CJK + 俄語 + 印地語**(非拉丁文字,可按 Unicode 區間零成本判斷「該行已是目標語言」並跳過):

```bash
cctrans lang ja       # 日語
cctrans lang ko       # 韓語
cctrans lang ru       # 俄語
cctrans lang hi       # 印地語
cctrans lang zh-Hant  # 繁體中文
cctrans lang zh-Hans  # 簡體中文(預設)
```

中文採用 BCP-47 **文字碼**(`zh-Hans`/`zh-Hant`)——繁體是文字系統而非地區;`zh-CN` / `zh-TW` 仍可作為別名使用,會自動正規化。切換語言立即生效(鉤子每次呼叫都讀取狀態),不同語言的快取相互獨立。

## ⌨️ 輸入翻譯(beta)

`cctrans input on` 啟用 `UserPromptSubmit` 鉤子:當你的輸入包含足夠多的非拉丁字元時(預設 4 個以上——按絕對數量計,檔案路徑和識別字不會稀釋觸發條件;用 `cctrans input threshold <n>` 調整),英文譯文會作為上下文附給模型並被視為權威指令,同時要求模型**用英文回覆**——這樣雙語 overlay 持續生效,對話上下文全程保持英文。(已在 CC 2.1.169 核實:鉤子無法改寫 prompt 本身,所以原文仍在歷史中,英文隨附。)英文輸入原樣通過;任何錯誤都安全回退為原樣送出。

> **Beta**:翻譯呼叫會在每條非英文輸入送出前阻塞約 0.5–1.5 秒。預設關閉;setup 精靈會詢問一次。回饋 → [issues](https://github.com/roy-jiang-opus/cctrans/issues)。

## 📏 行為與限制(已核實)

- 鉤子在**串流輸出中**按片段觸發,每段單獨翻譯並就地替換——所以譯文會隨英文逐段出現。
- 鉤子有 **10 秒**逾時;本工具內部 9 秒保底。任何錯誤/逾時/超長(>9000 字元)都會**安全回退成原始英文**,絕不卡住工作階段。
- 每行譯文按內容雜湊**快取**(`~/.cc-translate/cache`),重繪與重複文字零成本。兩種模式共享同一快取。
- section 模式下,進行中區塊的文字會緩衝在 `~/.cc-translate/msgstate`(落盤暴露面與快取相同);訊息完成後該檔案即刪除,逾期殘留檔案 24 小時後清理。
- 用 `openai` 時每段約一次 API 呼叫(~$0.0001),串流輸出會比純英文多約 1 秒/段的延遲;`google` 較快但品質略低。

## 🔗 關注專案

- ⭐ **Star / Watch** [github.com/roy-jiang-opus/cctrans](https://github.com/roy-jiang-opus/cctrans),第一時間獲取版本更新
- 📦 **npm** —— [npmjs.com/package/cctrans](https://www.npmjs.com/package/cctrans) · 升級:`npm update -g cctrans`
- 🗺 **路線圖** —— [ROADMAP.md](ROADMAP.md):已完成與計劃中的功能
- 📚 **調研** —— [MOTIVATION.md](MOTIVATION.md):本專案背後的非英語 token 稅資料
- 🐛 **Issue / 新語言請求** —— [github.com/roy-jiang-opus/cctrans/issues](https://github.com/roy-jiang-opus/cctrans/issues)

## 📄 授權條款

[MIT](LICENSE) © Roy Jiang
