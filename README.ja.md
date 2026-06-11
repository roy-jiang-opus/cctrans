<div align="center">

# cctrans

**トークンを最大 67% 節約：Claude Code を母語で、課金は 100% 英語のまま。**

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

Claude Code の**バイリンガル表示オーバーレイ**:各英語行の下に訳文(中/日/韓/露/ヒンディー/スペイン/ポルトガル/フランス/ドイツ)が一行ずつ、**会話の中にそのまま**表示されます——表示のみなので、トランスクリプト、モデルのコンテキスト、トークン請求は 100% 英語のままです。

## ✨ 特長

- 🪞 **インラインのバイリンガル表示** —— 訳文は返信のストリーミングと共に各英語行の下に現れます
- 🧩 **3 つのレイアウト** —— 行ごとのインターリーブ、ブロックごと(`cctrans mode section`)、または返信全体(`cctrans mode message`)
- 🔄 **追記または置換** —— 訳文を英語の下に表示するか、`cctrans display replace` でその場に訳文だけを表示
- ❓ **質問ダイアログの翻訳** —— Claude Code のインタラクティブな質問プロンプトもあなたの言語で表示されます。一方でモデルが読むのは英語の回答のまま
- 🧾 **非破壊** —— トランスクリプトとモデルコンテキストは純粋な英語のまま;skills、ドキュメント、コードに影響なし
- 🆓 **メインループのトークン消費ゼロ** —— 翻訳は独立した安価な(無料もある)バックエンドで実行、Claude Code セッションの完全に外側
- ⌨️ **入力翻訳(beta)** —— 母語で入力し、モデルは英語で動き、英語で返信する(`cctrans input on`)
- 🌏 **10 の目標言語** —— `zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` `es` `pt` `fr` `de`
- 🔌 **6 つのバックエンド + 自動フォールバック** —— OpenAI / Anthropic / DeepL / Azure / 無料 Google / あなたの Claude サブスクリプション
- 📁 **プロジェクト単位のオーバーライド** —— リポジトリに `.cc-translate.json` を置くと、そのプロジェクトだけ言語/モードを切替(または無効化)
- 🔒 **キーの隔離** —— API キーは chmod-600 のファイルのみ;シェル環境変数は一切読まない
- 🛟 **フェイルセーフ** —— どんなエラーやタイムアウトも英語のみ表示にフォールバック;セッションを止めない
- 🩺 **内蔵の診断機能** —— `cctrans doctor` が「なぜ何も翻訳されないか」を説明し、`cctrans stats` が節約したトークンを表示
- 🎚️ **対話的な設定** —— `cctrans settings` が単一画面のエディタを開きます(矢印キー操作)。間隔、マーカー、モデルなどを調整、基本 + 詳細

## 🚀 クイックスタート

```bash
npm install -g cctrans@latest && cctrans install
```

インストールがフックを登録し、対話的な設定エディタを開きます(言語、表示モード、バックエンド、API キー——`cctrans settings` でいつでも再び開けます)。その後 **Claude Code を再起動**——返信がバイリンガルになります。Claude Code の入力欄に `!cctrans off` / `!cctrans on` と打てばいつでも切替(`!` は CC 内蔵の bash モード——モデル呼び出しなし、トークン消費なし)。

**すでにインストール済み?** `npm install -g cctrans@latest` で更新——次の返信から反映されます(フックはチャンクごとに毎回ディスクから実行されます)。設定、キー、登録済みフックはそのまま、再セットアップは不要です。

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
| `cctrans lang [code]` | 目標言語の表示/設定:`zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` `es` `pt` `fr` `de` |
| `cctrans mode [line\|section\|message]` | レイアウト:行ごと、ブロックごと、または返信全体 |
| `cctrans display [append\|replace]` | 訳文を英語の下に表示、またはその代わりに表示(line モード) |
| `cctrans only [on\|off]` | 訳文**のみ**を表示し、英語を隠す(line モード + replace) |
| `cctrans dialog [on\|off]` | Claude Code の質問ダイアログを翻訳(デフォルトでオン) |
| `cctrans settings` | 対話的な設定エディタを開く(基本 + 詳細) |
| `cctrans backend <id>` | 翻訳エンジンの切替 |
| `cctrans backends` | 全エンジンと利用可否を一覧 |
| `cctrans doctor` | 診断:フック、Claude Code バージョン、バックエンド、キー、直近のフックエラー |
| `cctrans stats` | 翻訳した行数 + 節約できたメインループトークンの推定値 |
| `cctrans cache [clear\|gc]` | 翻訳キャッシュのサイズ表示 / クリア / サイズ上限の適用 |
| `cctrans setup` | 対話式ウィザード:言語、表示モード、バックエンド、API キー |
| `cctrans key [id] [value]` | `~/.cc-translate/keys.json` の API キーを管理 |
| `cctrans input on` / `cctrans input off` | **(beta)** 非英語の入力を英語に翻訳(コンテキストとして送信) |
| `cctrans input threshold <n>` | 入力翻訳を発火させる非ラテン文字数(デフォルト 4) |
| `cctrans last [N]` | 最新(または N 個前)の返信をターミナルに翻訳 |
| `cctrans test <テキスト>` | テキストを翻訳してエンジンを検証 |
| `cctrans install` / `cctrans uninstall` | フックの登録 / 削除 |

## 🧩 表示モード

`line`(デフォルト)はインターリーブ:各英語行の下に訳文行が一行ずつ、返信のストリーミングと共に表示されます。`section` は Claude のストリーミングどおりに英語をそのまま保ち、**ブロック完成時にまとめた訳文を 1 回**差し込みます——リストの多い返信ではずっと静かになります。`message` はさらにその先へ:返信全体が素の英語のままストリーミングされ、**まとめた訳文が一番最後に 1 回**届きます:

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
cctrans mode section   # ブロックごと · cctrans mode message —— 返信全体 · cctrans mode line —— デフォルトに戻す
```

> section/message モードでは訳文は**そのブロック(または返信)の完成時**に表示され、ストリーミング中には現れません——遅いバックエンド(例:`claude-code`、3–6 秒/呼び出し)ではその間が目立つため、ここでは API バックエンドが最適です。ブロックの翻訳が失敗しても英語は影響を受けず、そのブロックが未翻訳のまま残るだけです。

**追記または置換。** デフォルトでは訳文は英語の*下*に表示されます(バイリンガル)。自分の言語だけを読みたいですか?`cctrans display replace` を使うと、各英語行の**代わりに**訳文が表示されます:

```bash
cctrans display replace   # 訳文のみ · cctrans display append —— バイリンガルに戻す
```

置換が有効になるのは **line モード**です(section/message は設計上まず英語をストリーミングするため、置き換える対象がありません)。どちらの場合もトランスクリプトとモデルのコンテキストは 100% 英語のまま保たれます;翻訳できない行は元のテキストを保持するため、何も消えることはありません。

**英語はいっさい不要で、自分の言語だけがいいですか?** `cctrans only on` はまさにそのためのワンコマンドのショートカットです(line モード + replace を設定します)。英語は一瞬たりとも現れません —— Claude Code は各行を翻訳済みの状態で描画します —— そして翻訳できなかった行はその英語にフォールバックします;コードブロックはそのまま通過します。`cctrans only off` でバイリンガルに戻ります。

## ❓ 質問ダイアログ

Claude Code が選択肢から選ぶよう求めてくるとき(インタラクティブな質問ダイアログ)、質問・各選択肢のラベル・その説明もあなたの言語で表示されます——そして選んだ回答は**英語**のままモデルに届くため、モデルの推論は英語のみで保たれます:

```
 ☐ 颜色偏好
Which color do you prefer?
↳ 您更喜欢哪种颜色？
❯ 1. Red
     ↳ 红色
     A bold, vibrant color
     ↳ 大胆、鲜艳的颜色
   2. Blue
     ↳ 蓝色
```

これは Claude Code の `PreToolUse`/`PostToolUse` フックに乗っています(質問ダイアログはツール入力からレンダリングされ、メッセージオーバーレイでは届かないためです)。あなたの `display` 設定に従います——append モードではバイリンガル、replace モードではあなたの言語のみ。デフォルトでオン;`cctrans dialog off` でオフにできます。ダイアログを間に合うように翻訳できない場合は、そのまま英語で表示されます。

> **アップグレード?** 更新後に一度 `cctrans install` を実行して新しいダイアログフックを登録してください。回答の復元(モデルの回答を英語に保つこと)には Claude Code ≥ 2.1.121 が必要です——`cctrans doctor` が古いバージョンで警告します。

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

```bash
cctrans lang zh-Hans  # 簡体字中国語(デフォルト)    cctrans lang zh-Hant  # 繁体字中国語
cctrans lang ja       # 日本語                        cctrans lang ko       # 韓国語
cctrans lang ru       # ロシア語                      cctrans lang hi       # ヒンディー語
cctrans lang es       # スペイン語                    cctrans lang pt       # ポルトガル語
cctrans lang fr       # フランス語                    cctrans lang de       # ドイツ語
```

**CJK + ロシア語 + ヒンディー語**(非ラテン文字)では、「この行は既に目標言語」を Unicode 範囲によりゼロコストで判定してスキップします。**スペイン語 / ポルトガル語 / フランス語 / ドイツ語**(ラテン文字)では、代わりに保守的なストップワードヒューリスティックで判定します——仮に既に目標言語の行が再翻訳されても、同一性チェックが「おうむ返し」を抑制するため、最悪でもバックエンド呼び出しが 1 回無駄になるだけで、誤った行が出ることはありません。なお、ラテン文字の言語ではトークン節約効果は小さめです(英語比 ~1.1–1.2×、非ラテンの 1.5–3× に対して——[MOTIVATION.md](MOTIVATION.md) 参照);これらの言語での魅力はバイリンガル表示そのものです。

中国語は BCP-47 の**文字コード**(`zh-Hans`/`zh-Hant`)を採用——繁体字は地域ではなく文字体系です;`zh-CN` / `zh-TW` はエイリアスとして引き続き使え、自動的に正規化されます。言語切替は即座に有効(フックは呼び出しごとに状態を読む);言語ごとにキャッシュは独立しています。

## 📁 プロジェクト単位のオーバーライド

リポジトリのルート(作業ディレクトリの任意の親ディレクトリでも可)に `.cc-translate.json` を置くと、そのプロジェクトだけグローバル設定を上書きできます:

```json
{ "target": "ja", "mode": "section" }
```

または `{ "enabled": false }` で特定のプロジェクトだけオーバーレイを無効化できます。上書き可能なフィールド:`enabled`、`target`、`mode`、`backend`、`marker`、`model`、`inputEn`、`inputMinChars`。シークレットは上書き不可——キーは `~/.cc-translate/keys.json` のままで、エンドポイント設定も設計上グローバル専用です。プロジェクト内で実行した `cctrans status` と `cctrans doctor` は、どちらもプロジェクトオーバーライドが有効であることを表示します。クローンしたリポジトリの `.cc-translate.json` はそのコードの一部として扱ってください:たとえば、そのリポジトリでの作業に使うバックエンドを(サブスクリプションを消費する `claude-code` も含めて)切り替えられます。

## 🩺 トラブルシューティング

このオーバーレイは設計上フェイルセーフです:あらゆるエラーはセッションをブロックせず、素の英語表示に退化します——裏を返せば、失敗は**無音**だということです。何も翻訳されないときは:

```bash
cctrans doctor
```

が、フックの登録状況(旧インストールの古いパスを含む)、Claude Code のバージョン(MessageDisplay には 2.1.152 以上が必要)、設定中のバックエンドとそのキー、実際の接続性(レイテンシ付き)、そして**直近のフックエラー**(ストリーミング途中で失敗するとフックが `~/.cc-translate/last-error.json` に記録)をチェックします。オーバーレイがこれまで何をしてくれたかを見るには:

```bash
cctrans stats    # 翻訳した行数 + 節約できたメインループトークンの推定値
cctrans cache    # 翻訳キャッシュのサイズ;clear / gc で管理(デフォルト上限 200 MB)
```

## ⌨️ 入力翻訳(beta)

`cctrans input on` で `UserPromptSubmit` フックが有効になります:入力に十分な非ラテン文字が含まれる場合(デフォルト 4 文字以上——絶対数で判定するため、ファイルパスや識別子が発火条件を薄めることはありません;`cctrans input threshold <n>` で調整可)、英語訳がコンテキストとしてモデルに添付されて正規の指示として扱われ、さらにモデルに**英語で返信する**よう指示します——これによりバイリンガルオーバーレイが機能し続け、会話コンテキストは終始英語のままです。(CC 2.1.169 で検証済み:フックは prompt 自体を書き換えられないため、原文は履歴に残り英語が併記されます。)英語の入力はそのまま通過;エラー時は安全にそのまま送信されます。

> **Beta**:翻訳呼び出しにより非英語プロンプトの送信ごとに約 0.5–1.5 秒ブロックされます。デフォルトはオフ;setup ウィザードが一度だけ確認します。フィードバック → [issues](https://github.com/roy-jiang-opus/cctrans/issues)

## 📏 動作と制限(検証済み)

- フックは**ストリーミング中**に断片ごとに発火し、断片ごとに翻訳してその場で置換——訳文は英語と並んで段階的に現れます。
- フックのタイムアウトは **10 秒**;本ツールは内部で 9 秒のガードを持ちます。エラー/タイムアウト/超過(>9,000 文字)はすべて**元の英語に安全にフォールバック**——セッションを止めることはありません。
- 訳文は内容ハッシュで**キャッシュ**(`~/.cc-translate/cache`、200 MB の上限を毎日適用);再描画や繰り返しテキストはコストゼロ。キャッシュは全モードで共有されます。
- section/message モードでは処理中のブロックのテキストが `~/.cc-translate/msgstate` にバッファされます(保存時の露出はキャッシュと同等);ファイルはメッセージ完了時に削除され、古いものは 24 時間後に掃除されます。
- `openai` 使用時は断片ごとに約 1 回の API 呼び出し(~$0.0001)、純英語より約 1 秒/断片の遅延;`google` はより速いが品質はやや低め。
- **Markdown テーブル**はそのまま保たれます:テーブルは無加工でパススルーされ(Claude Code ネイティブの罫線レンダリングが保たれます)、その直後に翻訳済みのテーブルのコピーが表示されます——インターリーブされた訳文で行が分断されることはもうありません。

## 🔗 プロジェクトをフォロー

- ⭐ **Star / Watch** [github.com/roy-jiang-opus/cctrans](https://github.com/roy-jiang-opus/cctrans) でリリース更新を受け取る
- 📦 **npm** —— [npmjs.com/package/cctrans](https://www.npmjs.com/package/cctrans) · アップグレード:`npm install -g cctrans@latest`
- 🗺 **ロードマップ** —— [ROADMAP.md](ROADMAP.md):実装済みと予定の機能
- 📚 **調査資料** —— [MOTIVATION.md](MOTIVATION.md):このプロジェクトの背景にある非英語トークン税のデータ
- 🐛 **Issue / 言語リクエスト** —— [github.com/roy-jiang-opus/cctrans/issues](https://github.com/roy-jiang-opus/cctrans/issues)

## 📄 ライセンス

[MIT](LICENSE) © Roy Jiang
