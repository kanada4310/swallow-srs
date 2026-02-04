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
- [x] CSVパーサー
- [x] マッピングUI
- [x] バリデーション・エラー表示
- [x] 一括インポート処理

---

## Phase 3: オフライン対応

### 3.1 ローカルDB
- [x] Dexie.js スキーマ定義
- [x] ローカル保存ロジック

### 3.2 同期
- [x] sync_queue 実装
- [x] オンライン検知
- [x] 競合検知・解決UI（ローカル/サーバー選択）

### 3.3 PWA
- [x] Service Worker
- [x] オフラインページ
- [x] インストール促進

---

## Phase 4: LLM連携

### 4.1 音声生成（TTS）
- [x] OpenAI TTS 統合
- [x] 単語の発音音声生成
- [x] 例文の読み上げ音声生成
- [x] Supabase Storageへの音声保存
- [x] TTS設定UI（ボイス選択、速度調整）
- [x] オフラインキャッシュ対応

### 4.2 例文生成
- [x] Claude API統合（Anthropic SDK）
- [x] 単語から例文・コロケーション自動生成
- [x] 一括生成機能（デッキ詳細ページから）
- [x] 学習画面での例文表示

### 4.3 OCR（画像→テキスト）
- [x] Claude Vision 統合
- [x] 単語帳写真からのテキスト抽出
- [x] 抽出結果のレビュー・編集UI

---

## Phase 5: 拡張機能

### 5.1 統計
- [x] 学習統計ページ
- [x] グラフ表示（Recharts使用）
- [x] 詳細統計API（日別復習数、カード分布、正答率推移、デッキ別進捗）
- [x] 期間選択UI（7日/14日/30日）
- [x] オフライン統計対応（Dexie.jsから計算）

### 5.2 ノートタイプ拡張
- [x] カスタムノートタイプ作成UI（/note-types/new）
- [x] テンプレートエディタ（HTML/CSS編集、プレースホルダー挿入）
- [x] フィールドエディタ（追加/削除/並び替え、TTS・例文設定）
- [x] ライブプレビュー（サンプルデータで表示確認）
- [x] ノートタイプ一覧・編集・削除UI
- [x] 既存コンポーネント対応（NoteEditor, StudyCard）
- [x] API対応（TTS, 例文生成のフィールドメタデータ対応）

### 5.3 CSVエクスポート
- [x] CSV生成ユーティリティ（UTF-8 BOM、CRLF、フィールドエスケープ）
- [x] エクスポートAPIエンドポイント（GET /api/decks/[id]/export）
- [x] デッキ詳細ページにエクスポートボタン追加
- [x] ユニットテスト（17件パス）

---

## Phase 6: UX改善 & パフォーマンス最適化

### 6.1 学習体験の高速化 ★最優先 ✅ 完了
カード切り替え遅延の解消とスムーズな学習フローの実現。

- [x] サーバー同期を非ブロッキング化（`await fetch` → fire-and-forget）
  - 原因: StudySession.tsx:121 の `await fetch` が次カード表示(行143)をブロック
  - 修正: `setCurrentIndex` をサーバーfetch前に移動、fetchはバックグラウンド実行
- [x] 学習完了画面の `<a>` タグを `<Link>` に変更（ソフトナビゲーション）
  - 対象: StudySession.tsx:179, 204
- [x] 学習ページのローディングスケルトン追加
  - カードデータ取得中にスケルトンUI表示

### 6.2 ページ遷移パフォーマンス改善 ★高優先 ✅ 完了
N+1クエリ解消とページ遷移時の体感速度向上。

- [x] デッキ一覧のN+1クエリ解消
  - 原因: decks/page.tsx でデッキ毎にカード数・状態を個別クエリ（10デッキ=32クエリ）
  - 修正: Promise.allバッチクエリで4クエリに集約、クライアント側で集計
- [x] 講師ダッシュボードのN+1クエリ解消
  - 原因: page.tsx で生徒毎に5クエリ（50生徒=252クエリ）
  - 修正: Promise.allバッチクエリで10クエリに集約、クライアント側で集計
- [x] ミドルウェアのプロフィールチェック最適化
  - 原因: 全リクエストでprofileテーブルをSELECT
  - 修正: Cookieキャッシュ（24時間有効）で初回のみDB問い合わせ
- [x] `router.refresh()` を楽観的UI更新に置換
  - DeckDetailClient.tsx: Supabaseクライアントからノートのみ部分更新
- [x] デッキ一覧・ダッシュボードにローディングスケルトン追加

### 6.3 オフライン完全対応 ★高優先 ✅ 完了
オフライン時でもホーム→デッキ一覧→学習の全フローが動作するようにする。
Webアプリでも、Service Workerによるページキャッシュ + IndexedDBのローカルデータで実現可能。

- [x] 学習ページのクライアントサイドフォールバック
  - StudyPageClient: initialCards有無でオンライン/オフライン自動切替
  - getStudyCardsOffline() でIndexedDBからカードデータ取得
- [x] デッキデータ事前キャッシュの実装
  - `/api/decks/[id]/offline-data` APIエンドポイント作成
  - `usePrefetchAllDecks()` フックでデッキ一覧表示時にバックグラウンドプリフェッチ
  - `usePrefetchDeck()` でcardStatesも保存するよう強化
- [x] オフライン時のデッキ一覧表示
  - DecksPageClient: initialDecks有無で自動切替
  - getDecksWithStatsOffline() でIndexedDBから集計
- [x] Service Workerのルートキャッシュ強化
  - `/decks`, `/study` ページをNetworkFirst（10秒タイムアウト、1日キャッシュ）

### 6.4 OCRカスタムノートタイプ対応
OCR読み取り結果をカスタムノートタイプのフィールドに動的マッピング。

- [ ] OCRImporterにノートタイプ選択UIを追加
  - 現状: `BASIC_NOTE_TYPE_ID` にハードコード（OCRImporter.tsx:6）
  - 修正: デッキのノートタイプまたはユーザー選択で決定
- [ ] OCR抽出結果の動的フィールドマッピング
  - フィールドメタデータ（`example_source`, `example_context`等）を活用
  - OCR結果（word, meaning, extra）を対応フィールドに自動マッピング
- [ ] Claude Visionプロンプトのノートタイプ対応
  - フィールド構成に応じて抽出プロンプトをカスタマイズ
  - 例: 3フィールド（単語・品詞・意味）なら品詞も抽出
- [ ] フィールドマッピングのレビュー・編集UI
  - 抽出後にユーザーがフィールド割り当てを修正可能

### 6.5 例文生成フィールド対応
フィールドメタデータに基づいた柔軟な例文生成。

- [ ] フィールド→フィールド例文生成
  - 現状: generated_content（フィールド外データ）として一括保存
  - 修正: 指定フィールドを参照し、指定フィールドに例文を出力
  - フィールド設定: `example_source`（参照元）→ `example_target`（出力先）を追加
- [ ] 一括生成UIのフィールドメタデータ対応
  - 現状: ExampleGenerator.tsx:217 で 'Front' にハードコード
  - 修正: ノートタイプのフィールドメタデータから参照・出力先を自動検出
- [ ] 例文をフィールド値として直接保存
  - field_values に例文フィールドとして保存（テンプレートで `{{Examples}}` として使用可能）
- [ ] 既存generated_contentからの移行パス検討

---

## 現在の進捗

**Phase**: Phase 6.3 オフライン完全対応 動作確認待ち
**最終更新**: 2026-02-04
**次のタスク**: Phase 6.3 動作確認 → Phase 6.4 OCRカスタムノートタイプ対応

### 次回セッションでやること

Phase 6 を以下の優先順で実装：
1. ~~**Phase 6.1**: 学習体験の高速化（カード切り替え遅延解消）~~ ✅ 完了
2. ~~**Phase 6.2**: ページ遷移パフォーマンス改善（N+1クエリ解消）~~ ✅ 完了
3. ~~**Phase 6.3**: オフライン完全対応~~ ✅ 実装完了（動作確認待ち）
4. **Phase 6.4**: OCRカスタムノートタイプ対応
5. **Phase 6.5**: 例文生成フィールド対応

### 既知の問題（技術的詳細）
- **OCR Basic固定**: OCRImporter.tsx:6 でハードコード
- **例文生成Front固定**: ExampleGenerator.tsx:217 でハードコード

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
- [x] CSVインポート機能（CSVパーサー、マッピングUI、バリデーション、一括インポート）
- [x] Phase 3.1 ローカルDB（Dexie.jsスキーマ定義、ローカル保存ロジック）
- [x] Phase 3.2 同期（sync_queue実装、オンライン検知、競合検知・解決UI）
- [x] Phase 3.3 PWA対応（Service Worker、オフラインページ、インストール促進UI）
- [x] Phase 3 動作確認完了・Dexieスキーマバグ修正（syncQueueにattemptsインデックス追加）
- [x] Phase 4.1 TTS音声生成（OpenAI TTS統合、音声再生ボタン、設定UI、オフラインキャッシュ）
- [x] Phase 4.2 例文生成（Claude API統合、一括生成機能、学習画面表示）
- [x] Phase 4.2 動作確認完了（Supabaseマイグレーション適用、ANTHROPIC_API_KEY設定、一括生成・学習画面表示確認）
- [x] Phase 4.3 OCR機能（Claude Vision統合、写真から単語抽出、レビュー・編集UI、デッキ詳細ページ統合）
- [x] Phase 4.3 動作確認完了
- [x] Phase 5.1 統計ページ（Recharts導入、詳細統計API、グラフコンポーネント6種類、期間選択UI、オフライン統計対応）
- [x] Phase 5.1 動作確認完了
- [x] Phase 5.2 ノートタイプ拡張（カスタムノートタイプ作成UI、フィールド/テンプレートエディタ、ライブプレビュー、API対応）
- [x] Phase 5.2 動作確認完了（カスタムノートタイプ→ノート追加→学習のフロー確認、バグ修正）
- [x] Phase 5.3 CSVエクスポート（CSV生成ユーティリティ、エクスポートAPI、デッキ詳細ボタン、テスト17件）
- [x] Phase 5.3 動作確認完了
- [x] Phase 6.1 学習体験の高速化（カード切り替え非ブロッキング化、Link変更、ローディングスケルトン）
- [x] Phase 6.1 動作確認完了
- [x] Phase 6.2 ページ遷移パフォーマンス改善（N+1クエリ解消、ミドルウェア最適化、楽観的UI、スケルトン）
- [x] Phase 6.2 動作確認完了
- [x] Phase 6.3 オフライン完全対応（StudyPageClient、DecksPageClient、offline-data API、usePrefetchAllDecks、SW強化）
