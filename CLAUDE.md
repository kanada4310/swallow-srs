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

## 現在の進捗（2026-02-18更新）

**Phase 15 FSRS導入 完了 + バグ修正**

### 今回のセッションで完了
- **Phase 15: FSRS（Free Spaced Repetition Scheduler）導入**
  - `ts-fsrs` パッケージ導入、SM-2/FSRS デュアルアルゴリズム対応
  - `DeckSettings.algorithm: 'sm2' | 'fsrs'` でデッキ単位で切替可能
  - `CardSchedule` に FSRS フィールド追加（stability, difficulty, elapsed_days, scheduled_days, last_review）
  - `fsrs-scheduler.ts`: ts-fsrs ラッパー（型変換、パラメータ変換、calculateNextReviewFSRS、getNextIntervalPreviewFSRS）
  - `fsrs-migration.ts`: SM-2→FSRS マイグレーション（stability≈interval、EF→difficulty変換）
  - `/api/decks/[id]/migrate-fsrs`: マイグレーションAPI
  - Dexie.js v8（LocalCardState に FSRS フィールド追加）
  - sync.ts 全面更新（saveAnswerLocally、applyServerCardStates、undoAnswerLocally に FSRS フィールド）
  - answer/undo/push API 更新
  - DeckAdvancedSettings にアルゴリズムタブ追加（FSRS設定: 目標記憶率、最大間隔、ファジング等）
  - SM-2固有設定のFSRSモード時非表示
  - settings-validation にFSRS設定バリデーション追加
  - SQLマイグレーション `013_fsrs_support.sql`（card_states に5カラム追加）
  - テスト43件追加（fsrs-scheduler: 33件、fsrs-migration: 10件、scheduler routing: 4件）、全235件パス
- **バグ修正: SM-2→FSRS未マイグレーションカードの間隔計算**
  - `scheduleToFSRSCard()` で stability=null のレビューカードに SM-2 データから FSRS 値を自動推定
  - stability≈interval、EF→difficulty 変換、elapsed_days/scheduled_days/last_review 推定
- **バグ修正: 新規デッキ作成後の詳細画面遷移**
  - DeckForm で作成成功後に Dexie.js にデッキデータを即座に保存
  - クライアントファーストアーキテクチャでの Dexie 未同期問題を解消

### 次回セッションでやること
1. **Phase 9.3-9.4**: 学習時間トラッキング、習熟度スコア
2. **Phase 10**: ゲーミフィケーション

### 今後のロードマップ概要（優先度順、詳細は ROADMAP.md）
- **Phase 9.3-9.4**: 学習時間トラッキング、習熟度スコア ★次
- **Phase 10**: ゲーミフィケーション
- **Phase 11**: 講師ツール強化
- **Phase 13-14, 16**: コンテンツ効率化、学習モード拡張、コラボレーション

## 参照ドキュメント

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
