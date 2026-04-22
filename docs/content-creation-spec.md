# つばめSRS コンテンツ作成仕様書

**目的**: 教材（テキスト・画像・表など）から、つばめSRS にインポートするための
「ノートタイプ定義 + カードテンプレート HTML/CSS + CSV」一式を生成するための自己完結型スペック。

**想定読者**: 前情報ゼロで起動した Claude Code / ChatGPT / Claude.ai セッション。
このドキュメント1本で全工程が進められるよう、全てを詰め込んでいる。

---

## 0. 成果物の形（何を作れば完了か）

指定のディレクトリ（通常 `data/<deckName>/`）に以下を配置すれば完成：

```
data/my-new-deck/
├── notetype.json       # ノートタイプ定義（fields + generation_rules）
├── template.html       # 表面テンプレート
├── template-back.html  # 裏面テンプレート（複数ある場合は template-back-1.html, -2.html ...）
├── style.css           # カード CSS
└── cards.csv           # インポート用カードデータ（UTF-8 BOM + CRLF）
```

Web UI 側で `notetype.json` の内容を `/note-types/new` で登録 →
デッキ作成 → デッキ詳細の「CSVインポート」から `cards.csv` を流し込む、という手順で取り込む。

---

## 1. CSV 仕様

### 1.1 エンコーディング・改行

| 項目 | 値 |
|---|---|
| 文字コード | **UTF-8 BOM 付き**（Excel で文字化けしないため） |
| 改行コード | **CRLF (`\r\n`)** |
| 区切り文字 | `,`（カンマ）。タブ・`;`・`|` も自動検出されるが原則カンマ |
| 引用符 | RFC 4180 準拠。`"` を含む or 改行 or 区切り文字を含むフィールドは `"..."` で囲む。`"` 自体は `""` にエスケープ |
| 最大行数 | 10,000 行（インポーター側の上限） |
| 最大ファイルサイズ | 5 MB |

実装: `src/lib/csv/parser.ts` の `parseCSV()` / `detectDelimiter()` / `readFileAsText()`。

### 1.2 列構成

**1行目はヘッダー行（必須）**。ヘッダー名がノートタイプのフィールド名と**完全一致**すると自動マッピングされる。完全一致しない場合でも以下のエイリアスは自動認識される：

- Basic 型の Front: `front, english, word, 英語, 単語, 表`
- Basic 型の Back: `back, japanese, meaning, 日本語, 意味, 裏`
- Cloze 型の Text: `text, sentence, 文, テキスト, 本文`
- Cloze 型の Extra: `extra, note, 補足, メモ`

自動マッピングが外れた列はインポート画面でドロップダウンから手動割り当て可能。**ヘッダー名はフィールド名と一致させるのが最もトラブルが少ない**。

### 1.3 タグの扱い（★注意）

**現状、CSV インポート API はタグ列を処理しない**（`src/app/api/notes/import/route.ts` に `tags` の扱い無し）。タグを付けたい場合は以下のいずれか：

1. インポート後に NoteBrowser の「選択 → 一括タグ追加」で付与
2. `data/import-verb-deck.mjs` のように専用スクリプトで直接 Supabase に書き込む

**したがって CSV には通常「tags 列」は入れない**。どうしても入れたければインポーター UI では無視されることを承知しておく。

### 1.4 Cloze（穴埋め）記法

Text フィールドに以下の記法を埋め込む：

| 記法 | 表示（表） | 表示（裏） |
|---|---|---|
| `{{c1::answer}}` | `[...]` | `answer` |
| `{{c1::answer::hint}}` | `[hint]` | `answer` |
| `{{c1::A}} ... {{c2::B}}` | 1枚目: `[...] ... B`<br>2枚目: `A ... [...]` | 両方 `A ... B` |

- 同じ番号（`c1`）は同一カード、別番号（`c2`, `c3`）は**別カード**として自動生成。
- 穴埋めが N 個あれば自動で N 枚のカードが作られる（`countClozeDeletions()`）。
- 穴埋めが 1 つも無い Cloze ノートは1枚のカードになる。

### 1.5 CSV の実例

**Basic 型（英 ↔ 和）**:
```csv
Front,Back
apple,りんご
go through,経験する
"He said, ""I'm sorry""",彼は「ごめん」と言った
```

**Cloze 型**:
```csv
Text,Extra
"The {{c1::capital}} of Japan is {{c2::Tokyo}}.",主要都市
"{{c1::光合成}}は植物が行う。",生物基礎
```

**カスタム（動詞の語法）**:
```csv
日本語文,指定動詞,パーツ,正答,ID
彼は私にその本を貸してくれた。,lend,SVOO,He lent me the book.,v-001
```

---

## 2. ノートタイプ定義（`notetype.json`）

### 2.1 JSON スキーマ

```json
{
  "name": "ノートタイプ名",
  "fields": [
    {
      "name": "フィールド名",
      "ord": 0,
      "settings": {
        "tts_enabled": false,
        "placeholder": "入力時のプレースホルダー",
        "required": true
      }
    }
  ],
  "generation_rules": [],
  "templates": [
    {
      "name": "Card 1",
      "ordinal": 0,
      "front_template": "...HTML...",
      "back_template": "...HTML...",
      "css": "...CSS..."
    }
  ]
}
```

### 2.2 `fields` のルール

- `name`: フィールド名。**一意**であること。日本語・英語どちらもOK。
- `ord`: 0 始まりの連番。`ord === 0` のフィールドは**必須フィールド**（インポート時に必ずマッピングが要求される）。
- `settings.tts_enabled`: true にすると、テンプレート内で `{{tts:フィールド名}}` を書いたときに音声ボタンが出る。
- `settings.placeholder`: ノート編集 UI の入力欄プレースホルダー。
- `settings.required`: デフォルト true。false で任意フィールドにできる。

型定義: `src/types/database.ts` の `FieldDefinition` / `FieldSettings`。

### 2.3 `generation_rules`（AI生成、オプショナル）

Claude API で自動生成したいフィールドがある場合に定義。なければ空配列 `[]`。

```json
{
  "id": "uuid-string",
  "name": "例文生成",
  "source_fields": ["Front"],
  "instruction": "この英単語を使った英文例を3つ生成してください。各例文は改行で区切ってください。",
  "target_field": "Examples"
}
```

- `id`: 任意の UUID 文字列（重複しなければ何でも良い）
- `source_fields`: 参照するフィールド名の配列
- `instruction`: Claude へのプロンプト
- `target_field`: 生成結果を保存するフィールド名（事前に `fields` に存在すること）

プリセット（`src/lib/tagging/presets.ts`）:
- **Cloze化**: 例文中の見出し語を `{{c1::答え::ヒント}}` に変換
- **コロケーション強調**: `<b>...</b>` で強調
- **和訳対応語強調**: 和訳中の対応語を `<b>...</b>` で強調

### 2.4 システム組込みノートタイプ（既存、再定義不要）

既存システム（SQLマイグレーション `001_initial_schema.sql`）で以下が定義済み。新しいデッキでこれらを使うだけなら `notetype.json` は不要。

**Basic (and reversed card)** — ID `00000000-0000-0000-0000-000000000001`
```json
{"fields": [{"name": "Front", "ord": 0}, {"name": "Back", "ord": 1}]}
```
→ カード2枚（Front→Back、Back→Front）

**Cloze** — ID `00000000-0000-0000-0000-000000000002`
```json
{"fields": [{"name": "Text", "ord": 0}, {"name": "Extra", "ord": 1}]}
```
→ `{{c1::...}}` の数だけ自動カード生成

---

## 3. テンプレート（HTML/CSS）文法

### 3.1 プレースホルダ一覧

| 記法 | 意味 | 使用場所 |
|---|---|---|
| `{{FieldName}}` | フィールド値をそのまま挿入（HTML エスケープ無し） | 表・裏 |
| `{{FrontSide}}` | レンダリング済みの表面 HTML を挿入 | 裏のみ |
| `{{tts:FieldName}}` | フィールド値 + 🔊音声ボタン | 表・裏 |
| `{{cloze:FieldName}}` | Cloze 穴埋め処理（表で `[...]`、裏で答え） | 表・裏 |
| `{{#FieldName}}...{{/FieldName}}` | フィールドが空でない時だけ内部を表示 | 表・裏 |
| `{{^FieldName}}...{{/FieldName}}` | フィールドが空の時だけ内部を表示（逆条件） | 表・裏 |

実装: `src/lib/template/renderer.ts` の `renderTemplate()`。

### 3.2 重要な挙動

- **HTML エスケープされない**: フィールド値に `<b>強調</b>` を入れれば太字になる。XSS 対策は iframe 隔離で実現しているので、テンプレート内は任意の HTML を書いて良い。
- **処理順序**: Cloze → 条件分岐 → 逆条件 → TTS → 単純置換。この順序で展開されるので、Cloze の中に条件分岐は書かない方が安全。
- **カード隔離**: 最終的に `<iframe sandbox="allow-scripts allow-popups" srcdoc="...">` 内でレンダリングされる（`src/components/card/CardIframe.tsx`）。外部スクリプトやネットワークは sandbox で遮断される。

### 3.3 CSS のスコープ

- CSS は**カード毎に iframe 内で完結**。アプリ本体の CSS と混ざらない。
- iframe 側で以下のプリセット CSS が追加で適用される（`CardIframe.tsx`）:
  ```css
  .cloze-deletion.cloze-hidden { color: #2563eb; font-weight: bold; }
  img { max-width: 100%; height: auto; }
  .tts-btn { /* ボタンスタイル */ }
  ```
- ルート要素は `<div class="card">...</div>` で包まれる。`.card` セレクタで全体指定できる。

### 3.4 テンプレート実例

#### Basic の表面
```html
<div class="front">{{Front}}</div>
```

#### Basic の裏面
```html
<div class="front">{{Front}}</div>
<hr>
<div class="back">{{Back}}</div>
```

#### Basic の CSS
```css
.card {
  font-family: sans-serif;
  font-size: 20px;
  text-align: center;
  padding: 20px;
}
.front, .back {
  margin: 10px 0;
}
```

#### Cloze の表面
```html
<div class="cloze">{{cloze:Text}}</div>
```

#### Cloze の裏面
```html
<div class="cloze">{{cloze:Text}}</div>
{{#Extra}}
<hr>
<div class="extra">{{Extra}}</div>
{{/Extra}}
```

#### 動詞の語法（複雑な実例）
```html
<!-- 表面 -->
<div class="prompt">次の日本語を、指定動詞を使って英訳せよ。</div>
<div class="japanese">{{日本語文}}</div>
<div class="meta">
  <div class="verb">指定動詞：<strong>{{指定動詞}}</strong></div>
  <div class="parts">パーツ：{{パーツ}}</div>
</div>
```
```html
<!-- 裏面 -->
{{FrontSide}}
<hr>
<div class="answer">{{正答}}</div>
```
```css
.card {
  font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  padding: 24px 20px;
  text-align: center;
  max-width: 600px;
  margin: 0 auto;
}
.prompt { color: #6b7280; font-size: 13px; margin-bottom: 20px; }
.japanese { font-size: 21px; line-height: 1.7; margin-bottom: 24px; color: #1f2937; }
.meta { background: #f3f4f6; border-radius: 8px; padding: 12px 16px; text-align: left; }
.verb { color: #2563eb; font-size: 17px; margin-bottom: 6px; }
.parts { color: #6b7280; font-size: 15px; }
hr { margin: 24px 0; border: none; border-top: 1px solid #e5e7eb; }
.answer { font-size: 21px; color: #059669; line-height: 1.7; }
```

### 3.5 複数テンプレート（1ノート→Nカード）

Basic 型のように**ノート1枚から複数カード**を生成したい場合は、`templates` 配列に複数エントリを入れる：

```json
{
  "templates": [
    {"name": "Card 1 (Front→Back)", "ordinal": 0, "front_template": "...", "back_template": "...", "css": "..."},
    {"name": "Card 2 (Back→Front)", "ordinal": 1, "front_template": "...", "back_template": "...", "css": "..."}
  ]
}
```

- `ordinal` は 0 始まり連番。
- Cloze 型は `templates` は1つだけ。穴埋め数で自動分岐する。

---

## 4. 禁止事項・注意点

### 4.1 絶対にやってはいけない

- ~~`<script>` タグ~~: iframe sandbox で遮断されるが、書くと意図せず動作する可能性があるので避ける。
- ~~外部 URL からの `<iframe>`, `<object>`~~: 埋め込みコンテンツは原則不可。
- ~~`onclick` などインラインイベントハンドラ~~: 効かない上にサニタイザが将来強化される可能性。

### 4.2 フィールド命名の注意

- **スペース禁止**: `{{My Field}}` はプレースホルダとして認識されない。単語区切りはアンダースコアまたはキャメルケース。
- **日本語OK**: `{{日本語文}}` は問題なく動作。
- **半角英数記号の一部は不可**: `{`, `}`, `:` はプレースホルダ記法と衝突するので使わない。

### 4.3 改行・文字コードのトラブル

- CSV を `echo > file.csv` で作ると LF のみ・BOM なしになる → Excel で開くと文字化け。Python や Node.js スクリプトで `\uFEFF` を先頭に付け、`\r\n` で改行する。
- VS Code で保存する場合は「UTF-8 with BOM」を選ぶ。

### 4.4 サイズ制限

- ノートは 1回のインポートで最大 **10,000 件**（`src/app/api/notes/import/route.ts:52`）
- CSV ファイル自体は最大 **5 MB**（CSVImporter UI 側）

---

## 5. 生成タスクのテンプレ（Claude への依頼文）

別端末の Claude Code にこのファイルを読ませた後、以下のような依頼文で作業を進める：

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
- フィールド構成の希望: [例: Word / Meaning / Example / Audio ソース]
- 特殊要件: [例: TTS は Word に、Cloze は使わない、タグは〜]
- カード枚数: [例: 1ノート = 表面英→和 のみ、リバース不要]

既存の動詞の語法デッキ（data/import-verb-deck.mjs 参照）のスタイルを
参考にしてOKです。フィールド名は日本語・英語どちらでも可。
```

---

## 6. Web UI での取り込み手順

### 6.1 ノートタイプの登録

1. ブラウザで本番アプリ（デプロイ済み Vercel）にログイン
2. `/note-types/new` にアクセス
3. **ノートタイプ名** を入力
4. **フィールドエディタ** で `notetype.json` の `fields` を再現（追加・順序入れ替え・TTS設定）
5. **テンプレートエディタ** で `templates` を再現
   - テンプレート名 + 表面 HTML + 裏面 HTML + CSS を貼り付け
   - 複数カードの場合は「テンプレート追加」で増やす
6. **AI生成ルール**（任意） で `generation_rules` を追加
7. **保存**

### 6.2 デッキ作成と CSV インポート

1. `/decks/new` でデッキ作成（使うノートタイプを指定）
2. 作成したデッキの詳細ページを開く
3. 「**CSV インポート**」ボタンをクリック
4. ノートタイプを選択（事前に登録したもの）
5. `cards.csv` をドラッグ&ドロップ
6. **マッピング画面**: 自動割り当てされるが、違う場合は手動修正
7. **プレビュー**: 最初の5件が想定通りか確認
8. 「インポート実行」
9. 結果画面で成功件数・エラー件数を確認

### 6.3 インポート後の仕上げ

- **タグ付け**: ノート一覧（NoteBrowser）で「選択モード」→ 対象ノートにチェック → 「一括タグ追加」
- **デッキ設定**: `/decks/[id]` のデッキ詳細 → 「⚙ 設定」 で 1日の新規カード数、学習ステップ等を調整
- **配布**: 講師アカウントなら `/students` / `/students/class/[id]` から生徒・クラスへ配布
- **サブデッキ**: 親デッキの詳細ページから「サブデッキを作成」で階層化可能（最大3階層）

---

## 7. トラブルシューティング

| 症状 | 原因 | 対策 |
|---|---|---|
| CSV が「エンコーディング違反」エラー | Shift-JIS 等で保存された | UTF-8 BOM 付きで再保存 |
| Excel で開くと文字化け | BOM 無しで UTF-8 | BOM を追加 |
| インポート時に「必須フィールドが未マッピング」 | `ord === 0` のフィールドが CSV に無い | ヘッダー名をフィールド名と合わせる |
| `{{FieldName}}` が置換されない | フィールド名にスペース or 記号 | フィールド名を修正（再登録） |
| Cloze カードが1枚しかできない | `{{c1::...}}` しか書いていない | 別カードが欲しければ `{{c2::...}}` を使う |
| テンプレートの CSS が効かない | セレクタがプリセット CSS に上書きされる | `.card .my-class` のように詳細度を上げる |
| 画像が表示されない | `src` 属性が相対パス | 絶対URL (`https://...`) を使う |

---

## 8. 参照コード（このドキュメント執筆時点のソース）

- CSV パーサー: `src/lib/csv/parser.ts`
- CSV インポート API: `src/app/api/notes/import/route.ts`
- CSV インポート UI: `src/components/deck/CSVImporter.tsx`
- CSV エクスポート: `src/lib/csv/exporter.ts`
- テンプレートレンダラー: `src/lib/template/renderer.ts`
- カード iframe: `src/components/card/CardIframe.tsx`
- ノートタイプ API: `src/app/api/note-types/route.ts`
- 型定義: `src/types/database.ts`
- システムノートタイプ初期データ: `supabase/migrations/001_initial_schema.sql:525-615`
- 動詞の語法インポート実例: `data/import-verb-deck.mjs`
- 生成ルールプリセット: `src/lib/tagging/presets.ts`

これらのファイルパスは**このドキュメント作成時点のもの**。もし見つからない場合はリポジトリ内で `Grep` で最新の場所を探すこと。
