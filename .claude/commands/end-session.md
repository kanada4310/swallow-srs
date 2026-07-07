セッション終了処理を行ってください。

1. **開発サーバーの停止**: バックグラウンドで動作中の `npm run dev` を停止し、残留 Node プロセスを kill する
   ```bash
   taskkill //F //IM node.exe 2>/dev/null
   ```
2. **キャッシュクリア**: `.next` フォルダを削除する（次回セッションでのフリーズ防止）
   ```bash
   rm -rf .next
   ```
3. **新しいハンドオフファイルを作成**: `docs/progress/handoff-YYYY-MM-DD.md`（同日複数セッションなら `-session2` 等を付与）を新規作成し、以下を書く:
   - 今回やったこと（箇条書き）
   - 現在の状態
   - 途中で止まっていること（あれば、具体的にどこまで進んだか）
   - 次のセッションで注意すべきこと（ハマりポイント、未解決の判断事項、申し送り）
4. `docs/progress.md` を更新:
   - 「現在の作業」（Phase / 最終更新 / 次にやること）を最新化
   - 「最新ハンドオフ」リンクを今回のファイルに差し替え、直前分は「過去ハンドオフ」へ移す
   - 「既知の課題」に新しい課題があれば追記
   - **過去の履歴を progress.md 本体に積み上げない**（ハンドオフファイルに書く）
5. 新しい技術判断・設計転換があれば ADR を作成: `docs/decisions/YYYYMMDD-<slug>.md` を frontmatter（date / tags / phase / slug）付きで書き、`node scripts/regenerate-decisions-index.mjs` で索引更新
6. CLAUDE.md の「現在の進捗」は 1〜2 行の要約のみ（詳細は progress.md）。該当する専用節があれば更新
7. ROADMAP.md の該当チェックボックスを更新（完了したものにチェック）
8. 未コミットの変更があれば git commit（ファイルを個別に add すること。`git add -A` は使わない）してプッシュ
9. 変更内容の要約を CLAUDE.md の報告の型（結論ファースト・日本語・専門用語を避ける）で表示
