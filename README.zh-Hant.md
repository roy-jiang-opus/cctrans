# cctranslate

[English](README.md) | [简体中文](README.zh-Hans.md) | **繁體中文** | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

為 Claude Code 加上一層**雙語對照**:每則回覆會在原始英文行下方自動補上一行譯文(中/日/韓/俄/印地),**就在對話裡**,一行英文一行譯文。

```
● I will refactor the auth module to use async tokens.
  ↳ 我將重構 auth 模組以使用非同步權杖。
  This touches 3 files and adds a retry layer.
  ↳ 這會影響 3 個檔案並加入重試層。
```

- **非破壞性**:畫面上多了譯文,但轉錄檔與模型看到的上下文**仍是純英文**——技術文件、skills、程式碼都不受影響。
- **不污染歷史、不耗主對話 token**:翻譯由一個**獨立的低成本後端**完成,與你的 Claude Code 工作階段完全無關。
- **一鍵開關**:預設常開;想讀純英文/程式碼時一鍵關閉。

## 運作原理

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

## 安裝

```bash
npm install -g cctrans && tt install

# from source:
git clone https://github.com/roy-jiang-opus/cctranslate.git
cd cctranslate
node bin/tt.js install      # 註冊鉤子、連結 tt 到 ~/.local/bin,然後執行 setup 精靈
```

接著**重新啟動 Claude Code**(開新工作階段)讓鉤子生效。送出任意訊息,回覆就會雙語對照。

> 需要 `~/.local/bin` 在 PATH 中;否則使用別名:
> `alias tt='node /path/to/cctranslate/bin/tt.js'`

## 使用

| 指令 | 作用 |
|------|------|
| `tt on` / `tt off` / `tt toggle` | 開 / 關 / 切換翻譯 |
| `tt status` | 檢視狀態(開關、鉤子、後端、語言) |
| `tt lang [code]` | 檢視/切換目標語言:`zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` |
| `tt backend <id>` | 切換翻譯引擎 |
| `tt backends` | 列出所有引擎及其可用性 |
| `tt setup` | 互動式精靈:語言、後端、API key |
| `tt key [id] [value]` | 管理 `~/.cc-translate/keys.json` 中的 API key |
| `tt input on` / `tt input off` | 把非英文輸入翻譯成英文(作為上下文傳給模型) |
| `tt last [N]` | 把最近(或往前第 N 則)回覆翻譯到終端機 |
| `tt test <文字>` | 翻譯一段文字,驗證引擎 |
| `tt install` / `tt uninstall` | 註冊 / 移除鉤子 |

**最快的開關方式**:在 Claude Code 輸入框直接輸入 `!tt off` 或 `!tt on`(`!` 是 CC 內建的 bash 模式,不呼叫模型、不花 token)。

## 翻譯後端

| 後端 | 前提 | 速度 | 品質 | 說明 |
|------|------|------|------|------|
| `openai`(有 key 時預設) | `tt key openai` | ~1.4s/段 | 高 | `gpt-4o-mini` 批次行翻譯,保留程式碼/路徑 |
| `anthropic` | `tt key anthropic` | ~1s/段 | 高 | `claude-haiku-4-5` + structured outputs,嚴格等長行陣列(約 $0.0005/段) |
| `deepl` | `tt key deepl`(免費額度 50 萬字元/月) | ~0.5s/段 | 高 | 傳統 MT 品質天花板;陣列介面天然對齊行 |
| `azure` | `tt key azure`(免費 200 萬字元/月) | ~0.5s/段 | 中高 | 可加 `tt key azure-region` |
| `google` | 無 | ~0.3s/段 | 中 | 免費非官方介面;**所有後端失敗時的保底** |
| `claude-code` | `claude` CLI 已登入 | ~3-6s/段 | 高 | 走你的 **Claude 訂閱**(`claude -p` headless),零額外費用但明顯較慢 |

主後端失敗/逾時會自動**降級到 google**,任何情況下都不會卡住工作階段。每行譯文按「後端+語言+內容」雜湊快取。

API key **只**存放在 `~/.cc-translate/keys.json`(chmod 600)——用 `tt setup` / `tt key` 設定,或直接編輯該檔案。終端機環境變數永遠不會被讀取,本工具的 key 與終端機的 key 互不污染。

其餘設定(後端、語言、標記、模型、Azure 端點)都在 `~/.cc-translate/state.json` 中——用 `tt` 指令修改或直接編輯檔案。

## 多語言

目標語言支援 **CJK + 俄語 + 印地語**(非拉丁文字,可按 Unicode 區間零成本判斷「該行已是目標語言」並跳過):

```bash
tt lang ja       # 日語
tt lang ko       # 韓語
tt lang ru       # 俄語
tt lang hi       # 印地語
tt lang zh-Hant  # 繁體中文
tt lang zh-Hans  # 簡體中文(預設)
```

中文採用 BCP-47 **文字碼**(`zh-Hans`/`zh-Hant`)——繁體是文字系統而非地區;`zh-CN` / `zh-TW` 仍可作為別名使用,會自動正規化。切換語言立即生效(鉤子每次呼叫都讀取狀態),不同語言的快取相互獨立。

## 輸入翻譯

`tt input on` 啟用 `UserPromptSubmit` 鉤子:當你的輸入大多是非英文時,英文譯文會作為上下文附給模型並被視為權威指令——你繼續用母語打字,模型按英文工作。(已在 CC 2.1.169 核實:鉤子無法改寫 prompt 本身,所以原文仍在歷史中,英文隨附。)英文輸入原樣通過;任何錯誤都安全回退為原樣送出。

## 行為與限制(已核實)

- 鉤子在**串流輸出中**按片段觸發,每段單獨翻譯並就地替換——所以譯文會隨英文逐段出現。
- 鉤子有 **10 秒**逾時;本工具內部 9 秒保底。任何錯誤/逾時/超長(>9000 字元)都會**安全回退成原始英文**,絕不卡住工作階段。
- 每行譯文按內容雜湊**快取**(`~/.cc-translate/cache`),重繪與重複文字零成本。
- 用 `openai` 時每段約一次 API 呼叫(~$0.0001),串流輸出會比純英文多約 1 秒/段的延遲;`google` 較快但品質略低。

## 解除安裝

```bash
node bin/tt.js uninstall    # 移除鉤子;重新啟動 Claude Code 生效
```
