# 進捗管理

## 現在の作業
- Phase: Phase 17a 完了 → 次は Phase 9.3-9.4
- 最終更新: 2026-04-10
- 次にやること:
  1. 動詞の語法デッキを生徒に配布（deck_assignments 作成）
  2. Phase 9.3-9.4: 学習時間トラッキング、習熟度スコア
  3. Phase 10: ゲーミフィケーション

## セッション引継ぎメモ

### 2026-04-10（動詞の語法デッキ作成 + 講師PCログイン + LINE認証修正）
- **やったこと**:
  - LINE自動ログインのE2Eテスト完了確認（環境変数・billingメニューはユーザーが設定済み）
  - 動詞の語法デッキ作成:
    - 2つのソースファイル（.md + .tsv）を統合スクリプト（`data/merge-verb-data.mjs`）でマージ
    - 582ノート、5カテゴリのタグ体系（セクション/サブセクション/v:動詞/文型:/前置詞:）
    - インポートスクリプト（`data/import-verb-deck.mjs`）でSupabaseに直接投入
    - ノートタイプ「動詞の語法」（フィールド: 日本語文/指定動詞/パーツ/正答/ID）
  - 講師用メール+パスワードログイン追加:
    - ログインページに折りたたみ式「講師用ログイン」セクション追加
    - 既存LINEアカウントに `gaimon.maam@gmail.com` + パスワードを紐付け
    - LINEログインとPCログインで同一アカウントにアクセス可能に
  - LINE認証ルート大幅修正:
    - 3段階フォールバック: パスワードログイン → metadata検索+magic link → 新規作成
    - メール変更済みユーザー（講師）でもLINE再ログインで同じアカウントにログイン
    - `generateLink` + `verifyOtp` でパスワードに依存しないセッション確立
  - 同期403エラー修正:
    - pull APIの `userId` チェックを削除（認証済みユーザーIDを使用）
    - クライアントのIndexedDBに古いユーザーIDがキャッシュされていても同期可能に
  - `.env.local` の重複 `SUPABASE_SERVICE_ROLE_KEY=`（空）を削除
  - profileのメールを `gaimon.maam@gmail.com` に更新
- **途中で止まっていること**:
  - 動詞の語法デッキの生徒への配布（`deck_assignments` 未作成）
- **次のセッションで注意すべきこと**:
  - 講師PCログインのパスワードは `tsubame-teacher-2026`（Supabase auth直接設定）
  - LINE認証は `user_metadata.line_user_id` でユーザー検索する方式に変更済み
  - pull APIは `body.userId` を無視して `auth.uid()` を使用する（キャッシュ不整合対策）
  - Google OAuthコールバック（`/callback`）はまだ残存

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
- Google OAuthコールバック（`/callback/route.ts`）がまだ残存（LINE認証安定後に削除予定）
- LINE端末のIndexedDBに古いユーザーIDがキャッシュされる場合がある（pull APIで対処済み、push APIも同様の対処が必要かもしれない）

## 今後のロードマップ概要（優先度順、詳細は ROADMAP.md）
- **Phase 9.3-9.4**: 学習時間トラッキング、習熟度スコア ★次
- **Phase 10**: ゲーミフィケーション
- **Phase 11**: 講師ツール強化
- **Phase 13-14, 16**: コンテンツ効率化、学習モード拡張、コラボレーション
