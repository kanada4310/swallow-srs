---
date: 2026-07-07
tags: [srs, offline, ui-ux, garden]
phase: SRS総合評価レポート
slug: practice-mode-local-logging
---

# 練習モードの回答は「端末内ローカルログのみ」で実績に数える

## 背景 / 課題

繰り上げ学習（練習モード＝その日のノルマ後の追加練習）は `card_states` /
`review_logs` を一切更新しない安全設計だった（早期復習でSRSスケジュールを乱さない）。
その結果、練習の努力が連続日数・デイリーミッションにも、講師から見た実績にも
まったく残らない。塾のゲーミフィケーション（ストリーク・ミッション）方針と矛盾する。

経営判断（AskUserQuestion, 2026-07-07）: **練習も「連続日数・今日の学習（ミッション）」に
数える。ただし出題スケジュールは絶対に変えない。**

## 決定

練習の回答を **端末内（Dexie）だけに `practice: true` 付きの review_log として記録**し、
サーバーへは同期しない。

- **`LocalReviewLog.practice?: boolean`** を追加（Dexieフィールドのみ・インデックス/バージョン
  変更なし・サーバーの `review_logs` は無改修＝マイグレーション不要）。
- **`savePracticeReviewLog`**: `practice: true` を付与し、`synced_at` を `reviewed_at` で
  埋めて「同期不要」扱いにする（`getUnsyncedReviewLogs` からも拾われない二重防御）。
  sync_queue にも積まないので、送信経路（queue 経由のみ）に乗らずサーバーへ漏れない。
- **`StudySession` の practiceMode 分岐**: 従来の即 return をやめ、非ブロッキングで
  練習ログを保存。`card_states` は従来どおり更新しない（スケジュール不変）。
- **集計側**:
  - ストリーク（`useStreak`）・デイリーミッション（`getDailyMission`）は Dexie の
    reviewLogs を読むため、練習ログを**そのまま含む**（＝実績に数える）。追加改修なし。
  - `/stats`・講師の生徒進捗は **サーバー** の review_logs / card_states を読むため、
    練習が同期されない以上**自動的にクリーン**（正答率・復習数を汚さない）。
  - 識別演習スコア（`useIdentificationScores`・Dexie由来）だけは分析値なので
    `!practice` で除外。

## 代替案 / 却下理由

- **サーバーにも `practice` 列を足して同期**: マイグレーション＋push/answer API＋各集計の
  練習フィルタが必要で広範・高リスク。多デバイスでの練習実績共有という利点はあるが、
  生徒は主に1端末で、費用対効果が低い。ローカル限定で要件を満たせるため却下。
- **練習も card_states に反映**: 早期復習でSRSの間隔が乱れる。安全設計の根幹に反するため却下。
- **今のまま記録しない**: 努力が一切報われずゲーミフィケーション方針と矛盾。却下。

## 影響 / トレードオフ

- 変更: `src/lib/db/schema.ts`（型＋`savePracticeReviewLog`）、`src/lib/db/index.ts`（export）、
  `src/components/card/StudySession.tsx`（練習分岐で記録）、
  `src/lib/stats/useIdentificationScores.ts`（練習除外）。テスト +1。
- **制約**: 練習実績は端末ローカルのみ。別端末には反映されず、IndexedDB をクリアすると
  練習分のストリーク寄与は消える（本番の復習ログはサーバーにあるため無事）。許容範囲。
- Undo（取り消し）は練習モードでは従来どおり非対応（練習ログの巻き戻しはしない）。
