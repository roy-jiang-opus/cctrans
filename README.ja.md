<div align="center">

# cctrans

**Claude Code を母語で読む——トークンは英語価格のまま。**

[![npm version](https://img.shields.io/npm/v/cctrans?color=cb3837&logo=npm)](https://www.npmjs.com/package/cctrans)
[![npm downloads](https://img.shields.io/npm/dm/cctrans?color=blue)](https://www.npmjs.com/package/cctrans)
[![GitHub stars](https://img.shields.io/github/stars/roy-jiang-opus/cctrans?style=flat&logo=github)](https://github.com/roy-jiang-opus/cctrans)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![node](https://img.shields.io/node/v/cctrans)](package.json)

[English](README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | **日本語** | [한국어](README.ko.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

</div>

---

```
● I will refactor the auth module to use async tokens.
  ↳ auth モジュールを非同期トークンを使うようにリファクタリングします。
  This touches 3 files and adds a retry layer.
  ↳ これは 3 つのファイルに影響し、リトライ層を追加します。
```

Claude Code の**バイリンガル表示オーバーレイ**:各英語行の下に訳文(中/日/韓/露/ヒンディー)が一行ずつ、**会話の中にそのまま**表示されます——表示のみなので、トランスクリプト、モデルのコンテキスト、トークン請求は 100% 英語のままです。

## ✨ 特長

- 🪞 **インラインのバイリンガル表示** —— 訳文は返信のストリーミングと共に各英語行の下に現れます
- 🧩 **2 つのレイアウト** —— 行ごとのインターリーブ、または `cctrans mode section`:英語ブロック全体を先に表示し、その後にまとめた訳文を表示
- 🧾 **非破壊** —— トランスクリプトとモデルコンテキストは純粋な英語のまま;skills、ドキュメント、コードに影響なし
- 🆓 **メインループのトークン消費ゼロ** —— 翻訳は独立した安価な(無料もある)バックエンドで実行、Claude Code セッションの完全に外側
- ⌨️ **入力翻訳(beta)** —— 母語で入力し、モデルは英語で動き、英語で返信する(`cctrans input on`)
- 🌏 **6 つの目標言語** —— `zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi`
- 🔌 **6 つのバックエンド + 自動フォールバック** —— OpenAI / Anthropic / DeepL / Azure / 無料 Google / あなたの Claude サブスクリプション
- 🔒 **キーの隔離** —— API キーは chmod-600 のファイルのみ;シェル環境変数は一切読まない
- 🛟 **フェイルセーフ** —— どんなエラーやタイムアウトも英語のみ表示にフォールバック;セッションを止めない

## 🚀 クイックスタート

```bash
npm install -g cctrans && cctrans install
```

インストールがフックを登録し、セットアップを案内します(言語 → バックエンド → API キー → 即時検証)。その後 **Claude Code を再起動**——返信がバイリンガルになります。Claude Code の入力欄に `!cctrans off` / `!cctrans on` と打てばいつでも切替(`!` は CC 内蔵の bash モード——モデル呼び出しなし、トークン消費なし)。

<details>
<summary>ソースからインストール</summary>

```bash
git clone https://github.com/roy-jiang-opus/cctrans.git
cd cctrans
node bin/cctrans.js install
```

`~/.local/bin` が PATH に必要、またはエイリアスを:`alias cctrans='node /path/to/cctrans/bin/cctrans.js'`

</details>

## 🤔 なぜ作ったか

2 つの課題を 1 つのアーキテクチャで解決します:

**1. Claude Code は英語で返答しがち。** Skills とドキュメントは英語のままにする必要があり、CLAUDE.md に「日本語で返答」と書いても返答は英語に戻りがちです。「日本語で」と打ち直して再回答させると、モデル呼び出しを丸ごと 1 回消費し、会話履歴も汚れます。

**2. 母語で作業すると隠れた「トークン税」がかかる——特に Claude では。** 同じ意味を表現するのに英語より **約 1.5–3 倍のトークン**がかかります(Claude のトークナイザは非ラテン文字の圧縮が苦手)。Claude Code の 5 時間ウィンドウと週次上限はトークンで計測されるため、非英語セッションはプランを 1.5–3 倍速く消費します。重要なのは、**回答品質は問題ではない**こと:Claude は多言語ベンチマークで 90% 超。痛みは純粋にコストです。

| | 日本語 | 韓国語 | ロシア語 | ヒンディー語 | 中国語 |
|---|---|---|---|---|---|
| 英語比のトークンコスト | ~2–3× | ~2–3×+ | ~1.5× | ~2–3×+ | ~2–3× |

言語別の上限調整を求める Anthropic の issue([#26401](https://github.com/anthropics/claude-code/issues/26401))は *not planned* でクローズ——公式の救済はありません。

**だから最も安価で正しい設計は、まさにこのツールの方式:** セッションは端から端まで英語のまま(プロンプト、トランスクリプト、モデルコンテキスト——メインループの追加トークンはゼロ)、あなたの言語は人間が読む場所にだけ存在します:各英語行の下の表示専用の訳文行を、独立した安価なバックエンドが描画します。

出典付きの完全な調査ノート:[MOTIVATION.md](MOTIVATION.md)。

## ⚙️ 仕組み

Claude Code ネイティブの **`MessageDisplay` フック**(v2.1.152+)を利用:アシスタントメッセージのレンダリング時に発火し、完成したテキスト断片(`delta`)をフックに渡します。フックが返す `displayContent` は**画面表示のみを置き換え**、保存されたメッセージは変更しません。

```
Claude が英語をストリーミング出力
        │  断片完成ごとに発火(stdin: turn_id/message_id/index/final/delta)
        ▼
  hook/message-display.js  ──►  src/interleave.js  ──►  src/translate.js
   (delta 読取・トグル確認)     (散文/コード/既に目標言語を判別)   (マルチバックエンド + キャッシュ)
        │
        ▼  displayContent = "英語行\n↳ 訳文行" を返す
   Claude Code がその場で表示を置換(原文はトランスクリプト/コンテキストに残る)
```

> CC 2.1.169 で実測済み:`delta` は**重複しない**完成済み断片(累積テキストではない)、通常の `\n` で 2 言語が別行に表示され、コードブロック/パス/既に目標言語の行は自動スキップされます。

## 🎛 コマンド

| コマンド | 動作 |
|----------|------|
| `cctrans on` / `cctrans off` / `cctrans toggle` | 翻訳のオン / オフ / 切替 |
| `cctrans status` | 状態表示(トグル、フック、バックエンド、言語) |
| `cctrans lang [code]` | 目標言語の表示/設定:`zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` |
| `cctrans mode [line\|section]` | レイアウト:各行の下に訳文、またはブロックごとにまとめて |
| `cctrans backend <id>` | 翻訳エンジンの切替 |
| `cctrans backends` | 全エンジンと利用可否を一覧 |
| `cctrans setup` | 対話式ウィザード:言語、表示モード、バックエンド、API キー |
| `cctrans key [id] [value]` | `~/.cc-translate/keys.json` の API キーを管理 |
| `cctrans input on` / `cctrans input off` | **(beta)** 非英語の入力を英語に翻訳(コンテキストとして送信) |
| `cctrans input threshold <n>` | 入力翻訳を発火させる非ラテン文字数(デフォルト 4) |
| `cctrans last [N]` | 最新(または N 個前)の返信をターミナルに翻訳 |
| `cctrans test <テキスト>` | テキストを翻訳してエンジンを検証 |
| `cctrans install` / `cctrans uninstall` | フックの登録 / 削除 |

## 🧩 表示モード

`line`(デフォルト)はインターリーブ:各英語行の下に訳文行が一行ずつ、返信のストリーミングと共に表示されます。`section` は Claude のストリーミングどおりに英語をそのまま保ち、**ブロック完成時にまとめた訳文を 1 回**差し込みます——リストの多い返信ではずっと静かになります:

```
Use these flags:
↳ 以下のフラグを使用してください:

- Enable the cache
- Set a small timeout
- Prefer the batch API
  ↳ キャッシュを有効にする
  ↳ 短めのタイムアウトを設定する
  ↳ バッチ API を優先する
```

```bash
cctrans mode section   # いつでも戻せる:cctrans mode line
```

> section モードではブロックの訳文は**ブロック完成時**に表示され、ストリーミング中には現れません——遅いバックエンド(例:`claude-code`、3–6 秒/呼び出し)ではその間が目立つため、ここでは API バックエンドが最適です。ブロックの翻訳が失敗しても英語は影響を受けず、そのブロックが未翻訳のまま残るだけです。

## 🌐 翻訳バックエンド

| バックエンド | 前提 | 速度 | 品質 | 備考 |
|--------------|------|------|------|------|
| `openai`(キーがあればデフォルト) | `cctrans key openai` | ~1.4s/断片 | 高 | `gpt-4o-mini` の行バッチ翻訳、コード/パスを保持 |
| `anthropic` | `cctrans key anthropic` | ~1s/断片 | 高 | `claude-haiku-4-5` + structured outputs、厳密な等長行配列(約 $0.0005/断片) |
| `deepl` | `cctrans key deepl`(無料枠 50 万字/月) | ~0.5s/断片 | 高 | 従来型 MT の最高品質;配列 API で行が自然に揃う |
| `azure` | `cctrans key azure`(無料 200 万字/月) | ~0.5s/断片 | 中高 | `cctrans key azure-region` も指定可 |
| `google` | 不要 | ~0.3s/断片 | 中 | 無料の非公式エンドポイント;**全バックエンド失敗時のフォールバック** |
| `claude-code` | `claude` CLI ログイン済み | ~3-6s/断片 | 高 | あなたの **Claude サブスクリプション**で実行(`claude -p` headless)——追加費用ゼロだが明らかに遅い |

プライマリが失敗/タイムアウトすると自動的に **google にフォールバック**——セッションが止まることはありません。訳文は「バックエンド+言語+内容」のハッシュでキャッシュされます。

API キーは `~/.cc-translate/keys.json`(chmod 600)**のみ**に保存されます——`cctrans setup` / `cctrans key` で設定するか、ファイルを直接編集してください。シェルの環境変数は一切読み取られないため、このツールのキーとターミナルのキーが互いに汚染されることはありません。

その他の設定(バックエンド、言語、マーカー、モデル、Azure エンドポイント)は `~/.cc-translate/state.json` にあります——`cctrans` コマンドで変更するか、ファイルを直接編集してください。

## 🗣 多言語

目標言語は **CJK + ロシア語 + ヒンディー語**(非ラテン文字なので、Unicode 範囲により「この行は既に目標言語」をゼロコストで判定してスキップできます):

```bash
cctrans lang ja       # 日本語
cctrans lang ko       # 韓国語
cctrans lang ru       # ロシア語
cctrans lang hi       # ヒンディー語
cctrans lang zh-Hant  # 繁体字中国語
cctrans lang zh-Hans  # 簡体字中国語(デフォルト)
```

中国語は BCP-47 の**文字コード**(`zh-Hans`/`zh-Hant`)を採用——繁体字は地域ではなく文字体系です;`zh-CN` / `zh-TW` はエイリアスとして引き続き使え、自動的に正規化されます。言語切替は即座に有効(フックは呼び出しごとに状態を読む);言語ごとにキャッシュは独立しています。

## ⌨️ 入力翻訳(beta)

`cctrans input on` で `UserPromptSubmit` フックが有効になります:入力に十分な非ラテン文字が含まれる場合(デフォルト 4 文字以上——絶対数で判定するため、ファイルパスや識別子が発火条件を薄めることはありません;`cctrans input threshold <n>` で調整可)、英語訳がコンテキストとしてモデルに添付されて正規の指示として扱われ、さらにモデルに**英語で返信する**よう指示します——これによりバイリンガルオーバーレイが機能し続け、会話コンテキストは終始英語のままです。(CC 2.1.169 で検証済み:フックは prompt 自体を書き換えられないため、原文は履歴に残り英語が併記されます。)英語の入力はそのまま通過;エラー時は安全にそのまま送信されます。

> **Beta**:翻訳呼び出しにより非英語プロンプトの送信ごとに約 0.5–1.5 秒ブロックされます。デフォルトはオフ;setup ウィザードが一度だけ確認します。フィードバック → [issues](https://github.com/roy-jiang-opus/cctrans/issues)

## 📏 動作と制限(検証済み)

- フックは**ストリーミング中**に断片ごとに発火し、断片ごとに翻訳してその場で置換——訳文は英語と並んで段階的に現れます。
- フックのタイムアウトは **10 秒**;本ツールは内部で 9 秒のガードを持ちます。エラー/タイムアウト/超過(>9,000 文字)はすべて**元の英語に安全にフォールバック**——セッションを止めることはありません。
- 訳文は内容ハッシュで**キャッシュ**(`~/.cc-translate/cache`);再描画や繰り返しテキストはコストゼロ。キャッシュは両モードで共有されます。
- section モードでは処理中のブロックのテキストが `~/.cc-translate/msgstate` にバッファされます(保存時の露出はキャッシュと同等);ファイルはメッセージ完了時に削除され、古いものは 24 時間後に掃除されます。
- `openai` 使用時は断片ごとに約 1 回の API 呼び出し(~$0.0001)、純英語より約 1 秒/断片の遅延;`google` はより速いが品質はやや低め。

## 🔗 プロジェクトをフォロー

- ⭐ **Star / Watch** [github.com/roy-jiang-opus/cctrans](https://github.com/roy-jiang-opus/cctrans) でリリース更新を受け取る
- 📦 **npm** —— [npmjs.com/package/cctrans](https://www.npmjs.com/package/cctrans) · アップグレード:`npm update -g cctrans`
- 🗺 **ロードマップ** —— [ROADMAP.md](ROADMAP.md):実装済みと予定の機能
- 📚 **調査資料** —— [MOTIVATION.md](MOTIVATION.md):このプロジェクトの背景にある非英語トークン税のデータ
- 🐛 **Issue / 言語リクエスト** —— [github.com/roy-jiang-opus/cctrans/issues](https://github.com/roy-jiang-opus/cctrans/issues)

## 📄 ライセンス

[MIT](LICENSE) © Roy Jiang
