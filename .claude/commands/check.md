コード品質チェックを実行してください。

## Step 1: 静的チェック
以下を順番に実行し、結果を記録する:
1. `npx tsc --noEmit` — 型エラー確認（**既知の型エラー `src/lib/db/sync.test.ts(125,48)` は `next build` は通るため除外可**）
2. `npm run lint` — ESLint 確認（**既知の TemplatePreview 警告は除外可**）
3. `npm run test` — Vitest 実行

## Step 2: コード品質メトリクス
`src/` 配下の `.ts` `.tsx` を対象に、以下を目視/grep で確認する:
- 同名の関数が複数ファイルに重複していないか
- `dangerouslySetInnerHTML` が未サニタイズで使われていないか（禁止事項）
- Supabase RLS をバイパスするクエリ（admin client の不用意な使用）がないか
- 同期処理で `updated_at` を無視していないか
- 極端に長いファイル・関数（分割候補。特に `StudySession.tsx` / `src/lib/db/schema.ts`）

## Step 3: 結果サマリー
以下のフォーマットで出力する（CLAUDE.md の報告の型に従い日本語で）:

```
[型]      OK / NG (エラー数)
[Lint]    OK / NG (エラー数)
[テスト]  OK / NG (成功/失敗/スキップ)

[コード品質]
  WARNING: {ファイル}
    -> {内容}
  INFO: {その他の指摘}

[まとめ]
  警告合計: N 件
  リファクタリング推奨: あり / なし
```

## Step 4: 対応
- 型エラー・Lint エラーがあれば修正案を提示（**修正は承認後に実行**）
- コード品質の WARNING が **5 件以上** ある場合は「リファクタリング推奨」と明記
- このコマンドでは報告のみ。コードは変更しない
