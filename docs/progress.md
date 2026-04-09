# 進捗管理

## 現在の作業
- Phase: Phase 17a（学習アプリ統合基盤 — LINE自動ログイン）
- 最終更新: 2026-04-09
- 次にやること:
  1. LINE自動ログインのデプロイ・動作確認（環境変数設定 → Vercelデプロイ → E2Eテスト）
  2. 動詞の語法デッキのセットアップ（ノートタイプ作成 → TSVインポート → 生徒配布）
  3. Phase 9.3-9.4: 学習時間トラッキング、習熟度スコア

## セッション引継ぎメモ

### 2026-04-09（LINE自動ログイン実装）
- **やったこと**:
  - Supabaseプロジェクト復旧（pause → restore）、Google OAuth公開ステータス修正、Site URLスペース修正
  - LINE自動ログイン統合（Phase 17a）のコード実装完了:
    - SRS: `/auth/line` ルートハンドラ（JWT検証 → Supabaseユーザー作成/ログイン → セッション確立）
    - SRS: ログインページを「LINEからログインしてください」に変更
    - SRS: ミドルウェアに `/auth/line` を公開パスとして追加
    - billing: `/api/liff/srs-launch` API（LINE IDトークン検証 → SRS用JWT生成）
    - billing: `/srs` LIFFページ（外部ブラウザでSRS起動）
    - 両プロジェクトに `jose` パッケージ追加、`SRS_AUTH_SECRET` 環境変数追加
  - 両プロジェクトのビルド/型チェック成功確認
- **途中で止まっていること**:
  - **デプロイ前の手動設定が未完了**:
    1. SRS `.env.local` に `SUPABASE_SERVICE_ROLE_KEY` を追加（Supabase Dashboard → Settings → API）
    2. SRS Vercel環境変数に `SRS_AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` を追加
    3. billing Vercel環境変数に `SRS_AUTH_SECRET`, `SRS_APP_URL` を追加
    4. LINEリッチメニューに「学習アプリ」ボタン追加（URL: `https://liff.line.me/{LIFF_ID}/srs`）
  - ローカル・本番での動作確認（E2Eテスト）が未実施
- **次のセッションで注意すべきこと**:
  - `SUPABASE_SERVICE_ROLE_KEY` がSRS `.env.local` に入っていないとLINE認証ルートが動かない
  - billing側のビルドはメモリ不足になりやすい。`NODE_OPTIONS="--max-old-space-size=4096"` が必要
  - Google OAuthのコールバックルート（`/callback`）はまだ残している。LINE認証が安定したら削除可能

### 2026-04-09（前半）
- 動詞の語法デッキのインポート準備（TSV生成済み、UI手作業は未完了）

### 2026-02-19
- TTS設定デッキ移動 + 通知UI整理 完了
- テンプレートTTSプレースホルダー実装
- TTSプリフェッチ実装

## 既知の課題
- billing側のビルドがWindows環境でOOMになることがある（`--max-old-space-size=4096` で回避）
- Google OAuthコールバック（`/callback/route.ts`）がまだ残存（LINE認証安定後に削除予定）

## 今後のロードマップ概要（優先度順、詳細は ROADMAP.md）
- **Phase 17a**: LINE自動ログイン — デプロイ・動作確認 ★次
- **Phase 9.3-9.4**: 学習時間トラッキング、習熟度スコア
- **Phase 10**: ゲーミフィケーション
- **Phase 11**: 講師ツール強化
- **Phase 13-14, 16**: コンテンツ効率化、学習モード拡張、コラボレーション
