# 開発ロードマップ

## Phase 1: MVP（最小限の動作版）

### 1.1 環境構築
- [x] Next.js 14 プロジェクト初期化
- [x] Tailwind CSS セットアップ
- [x] Vitest セットアップ
- [x] Supabase プロジェクト作成（クラウド）
- [x] Googleログイン設定（Google Cloud Console）
- [x] 環境変数設定（.env.local）

### 1.2 認証
- [x] Supabase Auth + Googleログイン設定
- [x] ログイン/ログアウトページ
- [x] プロフィール作成フロー（role選択）
- [x] 認証ミドルウェア

### 1.3 データベース
- [x] Supabaseスキーマ作成（SQL実行）（profilesテーブルのみ）
- [x] RLSポリシー設定（profilesテーブルのみ）
- [x] 残りのスキーマSQL作成（supabase/migrations/001_initial_schema.sql）
- [x] 残りのスキーマSQL実行（classes, note_types, decks, cards等）
- [ ] 型定義自動生成

### 1.4 基本UI
- [x] レイアウト（ヘッダー、ナビ）
- [x] ダッシュボードページ
- [x] デッキ一覧ページ（機能実装）
- [x] カード学習画面（基本）

### 1.5 SRSコア
- [x] SM-2アルゴリズム実装
- [x] card_states 更新ロジック
- [x] 今日の復習カード取得

### 1.6 ノートタイプ
- [x] Basic テンプレート実装（DB初期データとして）
- [x] テンプレートレンダリング（HTMLサニタイズ）
- [x] Cloze テンプレート実装（DB初期データとして）

---

## Phase 2: 講師機能

### 2.1 講師ダッシュボード
- [x] 生徒一覧・進捗表示
- [x] クラス管理

### 2.2 デッキ管理
- [x] デッキ作成・編集UI
- [x] ノート追加UI
- [x] デッキ配布（クラス/個人）

### 2.3 CSVインポート
- [ ] CSVパーサー
- [ ] マッピングUI
- [ ] バリデーション・エラー表示
- [ ] 一括インポート処理

---

## Phase 3: オフライン対応

### 3.1 ローカルDB
- [ ] Dexie.js スキーマ定義
- [ ] ローカル保存ロジック

### 3.2 同期
- [ ] sync_queue 実装
- [ ] オンライン検知
- [ ] 競合検知・解決UI（ローカル/サーバー選択）

### 3.3 PWA
- [ ] Service Worker
- [ ] オフラインページ
- [ ] インストール促進

---

## Phase 4: LLM連携

### 4.1 音声生成（TTS）
- [ ] OpenAI TTS / Google Cloud TTS 統合
- [ ] 単語の発音音声生成
- [ ] 例文の読み上げ音声生成
- [ ] Supabase Storageへの音声保存

### 4.2 例文生成
- [ ] Claude / GPT-4 API統合
- [ ] 単語から例文・コロケーション自動生成
- [ ] 生成結果の編集UI

### 4.3 OCR（画像→テキスト）
- [ ] Claude Vision / GPT-4 Vision 統合
- [ ] 単語帳写真からのテキスト抽出
- [ ] 抽出結果のレビュー・編集UI

---

## Phase 5: 拡張機能

### 5.1 統計
- [ ] 学習統計ページ
- [ ] グラフ表示

### 5.2 ノートタイプ拡張
- [ ] カスタムノートタイプ作成UI
- [ ] テンプレートエディタ

### 5.3 その他
- [ ] エクスポート機能

---

## 現在の進捗

**Phase**: Phase 2 完了、Phase 3 準備中
**最終更新**: 2026-02-02
**次のタスク**: CSVインポート機能、オフライン対応（Phase 3）

### 次回セッションで最初にやること
1. CSVインポート機能（CSVパーサー、マッピングUI、バリデーション）
2. Phase 3: オフライン対応（Dexie.js、sync_queue）

### 既知の問題
- なし

### 完了済み
- [x] プロジェクト設計（DB、SRS、ノートタイプ等）
- [x] Claude Code開発アーキテクチャ整備
- [x] Git初期化 & GitHubプッシュ
- [x] Phase 1.1 環境構築（Next.js 14, Tailwind, Vitest, Supabase）
- [x] Phase 1.2 認証（Googleログイン、プロフィール設定）
- [x] Phase 1.3 データベース（profilesテーブル、RLS）
- [x] Phase 1.4 基本UI（ダッシュボード、レイアウト、ナビゲーション）
- [x] 残りのDBスキーマSQL作成・実行（classes, note_types, decks, cards等）
- [x] 認証ミドルウェア強化（ルート保護、プロフィールチェック）
- [x] デッキ一覧ページ機能実装（自分のデッキ表示、学習状況バッジ）
- [x] カード学習画面実装（フリップ、回答ボタン、進捗表示、完了画面）
- [x] SM-2アルゴリズム実装（テスト22件パス）
- [x] 学習回答API（card_states更新、review_logs記録）
- [x] 型定義ファイル作成（src/types/database.ts）
- [x] テストデータで動作確認完了
- [x] テンプレートレンダリング機能実装（HTMLサニタイズ、Cloze対応、テスト33件追加）
- [x] RLSポリシー修正SQL作成・適用（002_fix_rls_policies.sql）
- [x] デッキ作成API・UI実装（POST /api/decks、/decks/new）
- [x] ノート追加API・UI実装（POST /api/notes、NoteEditorコンポーネント）
- [x] デッキ詳細ページ実装（/decks/[id]、ノート一覧表示）
- [x] クラス管理API実装（CRUD、メンバー管理）
- [x] クラス管理UI実装（/students、クラス作成・編集・削除、生徒追加・削除）
- [x] デッキ配布機能（クラス/個人への配布、配布解除）
- [x] 講師ダッシュボード強化（生徒の学習進捗表示、統計情報）
