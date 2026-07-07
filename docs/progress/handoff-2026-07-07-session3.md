# ハンドオフ 2026-07-07（セッション3）

> SRS総合評価レポートの残実装を2件。①送信キュー堅牢化（データ消失防止）②練習モードの実績記録。両方デプロイ済み。

## 今回やったこと
1. **学習記録の取りこぼし防止＝送信キュー堅牢化**（コミット `1b0c106`・デプロイ済・ADR `20260707-sync-queue-durability`）
   - 不具合: 送信が5回連続失敗した学習記録が、再送対象からも「未送信」カウントからも外れて静かに埋もれ、「同期済み」に見えていた（=データ消失の予兆）。加えて push 失敗は例外を投げず握りつぶされ、赤帯にも同期表示にも一切出ていなかった。復旧関数はあったが未配線。
   - 対応: 隔離しきい値を 5→20（`QUARANTINE_ATTEMPTS`）に引き上げ、20回未満はオンラインの同期サイクルごとに再送継続（upsert で冪等＝二重送信は無害）。`SyncStatus.quarantinedCount` を新設し `SyncErrorBanner`（「◯件の学習記録がまだ届いていません」＋再試行）と `SyncIndicator`（要再送バッジ）に可視化。純関数 `isQuarantined`/`summarizeQueue` を切り出しテスト（+8件）。毒データ1件は隔離止まりで自動再送から外すが**消さない**。
   - 触ったファイル: `src/lib/db/sync-queue.ts` / `sync.ts` / `index.ts`、`src/components/ui/SyncErrorBanner.tsx` / `SyncIndicator.tsx`、`sync-queue.test.ts`（新規）
2. **練習モードの実績記録**（コミット `11cd4dc`・デプロイ済・ADR `20260707-practice-mode-local-logging`）
   - 経営判断（AskUserQuestion）: 練習（繰り上げ学習）を**連続日数・今日のミッションに数える。ただし出題スケジュールは変えない。**
   - 対応: 練習の回答を**端末内（Dexie）だけに `practice:true` 付き review_log** で保存（`savePracticeReviewLog`・`synced_at` を reviewed_at で埋め同期不要扱い・sync_queue 非経由でサーバー非漏洩）。`card_states` は従来どおり非更新＝スケジュール不変。**マイグレーション不要**（サーバー review_logs 無改修）。
   - 集計: ストリーク（`useStreak`）・デイリーミッション（`getDailyMission`）は Dexie 由来なので練習を**自動的に含む**。`/stats`・講師進捗は**サーバー由来**なので練習が同期されず自動でクリーン。識別スコア（`useIdentificationScores`・Dexie由来）だけ `!practice` で除外。
   - 触ったファイル: `src/lib/db/schema.ts`（型＋`savePracticeReviewLog`）/ `index.ts`、`src/components/card/StudySession.tsx`、`src/lib/stats/useIdentificationScores.ts`、`schema.test.ts`（+1）

## 現在の状態
- 検証: tsc（既知の `sync.test.ts(125,48)` のみ）／lint（既知の TemplatePreview 警告のみ）／**テスト427件全通過**（+9）／`/check` 通過
- **両コミットともデプロイ済み**（`git push` → Vercel 本番反映）。作業ツリーはクリーン
- **実機確認は未**（下記「注意」参照）

## 途中で止まっていること
- なし。2件とも実装・テスト・ADR・コミット・プッシュ・デプロイまで完了。

## 次のセッションで注意すること
- **実機確認が未（両機能とも）**。理由＝どちらも通常操作での再現に段取りが要る（送信キューの隔離表示は約100分の連続失敗が条件／練習実績はその日のノルマ完了後に練習する必要）。実データが溜まってから、実端末で「練習して🔥連続日数が増える」ことと、通信を切って回答→復帰で未送信が正しく捌けることを確認したい。
- **練習実績は端末ローカルのみ**。別端末には反映されず、IndexedDB クリアで練習分のストリーク寄与は消える（本番の復習ログはサーバーにあるので無事）。仕様として許容。
- 送信キューの隔離しきい値 `QUARANTINE_ATTEMPTS=20` は定数。実運用の失敗頻度を見て調整余地。
- **SRS総合評価レポートの残り2件**（速度→簡単判定の重み／同期の差分化）は、今回デプロイした2件の実データが溜まってから着手するのが確実（速度→簡単はしきい値調整で実データ依存、差分化は影響範囲が広い）。
- 運用ルールは従来どおり: 実装前に計画承認／1タスク1コミット／技術判断は ADR／ハンドオフ個別ファイル／`/check`。
