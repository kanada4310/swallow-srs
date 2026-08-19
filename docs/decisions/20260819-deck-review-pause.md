---
date: 2026-08-19
tags: [notifications, line, user_deck_settings, billing連携, teacher]
phase: 12.4
slug: deck-review-pause
---

# デッキ単位の復習通知停止（reviewPaused）と集計時の自動解除

## 背景

学習を止めたデッキの復習通知（LINE・送信役は billing）が生徒に飛び続ける。デッキ単位で通知だけを止めたい。停止しても学習スケジュール（card_states）は壊さず、生徒が自分でそのデッキを学習し直したら通知を自動再開する（塾長要件）。作業指示書: 統合塾運営エージェント `docs/work-orders/2026-08-19-srs-deck-pause.md`。

## 決定

1. **停止フラグは `user_deck_settings.settings` の JSONB キー**（`reviewPaused: true` + `reviewPausedAt: ISO時刻`）。新テーブル・新マイグレーションなし。キーは既存仕様どおり**ルートデッキID×生徒**（学習時マージキーと同じ。サブデッキ指定はサーバーでルートに解決）
2. **停止の意味は「通知集計から外す」だけ**。`card_states.state='suspended'`（リーチ用）とは別概念で、一切触れない
3. **自動解除は集計時判定**（同期時ではなく）。`due-cards-summary` と講師一覧 API が、停止時刻より後にそのデッキ（配下含む）の `review_logs` が存在するかを確認し、あればその場でフラグを消す。オフライン学習が遅れて同期されても次回集計で正しく解除される。push route への hook 追加が不要で、判定箇所が読み手側に閉じる
4. **既存の設定保存経路（settings 丸ごと上書き）では停止キーを保全**（`mergePreservingPause`）。講師の生徒別設定 PUT/DELETE と生徒本人の設定 upsert が停止フラグを黙って消さない
5. **停止/再開の入口は2ルート・実体は共通ロジック**: billing postback 用 `POST /api/admin/deck-review-pause`（Bearer=SRS_AUTH_SECRET・lineUserId/userId 両対応）と講師画面用 `POST /api/teacher/deck-review-pause`（セッション認証＋担当生徒チェック）。講師のブラウザに共有シークレットを渡せないため Bearer 直呼びにはしない
6. **講師向け API/画面の集計は service role client**。RLS 経由だと生徒の個人デッキが講師から見えず、billing への通知集計（service role）と一覧がズレるため。認可はセッション認証＋担当生徒チェックで担保

## 影響

- `GET /api/admin/due-cards-summary` は後方互換で拡張（既存フィールド維持・`decks`/`pausedDecks` 配列を追加・`dueCount` と代表カードは停止中デッキを除外）。SRS 先行デプロイでも billing は壊れない
- 契約 C1（SRS_AUTH_SECRET 3リポジトリ共有）は変更なし。新 API は既存 Bearer 認証に相乗り
- 純ロジックは `src/lib/review-pause/logic.ts`（テスト17件）、サーバーヘルパーは `server.ts`。講師画面は `/students/review-pause`
