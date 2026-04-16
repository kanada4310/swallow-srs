# 進捗管理

## 現在の作業
- Phase: 生徒取組状況UI完了 + LINE通知データAPI完了 → 次は billing側LINE送信 / Phase 9.3-9.4
- 最終更新: 2026-04-16
- 次にやること:
  1. **billing側のLINE送信ジョブ**: `/api/admin/due-cards-summary` を叩いてFlexメッセージ生成→LINE Messaging API送信（SRS側は完了済み）
  2. Phase 9.3-9.4: 学習時間トラッキング、習熟度スコア
  3. Phase 10: ゲーミフィケーション（ストリーク、デイリーゴール、リーダーボード）

## セッション引継ぎメモ

### 2026-04-16 夜（生徒取組状況UI + LINE通知データAPI + 掃除）
- **やったこと**:
  - **生徒取組状況UI**:
    - 一覧ページ `/students/progress`（今日の復習数、累計、期限切れ、最終活動、全体正答率を表示）
    - 詳細ページ `/students/progress/[userId]`（StatsOverview + 各種グラフ + デッキ別進捗）
    - ノート別ドリルダウン（デッキクリックで各ノートの状態/正答率/最終レビューを表示）
    - API `/api/teacher/student-progress`（バッチクエリでN+1回避、?deckId=xxx でノート一覧モード）
    - 共通統計モジュール `src/lib/stats/calculations.ts`（生徒/講師で共有）
    - DBマイグレーション `017_teacher_student_progress.sql`（card_states に講師閲覧RLS追加）
    - クラス管理ページに「取組状況」ボタン追加
  - **LINE通知データAPI**:
    - `GET /api/admin/due-cards-summary`（Bearer認証、期限切れカードを持つ全生徒のサマリー返却）
    - レスポンス: `{ students: [{ lineUserId, name, dueCount, frontText, deckName }] }`
    - `middleware.ts` の publicPaths に追加
    - extract-text ユーティリティで frontText を生成
  - **掃除**:
    - 未使用の Google OAuth コールバック `/callback/route.ts` 削除 + publicPaths から除去
    - progress.md の既知の課題から解消済み項目を削除
- **次のセッションで注意すべきこと**:
  - `017_teacher_student_progress.sql` 実行済み
  - 生徒取組状況UIは講師ロールのみアクセス可（card_states RLSで制御）
  - LINE通知送信本体（Flexメッセージ生成 + Messaging API呼び出し）は**billing側に未実装**
  - billing側は SRS_AUTH_SECRET + `GET /api/admin/due-cards-summary` で呼び出す
  - FSRS card_states の `lapses` カラムはノート別進捗で正答率計算に使用

### 2026-04-16 後半（billing-SRS同期 + フィルタデッキ修正 + 設定継承）
- **やったこと**:
  - **billing-SRSミラーリング同期の完全実装**
    - SRS側: Admin billing-sync API (`POST /api/admin/billing-sync`)
    - SRS側: LINE認証ロジックの共通ユーティリティ抽出 (`src/lib/auth/line-user.ts`)
    - SRS側: DBマイグレーション `016_billing_sync.sql`（billing_template_id + teacher_id nullable + RLSポリシー）
    - SRS側: Dexie v10（billing_template_id インデックス追加）
    - billing側: `srs-sync.service.ts`（データ収集 + SRS API呼び出し）
    - billing側: Daily Cronに同期ジョブ追加（#7）
    - billing側: 手動同期API (`POST /api/admin/srs-sync`) + ダッシュボードにSRSSyncButton
    - 同期結果: 21クラス、48生徒アカウント、60メンバー登録を確認
  - **billing連携クラスの講師UI対応**
    - GET /api/classes でbilling連携クラスも返す
    - 生徒管理ページ・クラス詳細ページでbilling連携クラス表示
    - billing連携クラスの編集/削除/メンバー変更をブロック（読み取り専用）
    - RLSポリシー追加（Teachers can view billing-synced classes）
    - `is_class_teacher` / `is_student_of_teacher` 関数をbilling連携クラス対応に更新
    - Pull sync APIでbilling連携クラスも同期
  - **フィルタデッキの不具合修正**
    - `getStudyCardsOffline`: フィルタサブデッキでルートデッキツリーからカード取得するように修正
    - `getDecksWithStatsOffline`: フィルタサブデッキのカード数を親デッキからタグマッチで計算
  - **デッキ設定の不具合修正**
    - `OfflineDeckWithStats`に`settings`フィールド追加（設定モーダルがデフォルトに戻る問題修正）
    - 学習ページでルートデッキ設定をロードしStudySessionに渡す（フィルタサブデッキの設定継承）
  - **配布デッキのサブデッキ同期修正**
    - Pull APIでサブデッキ取得にadmin clientを使用（RLSバイパス）
  - **その他**
    - LINE auth routeを共通ユーティリティ使用にリファクタ
    - billing-sync APIのミドルウェア除外（publicPaths追加）
    - エラーハンドリング強化（billing側: text→JSON パース、SRS側: グローバルtry-catch）
- **途中で止まっていること**:
  - Pull APIにデバッグログが残っている（次セッションで削除推奨）
- **次のセッションで注意すべきこと**:
  - `016_billing_sync.sql` は実行済み（RLSポリシー含む）
  - billing連携クラスは `teacher_id = null`, `billing_template_id IS NOT NULL` で識別
  - 退塾処理は `ban_duration: '876000h'` でアカウント無効化（データ保持）
  - SRS_AUTH_SECRETは両システムで共有済み
  - billing側のコードはswallow-billingリポジトリ（`/c/Users/gaimo/AppData/Local/Programs/swallow-billing`）
  - フィルタデッキの動作: 新規カードのみフィルタ、復習カードはルートデッキ全体から
  - サブデッキ同期はPull APIでadmin clientを使用（RLSバイパス）

### 2026-04-16（フィルタデッキ実装 + サブデッキ一括作成 + 配布デッキ同期改善）
- **やったこと**:
  - フィルタデッキ機能の完全実装（設計→コーディング→テスト→ビルド→プッシュ）
    - DBマイグレーション `015_filter_decks.sql`（filter_tags列 + get_root_deck_id RPC）実行済み
    - Deck型にfilter_tags追加、Dexie v9、getRootDeckId()ヘルパー
    - getStudyCardsOffline(): ルートデッキベースの新規カード枠共有 + タグフィルタ
    - デッキ作成/編集API: filterTagsパラメータ対応
    - DeckForm UI: フィルタータグ入力（オートコンプリート付き）
    - デッキ一覧: フィルタタグの紫バッジ表示
    - 12テスト追加（getRootDeckId、タグフィルタリングロジック）
  - 動詞の語法デッキに13セクション別フィルタサブデッキを一括作成（スクリプト: `data/create-filter-subdecks.mjs`）
  - 配布デッキのサブデッキ自動同期（pull API修正: 子・孫デッキも自動取得）
  - 配布デッキのツリー構造表示（フラットリストからツリーに変更）
  - 既存のSVCサブデッキ（filter_tagsなし）を削除

### 2026-04-10（動詞の語法デッキ + 講師ログイン + LINE認証修正 + フィルタデッキ設計）
- **やったこと**:
  - LINE自動ログインE2Eテスト完了確認
  - 動詞の語法デッキ作成（582ノート、5カテゴリタグ体系、インポート完了）
  - 講師用メール+パスワードログイン追加（`gaimon.maam@gmail.com`）
  - LINE認証ルート大幅修正（3段階フォールバック + magic link方式）
  - 同期403エラー修正（pull APIのuserIdチェック削除）
  - デッキ設定保存後のDexie未更新バグ修正
  - フィルタデッキ機能の設計・計画書作成

### 2026-04-10（前半セッション — billing側設計）
- billing側の総合メニューに「学習支援」セクション追加設計 → ユーザーが実装済み
- LINE自動ログインの環境変数設定手順ドキュメント化 → ユーザーが設定済み

### 2026-04-09（LINE自動ログイン実装）
- LINE自動ログイン統合（Phase 17a）のコード実装完了
- Supabaseプロジェクト復旧、Google OAuth修正

### 2026-02-19
- TTS設定デッキ移動 + 通知UI整理 完了
- テンプレートTTSプレースホルダー実装
- TTSプリフェッチ実装

## 既知の課題
- billing側のビルドがWindows環境でOOMになることがある（`--max-old-space-size=4096` で回避）
- LINE端末のIndexedDBに古いユーザーIDがキャッシュされる場合がある（pull APIで対処済み、push APIも同様の対処が必要かもしれない）

## 今後のロードマップ概要（優先度順、詳細は ROADMAP.md）
- **Phase 12.4**: billing側でLINE Flex送信（SRS側データAPIは完了）★次
- **Phase 9.3-9.4**: 学習時間トラッキング、習熟度スコア
- **Phase 10**: ゲーミフィケーション
- **Phase 11.1/11.3/11.4**: 宿題機能・クラス分析・保護者レポート
- **Phase 13-14, 16**: コンテンツ効率化、学習モード拡張、コラボレーション
