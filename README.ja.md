# terminal-translate

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | **日本語** | [한국어](README.ko.md) | [Русский](README.ru.md) | [हिन्दी](README.hi.md)

Claude Code に**バイリンガル表示**を追加:すべての返信で、元の英語行の下に訳文(中/日/韓/露/ヒンディー)が一行ずつ、**会話の中にそのまま**表示されます。

```
● I will refactor the auth module to use async tokens.
  ↳ auth モジュールを非同期トークンを使うようにリファクタリングします。
  This touches 3 files and adds a retry layer.
  ↳ これは 3 つのファイルに影響し、リトライ層を追加します。
```

- **非破壊**:画面に訳文が追加されるだけで、トランスクリプトとモデルのコンテキストは**純粋な英語のまま**——技術ドキュメント、skills、コードには一切影響しません。
- **履歴を汚さない・メインループのトークンを消費しない**:翻訳は**独立した低コストのバックエンド**で実行され、Claude Code セッションとは完全に無関係です。
- **ワンキーでオン/オフ**:デフォルトは常時オン;英語/コードだけ読みたいときはすぐオフにできます。

## 仕組み

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

## インストール

```bash
git clone git@github.com:roy-jiang-opus/cctranslate.git
cd cctranslate
node bin/tt.js install      # フックを ~/.claude/settings.json に登録し、tt を ~/.local/bin にリンク
```

その後 **Claude Code を再起動**(新セッション)してフックを読み込みます。メッセージを送ると、返信がバイリンガルになります。

> `~/.local/bin` が PATH に必要;なければエイリアスを:
> `alias tt='node /path/to/cctranslate/bin/tt.js'`

## 使い方

| コマンド | 動作 |
|----------|------|
| `tt on` / `tt off` / `tt toggle` | 翻訳のオン / オフ / 切替 |
| `tt status` | 状態表示(トグル、フック、バックエンド、言語) |
| `tt lang [code]` | 目標言語の表示/設定:`zh-Hans` `zh-Hant` `ja` `ko` `ru` `hi` |
| `tt backend <id>` | 翻訳エンジンの切替 |
| `tt backends` | 全エンジンと利用可否を一覧 |
| `tt last [N]` | 最新(または N 個前)の返信をターミナルに翻訳 |
| `tt test <テキスト>` | テキストを翻訳してエンジンを検証 |
| `tt install` / `tt uninstall` | フックの登録 / 削除 |

**最速のトグル**:Claude Code の入力欄に `!tt off` / `!tt on` と直接入力(`!` は CC 内蔵の bash モード——モデル呼び出しなし、トークン消費なし)。

## 翻訳バックエンド

| バックエンド | 前提 | 速度 | 品質 | 備考 |
|--------------|------|------|------|------|
| `openai`(キーがあればデフォルト) | `OPENAI_API_KEY` | ~1.4s/断片 | 高 | `gpt-4o-mini` の行バッチ翻訳、コード/パスを保持 |
| `anthropic` | `ANTHROPIC_API_KEY` | ~1s/断片 | 高 | `claude-haiku-4-5` + structured outputs、厳密な等長行配列(約 $0.0005/断片) |
| `deepl` | `DEEPL_API_KEY`(無料枠 50 万字/月) | ~0.5s/断片 | 高 | 従来型 MT の最高品質;配列 API で行が自然に揃う |
| `azure` | `AZURE_TRANSLATOR_KEY`(無料 200 万字/月) | ~0.5s/断片 | 中高 | `AZURE_TRANSLATOR_REGION` も指定可 |
| `google` | 不要 | ~0.3s/断片 | 中 | 無料の非公式エンドポイント;**全バックエンド失敗時のフォールバック** |
| `claude-code` | `claude` CLI ログイン済み | ~3-6s/断片 | 高 | あなたの **Claude サブスクリプション**で実行(`claude -p` headless)——追加費用ゼロだが明らかに遅い |

プライマリが失敗/タイムアウトすると自動的に **google にフォールバック**——セッションが止まることはありません。訳文は「バックエンド+言語+内容」のハッシュでキャッシュされます。

環境変数:`TT_BACKEND`、`TT_TARGET`(デフォルト `zh-Hans`)、`TT_MARKER`(デフォルト `↳ `)、`TT_HOME`(デフォルト `~/.cc-translate`)、`TT_OPENAI_MODEL`、`TT_ANTHROPIC_MODEL`、`AZURE_TRANSLATOR_ENDPOINT`。

## 多言語

目標言語は **CJK + ロシア語 + ヒンディー語**(非ラテン文字なので、Unicode 範囲により「この行は既に目標言語」をゼロコストで判定してスキップできます):

```bash
tt lang ja       # 日本語
tt lang ko       # 韓国語
tt lang ru       # ロシア語
tt lang hi       # ヒンディー語
tt lang zh-Hant  # 繁体字中国語
tt lang zh-Hans  # 簡体字中国語(デフォルト)
```

中国語は BCP-47 の**文字コード**(`zh-Hans`/`zh-Hant`)を採用——繁体字は地域ではなく文字体系です;`zh-CN` / `zh-TW` はエイリアスとして引き続き使え、自動的に正規化されます。言語切替は即座に有効(フックは呼び出しごとに状態を読む);言語ごとにキャッシュは独立しています。

## 動作と制限(検証済み)

- フックは**ストリーミング中**に断片ごとに発火し、断片ごとに翻訳してその場で置換——訳文は英語と並んで段階的に現れます。
- フックのタイムアウトは **10 秒**;本ツールは内部で 9 秒のガードを持ちます。エラー/タイムアウト/超過(>9,000 文字)はすべて**元の英語に安全にフォールバック**——セッションを止めることはありません。
- 訳文は内容ハッシュで**キャッシュ**(`~/.cc-translate/cache`);再描画や繰り返しテキストはコストゼロ。
- `openai` 使用時は断片ごとに約 1 回の API 呼び出し(~$0.0001)、純英語より約 1 秒/断片の遅延;`google` はより速いが品質はやや低め。

## アンインストール

```bash
node bin/tt.js uninstall    # フックを削除;Claude Code の再起動で反映
```
