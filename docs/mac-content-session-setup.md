# Mac で SRS コンテンツ作成セッションを始める手順

**目的**: 別端末（Mac）の Claude Code セッションで、このリポジトリを読み込みながら
「教材 → ノートタイプ + カードテンプレート HTML/CSS + CSV」を生成する作業を行う。

**想定シナリオ**: Windows 側で開発、Mac 側ではコンテンツ作成のみ。
`.env.local` も `npm install` も不要の最小構成。

---

## 前提

- Mac（Apple Silicon / Intel どちらも可、macOS 12 以上推奨）
- インターネット接続
- Anthropic アカウント（Claude Code 用）
- GitHub アカウント `kanada4310`（または readアクセス権のあるアカウント）

---

## ステップ1: 必要ツールのインストール

ターミナル（`/Applications/Utilities/Terminal.app` または iTerm）で実行：

```bash
# Homebrew（未インストールなら）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 必要ツール一括インストール
brew install git gh node

# Claude Code CLI
npm install -g @anthropic-ai/claude-code
```

インストール確認：
```bash
git --version && gh --version && node --version && claude --version
```

全て表示されれば OK。

---

## ステップ2: 初回ログイン（それぞれ1回だけ）

### GitHub にログイン
```bash
gh auth login
```

対話形式で以下を選択：
- `GitHub.com`
- `HTTPS`
- `Authenticate Git with your GitHub credentials? → Yes`
- `Login with a web browser`
- 表示されるデバイスコードを控えてブラウザで認証

Windows 側と同じアカウント（`kanada4310`）を使うこと。

### Claude Code にログイン
```bash
claude
```

起動時にブラウザで Anthropic 認証を求められるので完了させる。
認証後は一度 `Ctrl+C` で抜けてよい。

---

## ステップ3: リポジトリをクローン

任意のディレクトリに clone（例: `~/dev/SRS`）：

```bash
mkdir -p ~/dev
cd ~/dev
git clone https://github.com/kanada4310/swallow-srs.git SRS
cd SRS
```

これで `CLAUDE.md` / `docs/` / `src/` 全てが読める状態になる。
`.env.local` は `.gitignore` に入っているため clone されない（今回の用途では不要）。

---

## ステップ4: Claude Code を起動してコンテンツ作成

```bash
cd ~/dev/SRS
git pull                  # ★作業前は必ず最新化
claude
```

起動したら、次のテンプレートでプロンプトを投げる：

```
docs/content-creation-spec.md を読んでください。
以下の教材から、つばめSRS にインポートするための
1. ノートタイプ定義（notetype.json）
2. カードテンプレート HTML/CSS
3. インポート用 CSV（UTF-8 BOM + CRLF）
を data/<適切なデッキ名>/ に出力してください。

【教材】
[ここに教材テキスト or 画像を貼り付け]

【出力したい形】
- 対象学年: [例: 高校3年]
- カード表に出すもの: [例: 英単語のみ]
- カード裏に出すもの: [例: 和訳 + 例文 + 音声ボタン]
- フィールド構成の希望: [例: Word / Meaning / Example]
- 特殊要件: [例: TTS は Word に、Cloze は使わない]
- カード枚数: [例: 1ノート = 表面英→和 のみ、リバース不要]

既存の動詞の語法デッキ（data/import-verb-deck.mjs）のスタイルも参考にしてOK。
```

Claude Code が `docs/content-creation-spec.md` を読み、仕様に沿った
ファイル一式を `data/<deckName>/` に生成してくれる。

---

## ステップ5: 生成物を Web UI 経由でアプリに取り込む

ブラウザで本番アプリにログインして、以下の順で操作：

### 5.1 ノートタイプを登録（初回のみ）

既存のシステムノートタイプ（Basic / Cloze）で足りるなら**スキップ**。
新しいフィールド構成が必要な場合のみ登録：

1. `/note-types/new` を開く
2. `notetype.json` の内容を見ながら：
   - ノートタイプ名を入力
   - フィールドエディタでフィールドを追加（順序注意）
   - テンプレートエディタで表面 HTML / 裏面 HTML / CSS を貼り付け
   - （任意）AI生成ルールを追加
3. 「保存」

### 5.2 デッキ作成 & CSV インポート

1. `/decks/new` でデッキ作成
   - ノートタイプをステップ5.1で登録したものに設定
   - 親デッキ（サブデッキにする場合）やフィルタタグも必要なら設定
2. 作成したデッキの詳細ページを開く
3. 「**CSV インポート**」ボタンをクリック
4. `cards.csv` をドラッグ&ドロップ
5. マッピングを確認 → プレビュー → 「インポート実行」
6. 結果画面で成功件数を確認

### 5.3 仕上げ

- **タグ付け**: ノート一覧で選択 → 「一括タグ追加」
- **デッキ設定**: 「⚙ 設定」で新規カード数・学習ステップ等を調整
- **配布**（講師権限のみ）: `/students` から生徒・クラスへ配布

---

## ステップ6: 生成物を Windows 側と共有

Mac で作成した `data/<deckName>/` をリポジトリに残して両端末で使いたい場合：

```bash
cd ~/dev/SRS
git add data/<deckName>
git commit -m "add <deckName> cards and note type"
git push
```

Windows 側では次回作業前に：

```bash
cd C:\Users\gaimo\AppData\Local\Programs\SRS
git pull
```

---

## 複数デバイス運用の鉄則

| ルール | 理由 |
|---|---|
| 作業前に必ず `git pull` | もう片方のデバイスで push された変更を取り込む |
| 作業後に必ず `git push` | 生成物を他端末で見られるように |
| 未コミットのまま別デバイスに移らない | `git stash` or commit で切り替え |
| `.env.local` は絶対に git に乗せない | 既に `.gitignore` 済だが念のため |
| Claude Code のメモリ（`~/.claude/`）は同期されない | `CLAUDE.md` / `docs/progress.md` でプロジェクト文脈を引き継ぐ |
| Supabase SQL マイグレーションは1回だけ実行 | どちらの端末で実行してもクラウドに反映されるので二重実行に注意 |

---

## よくあるトラブル

### `claude` コマンドが見つからない
```bash
which claude
# 出力が空なら npm のグローバルパスが通っていない
echo $PATH | tr ':' '\n' | grep npm
# なければ ~/.zshrc に追記
echo 'export PATH="$(npm prefix -g)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### `gh auth login` 後も git push で認証エラー
```bash
gh auth setup-git
```

### `git clone` で認証が求められる
リポジトリは public なので認証不要なはずだが、念のため：
```bash
gh repo clone kanada4310/swallow-srs ~/dev/SRS
```
（gh CLI 経由でクローン）

### Claude Code が `docs/content-creation-spec.md` を見つけられない
```bash
cd ~/dev/SRS
ls docs/content-creation-spec.md
```
ファイルが無ければ `git pull` で最新化。

---

## できること・できないこと

### ✅ Mac + この手順でできる
- リポジトリの全ファイル読み取り
- 教材からノートタイプ + テンプレート + CSV の生成
- `data/` 配下に成果物を置いて push
- `CLAUDE.md` / `docs/progress.md` の更新

### ❌ この手順ではできない（`.env.local` が要る作業）
- `npm run dev` でローカル起動
- `node data/xxx.mjs` 系のスクリプト実行（Supabase 直叩き）
- Anthropic / OpenAI API を使う開発
- Push 通知 VAPID 鍵を使う作業

これらをやる場合は [docs/mac-dev-setup.md](mac-dev-setup.md)（未整備、作業時に書き足す想定）の手順で
`.env.local` の転送 + `npm install` を追加で行う。

---

## 関連ドキュメント

- [docs/content-creation-spec.md](content-creation-spec.md) — コンテンツ作成の完全仕様（必読）
- [CLAUDE.md](../CLAUDE.md) — プロジェクト全体のルール
- [docs/progress.md](progress.md) — 現在の進捗・引継ぎメモ
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — DB スキーマ・設計
