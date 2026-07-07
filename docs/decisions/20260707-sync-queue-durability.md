---
date: 2026-07-07
tags: [sync, offline, srs]
phase: SRS総合評価レポート
slug: sync-queue-durability
---

# 送信キューは「失敗を静かに埋もれさせない」設計にする

## 背景 / 課題

学習の回答は端末内の送信キュー（IndexedDB `syncQueue`）に積まれ、オンライン時に
`/api/sync/push` へ送られる。従来の実装には学習記録が静かに消失しうる不具合が重なっていた。

1. **失敗5回で埋没**: `getPendingEntries` / `getPendingSyncCount` が `attempts < 5` の
   エントリだけを対象にしていた。5回失敗したエントリは再送対象からも保留カウントからも
   外れ、IndexedDB に残ったまま「未送信0件＝同期済み」に見えていた。
2. **送信失敗が不可視**: `pushToServer` は fetch 失敗を `failed[]` に握りつぶし、例外を
   投げない。そのため `fullSync` は push が全滅しても `error: null` / `lastSyncAt: now` を
   セットし、赤帯（`SyncErrorBanner`）にも同期表示にも一切出なかった。
3. **復旧導線が未配線**: `retryFailedSync` / `getFailedEntries` は存在したが、どの UI
   からも呼ばれていなかった。

塾アプリでは生徒の学習記録の欠落は信頼性・講師が見る進捗の正確さを直接損なう。

## 決定

送信キューを「再送継続中」と「隔離（要確認）」の2状態で扱い、失敗を必ず可視化する。

- **隔離しきい値を 5→20 に引き上げ**（`QUARANTINE_ATTEMPTS`）。同期は5分間隔なので
  20回 ≒ 100分の連続失敗が隔離条件。それまではオンラインの同期サイクルごとに再送を続ける。
  再送は upsert（`user_id:card_id` / `review_log.id` キー）で**冪等**なので二重送信は無害。
- **保留カウントに失敗中も含める**: `getPendingSyncCount` は `attempts < QUARANTINE`。
  純関数 `isQuarantined` / `summarizeQueue`（→テスト）で分類し、`getSyncQueueSummary` が
  `{ pending, quarantined }` を返す。
- **`SyncStatus.quarantinedCount` を新設**し、`fullSync` / `pushToServer` が毎回更新。
- **UI 配線**: `SyncErrorBanner` は `quarantinedCount > 0` でも表示し「◯件の学習記録が
  まだ届いていません」を出す。再試行は `retryFailedSync()` → `fullSync()` の順で隔離分も
  戻す。`SyncIndicator` のバッジ／詳細に「要再送」を追加。
- **毒データ安全弁**: サーバーが常に拒否する壊れた1件は隔離止まりで自動再送対象から外れ、
  他のエントリの送信を妨げない。可視化はするが**自動では消さない**（手動再試行で復帰可能）。

## 代替案 / 却下理由

- **失敗上限を撤廃して無限リトライ**: 毒データ1件が毎サイクル push を消費し続ける。却下。
- **失敗を即エラー赤帯に出す**: 一時的な通信ブレでも毎回警告が出て警告疲れになる。
  一時的失敗は保留カウントの増減で表現し、隔離（持続的失敗）だけを赤帯に昇格させた。
- **lastSyncAt を push 失敗時に更新しない**: pull（受信）が成功していれば表示データは
  最新なので、`lastSyncAt` は維持しつつ未送信件数で正直に示す方が誤解が少ない。

## 影響

- 変更: `src/lib/db/sync-queue.ts`（隔離ロジック・純関数・集計）、`src/lib/db/sync.ts`
  （`quarantinedCount` 追加・status 更新）、`src/lib/db/index.ts`（エクスポート）、
  `src/components/ui/SyncErrorBanner.tsx` / `SyncIndicator.tsx`（可視化・再送導線）。
- テスト: `src/lib/db/sync-queue.test.ts`（+8件）。スケジューラ・SRS計算には非干渉。
- しきい値 `QUARANTINE_ATTEMPTS=20` は定数。実運用の失敗頻度を見て調整余地あり。
