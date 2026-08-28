# 引き継ぎ 2026-08-27: 教材の本文を、ログインした人だけが読める場所へ移す

指示書: 統合塾運営エージェント `docs/work-orders/2026-08-27-srs-protect-reading-data.md`
決定記録: `docs/decisions/20260827-reading-data-behind-login.md`
共有事項: **C22 に触れる**（置き場だけが変わる。ファイル名と `index.json` の形は不変）

## やったこと（3行）

1. 教材データ6講＋一覧を `public/reading-data/` から **`private/reading-data/`** へ移した（public 側には残していない）
2. **ログインした人だけが読める入口** `GET /api/reading/material/<ファイル名>` を作り、読解ページ・構文AI・35文の取り込みの読み込み先をそこへ変えた
3. 古い置き場にファイルが現れたら気づけるようにし（起動時・取り込み時・自動テスト）、検索よけ（robots）を足した

## 指示書の前提について（実測との違い）

指示書には「ログイン無しで誰でも取得できる」とあった。**本番へ実際に取りに行って確かめたところ、
今のところは取得できない**（見張りがログイン画面へ回すため 307 が返る）。実測は次のとおり。

```
/reading-data/index.json                 status=307（ログイン画面へ）
/reading-data/英語長文最前線_第2講_seg.json  status=307（ログイン画面へ）
```

ただし**守りが見張りの1行の書き方だけに頼っている**のは指示書のとおりで、
拡張子を1つ足すだけで黙って外へ出る作りだった。`public` は配信するための場所なので、
置いてあること自体が食い違っている。よって指示どおり置き場ごと移した（判断は変えていない）。

## 変えたところ

| ファイル | 内容 |
|---|---|
| `private/reading-data/*`（移動） | 教材データ6講＋`index.json`。`public/reading-data/` は無くなった |
| `src/lib/reading/material-store.ts`（新） | サーバー側で教材を読む窓口。一覧に載っているファイルだけ・置き場の外は返さない |
| `src/app/api/reading/material/[file]/route.ts`（新） | ログインした人だけが読める入口。401／404／端末に残さない指定 |
| `src/lib/reading/lessons.ts` | 取りに行く先を `/api/reading/material` へ（手順・見た目は不変） |
| `src/lib/syntax-ai/server.ts` | 文の照合を、自サイトへの取りに行きからサーバー側の直接読みへ（クッキー引き継ぎが不要に） |
| `src/app/api/reading/syntax-ai/{judge,dialogue}/route.ts`・`syntax-card/route.ts` | 上の呼び出し方を合わせた |
| `data/sync-syntax-problems.mjs` | 読み合わせ元を新しい場所へ＋古い置き場の警告 |
| `scripts/legacy-reading-data.mjs`（新） | 古い置き場を見る判定（3か所で共有） |
| `next.config.mjs` | 荷物に教材を含める指定＋起動時の警告＋先読み除外の後片付け |
| `src/app/robots.ts`（新）・`src/lib/supabase/middleware.ts` | 検索よけと、`robots.txt` をログイン無しで返す |
| `src/lib/reading/material-access.test.ts`（新） | ログイン無しで中身が取れないことの見張り（12件） |

## 確かめたこと（すべてローカルの開発環境）

- テスト790件全緑（着手時778・新規12）／型検査は既知の1件のみ／規約の確認は無関係の既存の注意1件／本番用ビルド成功
- ログインしていない状態: 入口は `401 {"error":"Unauthorized"}`・古い道は `307`（ログイン画面へ）・`robots.txt` は `200`
- ログインした状態（**テスト生徒（確認用）**・iPad Mini 相当）: 読解の一覧に6講が従来どおり出て、第2講を開くと8段落・必須の切れ目84か所が読めた
- 35文の取り込み: **35問**のまま。生成ファイルの差は説明の1行だけ（置き場の名前）
- 本番用ビルドの荷物に教材データが入っている（4つの入口とも `.nft.json` に14件）／静的配信の側には1件も入っていない

## 本番反映（2026-08-28）✅ 済み

塾長承認（回答A）のうえ3件を push。デプロイ成功。本番で確認した実測は次のとおり。

```
ログインしていない状態
/api/reading/material/index.json           status=401  本文 {"error":"Unauthorized"}
/reading-data/index.json                   status=307（ログイン画面へ）
/reading-data/英語長文最前線_第2講_seg.json   status=307（ログイン画面へ）
/robots.txt                                status=200  User-Agent: * / Disallow: /

ログインした状態（テスト生徒（確認用）・iPad Mini 相当）
/api/reading/material/index.json           status=200  一覧 6 件
/api/reading/material/…第2講_seg.json       status=200  段落 8 件
/reading-data/index.json                   status=404 ＝古い道には実物が無い
/reading-data/…第2講_seg.json               status=404 ＝古い道には実物が無い
```

画面でも、読解の一覧に第2〜7講の6講が従来どおり並び、第2講は本文が最後まで表示され
「8 段落 / 必須の切れ目 84 か所 / 目安 30 分」と6つの段が従来どおりだった。

## 次にやること
- 別の作業: quiz_generator の書き出し先を `private/reading-data/` へ変える（秘書が起案）。
  それまでは書き出しを走らせると古い置き場に置かれ、警告が出る
