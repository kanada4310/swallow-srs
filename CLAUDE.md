# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**つばめSRS** - 塾（つばめ学習舎）向けのWeb版SRS学習アプリ
- コンセプト: **Web版Anki + 塾向け講師機能**
- 生徒数: 約40-50名
- デバイス: スマホ・タブレット中心

## 技術スタック

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend**: Supabase（認証・PostgreSQL・ストレージ）
- **Offline**: Dexie.js（IndexedDB）
- **Hosting**: Vercel
- **Auth**: Googleログイン

## 開発コマンド

```bash
npm run dev          # 開発サーバー (localhost:3000)
npm run build        # プロダクションビルド
npm run lint         # ESLint
npm run test         # Vitest 実行
npm run test:watch   # Vitest 監視モード
```

## 開発環境

- **Supabase**: クラウドのみ（ローカルDocker不使用）
- **テスト**: Vitest

## コア設計方針

### SRS
- SM-2アルゴリズム
- 1日の区切り: 午前4時
- Anki方式で1日N枚の新規カード自動導入

### データ同期
- オフラインファースト（Dexie.js → Supabase）
- 競合時: AnkiWeb方式（ユーザーが選択）

### ノートタイプ
- Anki互換（HTML/CSSテンプレート）
- Phase 1: Basic（英↔和）、Cloze（穴埋め）

### デッキ権限
- 配布デッキ: 講師が管理
- 個人デッキ: 生徒が自由作成

### セキュリティ
- HTMLテンプレート: サニタイズ必須

## LLM連携（Phase 4）

- **TTS**: 単語・例文の音声生成（OpenAI TTS） ✅ 完了
- **例文生成**: 単語から例文・コロケーション自動生成（Claude API） ✅ 完了
- **OCR**: 単語帳写真→テキスト抽出（Claude Vision） ✅ 完了

## 統計機能（Phase 5.1）

- **学習統計ページ**: `/stats` で学習統計を表示 ✅ 完了
- **グラフライブラリ**: Recharts（日別復習数、カード分布、正答率推移）
- **期間選択**: 7日/14日/30日
- **オフライン対応**: Dexie.jsから統計計算可能

## ノートタイプ拡張（Phase 5.2）

- **カスタムノートタイプ作成UI**: `/note-types` で講師がノートタイプを管理 ✅ 完了
- **フィールドエディタ**: フィールド追加/削除/並び替え、設定（TTS、例文生成ソース）
- **テンプレートエディタ**: HTML/CSS編集、プレースホルダー挿入
- **ライブプレビュー**: サンプルデータでテンプレート表示確認

## CSVエクスポート（Phase 5.3）

- **エクスポートAPI**: `GET /api/decks/[id]/export` で講師がデッキのノートをCSVダウンロード ✅ 完了
- **フォーマット**: UTF-8 BOM付きCSV（Excel対応、CRLF改行）
- **複数ノートタイプ対応**: フィールド列は全ノートタイプの和集合、先頭に「ノートタイプ」列
- **権限**: 講師のみ（デッキオーナー or admin）
- **UI**: デッキ詳細ページに「CSVエクスポート」ボタン

## UX改善 & パフォーマンス最適化（Phase 6）

### 6.1 学習体験の高速化 ★最優先
- **カード切り替え遅延解消**: `await fetch` → fire-and-forget（StudySession.tsx:121）
- **ソフトナビゲーション**: `<a>` → `<Link>` に変更
- **ローディングスケルトン**: 学習ページのカードデータ取得中に表示

### 6.2 ページ遷移パフォーマンス改善
- **N+1クエリ解消**: デッキ一覧（デッキ毎3クエリ）、講師ダッシュボード（生徒毎5クエリ）
- **ミドルウェア最適化**: 毎リクエストのprofile DBチェックを削減
- **楽観的UI更新**: `router.refresh()` → state更新

### 6.3 オフライン完全対応
- **学習ページ**: Server Component → Client Component フォールバック（Dexie.js）
- **デッキデータ事前キャッシュ**: `/api/decks/[id]/offline-data` + `usePrefetchDeck()`
- **オフラインデッキ一覧**: IndexedDBからデッキ表示

### 6.4 OCRカスタムノートタイプ対応 ✅ 完了
- ノートタイプ選択UI、動的フィールドマッピング、Vision プロンプトカスタマイズ

### 6.5 AI生成ルール対応 ✅ 完了
- ノートタイプに `generation_rules` を定義（参照フィールド・指示・出力先）
- 一括生成UIでルール選択、結果を `field_values` に直接保存
- レガシーモード（generated_content）との後方互換を維持

## オフライン完全対応（Phase 6.3 + 強化）

- **OfflineNavProvider**: オフライン時のクライアントサイドナビゲーション（`src/contexts/OfflineNavContext.tsx`）
  - 全ページコンポーネントをeager importでバンドル（ネットワーク不要）
  - キャプチャフェーズでリンククリック横取り → Next.js MPA フォールバック防止
  - 動的ルートパターンマッチング（`/decks/[id]`、`/note-types/[id]`、`/students/class/[id]`）
  - ブラウザ更新ボタン防止（Navigation API + beforeunload + F5/Ctrl+R）
  - `history.pushState` でURL更新、popstateで戻る/進む対応
- **AuthContext オフライン強化**: トークンリフレッシュ失敗時のSIGNED_OUT無視、IndexedDBフォールバック
- **動的ルートフォールバック**: `useParams()`/`useSearchParams()` が空の場合に `window.location` から取得
- **error.tsx**: 全ルートにエラーバウンダリ追加（`createErrorBoundary`ユーティリティ）
- **StudyPageClient**: `src/app/(student)/study/StudyPageClient.tsx` - initialCards有無でオンライン/オフライン切替
- **DecksPageClient**: `src/app/(student)/decks/DecksPageClient.tsx` - initialDecks有無で切替
- **offline-data API**: `GET /api/decks/[id]/offline-data` - デッキの全データを1回で取得
- **プリフェッチ**: `usePrefetchAllDecks()` でデッキ一覧表示時に全デッキをバックグラウンドキャッシュ
- **Service Worker**: 静的アセットのキャッシュ（ページナビゲーションキャッシュはRSC競合のため削除）

## クライアントファースト化（Phase 12） ✅ 完了

- **AuthProvider**: グローバル認証コンテキスト（`src/contexts/AuthContext.tsx`）。Dexie即時ロード + Supabase更新
- **useDexieQuery**: stale-while-revalidate パターンの汎用フック（`src/lib/db/useDexieQuery.ts`）
- **全ページClient Component化**: 全13ページを`'use client'`に変換、Dexie.jsプライマリ
- **SyncIndicator**: ヘッダーに同期状態インジケーター（`src/components/ui/SyncIndicator.tsx`）
- **Dexie v7**: classes, classMembers, deckAssignments テーブル追加
- **Pull API拡張**: classes, classMembers, deckAssignments, userDeckSettings を同期対象に追加
- **バックグラウンド同期**: 5分間隔 + タブフォーカス時 + 初回ログイン時

## Web Push通知（Phase 12.3）

- **通知設定UI**: `/settings/notifications` ページに通知ON/OFF、テスト送信ボタン
- **VAPID鍵**: `.env.local` + Vercel環境変数に `NEXT_PUBLIC_VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`
- **Cron**: Vercel Cron で毎日22:00 UTC (07:00 JST) に送信（`vercel.json`）
- **Service Worker**: `worker/index.ts` にpush/notificationclickハンドラ（@ducanh2912/next-pwa が自動ビルド）
- **SQLマイグレーション**: `014_push_notifications.sql`（push_subscriptions, notification_settings, notification_logs）
- **環境変数**: `CRON_SECRET`（Cron認証用）、`SUPABASE_SERVICE_ROLE_KEY`（RLSバイパス用）

## TTS設定（デッキ単位）

- **DeckSettings**: `tts_voice`（6種: alloy/echo/fable/onyx/nova/shimmer）、`tts_speed`（0.25〜4.0）
- **DeckAdvancedSettings「音声」タブ**: ボイス選択グリッド、速度ボタン（0.5x/0.75x/1.0x/1.25x）、テスト再生
- **テンプレートプレースホルダー**: `{{tts:FieldName}}` でカード内に音声ボタンを自由配置
- **TTSプリフェッチ**: カード表示時にバックグラウンドでTTS生成・IndexedDBキャッシュ
- **TTS API skipSave**: テスト再生用にnote不要のbase64データURL返却モード

## 現在の進捗

詳細は @docs/progress.md を参照。

- **最終更新**: 2026-04-10
- **次にやること**: LINE自動ログインのデプロイ・動作確認（環境変数+billingメニュー追加待ち） → 動詞の語法デッキ → Phase 9.3-9.4

## 参照ドキュメント

- @docs/progress.md - 進捗管理・セッション引継ぎ
- @docs/ARCHITECTURE.md - 詳細設計・DB スキーマ
- @docs/ROADMAP.md - 開発ロードマップ

## 機能実装フロー（必ず守ること）

機能を1つ実装するたびに、以下のサイクルを必ず実行する：

1. **実装**: コード変更・テスト確認・ビルド確認
2. **動作確認**: `npm run dev` で開発サーバー起動 → ユーザーが確認
3. **セッション終了手順**（動作確認後に必ず実行）:
   - ドキュメント更新（CLAUDE.md の進捗・ROADMAP.md のチェックボックス）
   - 開発サーバー停止（TaskStop でkill）
   - 変更をコミット・プッシュ

## セッション終了時のルール

- **必ずコミット・プッシュする**: セッション終了前に未コミットの変更がある場合は、コミットしてGitHubにプッシュすること
- コミットメッセージは変更内容を簡潔に説明する
- **キャッシュクリア**: セッション終了時に `.next` フォルダを削除する（次回セッションでのフリーズ防止）
  ```bash
  rm -rf .next
  ```

## 禁止事項

- `dangerouslySetInnerHTML` を未サニタイズで使用しない
- Supabase RLS をバイパスするクエリを書かない
- 同期処理で `updated_at` を無視しない
