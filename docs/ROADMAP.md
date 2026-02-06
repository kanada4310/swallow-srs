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
  - ページナビゲーションキャッシュはNext.js RSCペイロードと競合するため削除
  - オフライン学習はerror.tsx境界 + IndexedDBフォールバックで実現
  - 静的アセット（JS/CSS/画像）のキャッシュは維持

### 6.4 OCRカスタムノートタイプ対応 ✅ 完了
OCR読み取り結果をカスタムノートタイプのフィールドに動的マッピング。

- [x] OCRImporterにノートタイプ選択UIを追加
  - ノートタイプセレクトボックス（フィールド数表示付き）
  - 選択したノートタイプのフィールド一覧を表示
- [x] OCR抽出結果の動的フィールドマッピング
  - フィールド定義をClaude Vision APIに送信
  - レスポンスを `{fields: Record<string, string>}` 形式でパース
  - レガシーモード（word/meaning/extra）との後方互換を維持
- [x] Claude Visionプロンプトのノートタイプ対応
  - フィールド構成に応じてシステムプロンプト・ユーザープロンプトを動的生成
  - フィールド名から抽出内容をClaudeが推測
- [x] フィールドマッピングのレビュー・編集UI
  - レビューテーブルの列をノートタイプのフィールドに応じて動的生成
  - 各フィールドをクリックで編集可能
  - 手動エントリ追加も全フィールド対応

### 6.5 AI生成ルール対応 ✅ 完了
ノートタイプレベルでAI生成ルールを定義し、柔軟なフィールド生成を実現。

- [x] ノートタイプに `generation_rules` カラム追加（DBマイグレーション 006）
  - GenerationRule: 参照フィールド（複数）、生成指示、出力先フィールドを定義
- [x] GenerationRuleEditorコンポーネント作成
  - ルール追加/削除、参照フィールド選択（複数チェック）、指示テキスト、出力先選択
  - NoteTypeEditorClientに「AI生成」ステップとして統合
- [x] 一括生成UIのルール対応
  - BulkExampleGeneratorをリライト: ルール選択UI、ルールベース一括生成
  - レガシーモード（generated_content）との後方互換を維持
- [x] generate-examples APIのルール対応
  - ruleIdパラメータで生成ルール指定、結果をfield_valuesに直接保存
  - テンプレートで `{{Examples}}` として使用可能
- [x] フィールド設定のレガシーチェックボックス削除
  - example_source/example_contextチェックボックスを削除（生成ルールに吸収）

---

## Phase 7: ユーザー要望機能

### 7.1 削除機能 ✅ 完了
ノート・ノートタイプ・デッキの削除機能を実装。

- [x] ノート単体削除API（DELETE /api/notes/[id]）
- [x] ノート一括削除API（POST /api/notes/bulk-delete）
- [x] デッキ削除API（DELETE /api/decks/[id]）
  - 配布先がある場合は削除ブロック（先に配布解除が必要）
- [x] デッキ詳細ページにノート削除UI
  - 各ノートカードにゴミ箱アイコン（単体削除）
  - 選択モード → チェックボックス → 一括削除
  - 確認モーダル付き
- [x] デッキ詳細ページにデッキ削除UI（ページ最下部）
- [x] デッキ一覧ページにデッキ削除UI（マイデッキにゴミ箱アイコン）
- [x] ノートタイプ一覧ページに削除ボタン追加
  - ノート参照がある場合は削除ブロック
- [x] IndexedDBクリーンアップヘルパー（deleteNoteLocally, deleteNotesLocally, deleteDeckLocally）
- [x] カードテンプレート削除は既存のノートタイプ編集内で対応済み

### 7.2 ノートブラウズ・編集機能 ✅ 完了
デッキ詳細ページにノートの検索・フィルタ・ソート・ページネーション機能と、ノート編集モーダルを実装。

- [x] ノート更新API（PUT /api/notes/[id]）
  - field_values更新、Clozeカード数の自動調整（追加/削除）
- [x] ノート検索API（GET /api/notes/search）
  - Postgres RPC関数 `search_notes` でJSONBテキスト検索
  - deckId, q, noteTypeId, sort/order, offset/limit対応
- [x] NoteCardコンポーネント抽出（src/components/deck/NoteCard.tsx）
  - 編集ボタン（鉛筆アイコン）追加
  - BrowsableNote型をexport
- [x] NoteEditModalコンポーネント（src/components/deck/NoteEditModal.tsx）
  - フィールド編集、Clozeカード数変更の警告表示
  - 保存後IndexedDB同期
- [x] NoteBrowserコンポーネント（src/components/deck/NoteBrowser.tsx）
  - テキスト検索（300msデバウンス）
  - ノートタイプフィルタ、作成日ソート切替
  - 50件ずつページネーション（「もっと読み込む」）
  - 選択モード＋一括削除
- [x] DeckDetailClient.tsxリファクタリング
  - インラインNoteCard/削除ロジックをNoteBrowser+NoteEditModalに置換
- [x] page.tsxにページネーション追加（.range(0, 49) + count: 'exact'）
- [x] IndexedDBヘルパー追加（updateNoteLocally）
- [x] DBマイグレーション（007_search_notes_function.sql）

### 7.3 LLMベース テキストタグ付け機能 ✅ 完了
既存のgeneration_rules基盤を活用し、LLMで例文・和訳にHTMLタグやCloze記法を自動付与する機能。

- [x] タグ付けプリセット定義（src/lib/tagging/presets.ts）
  - Cloze化: 見出し語を `{{c1::word::hint}}` 形式に変換
  - コロケーション強調: コロケーションを `<b></b>` で囲む
  - 和訳対応語強調: 和訳中の対応語を `<b></b>` で囲む
- [x] GenerationRuleEditorにプリセット選択ドロップダウン追加
  - 「空のルール」「Cloze化」「コロケーション強調」「和訳対応語強調」から選択
  - プリセット選択時にname/instruction/source_fields/target_fieldを自動入力
- [x] generate-examples APIにfieldValuesOverrideパラメータ追加
  - モーダル内の未保存フィールド値でも生成可能に
  - override時はDB保存をスキップ（モーダル側で保存）
- [x] NoteEditModalにAI生成セクション追加（折りたたみ式）
  - 個別ルール「生成」/「再生成」ボタン
  - 「すべて生成」一括実行ボタン
  - 生成結果をフィールドに即反映、保存ボタンでDB保存
- [x] NoteCardにワンタッチ生成ボタン追加（稲妻アイコン）
  - generation_rulesがあるノートタイプのみ表示
  - 全ルールを順次実行、完了後にノートデータ再取得

### 7.4 Anki互換機能強化（サブデッキ + ノートタグ） ✅ 完了
サブデッキ（デッキ階層構造）とノートタグ機能を実装。

- [x] DBマイグレーション（008_subdecks_and_tags.sql）
  - `get_descendant_deck_ids` RPC関数（再帰CTE）
  - notes.tags TEXT[]カラム + GINインデックス
  - `search_notes` RPC更新（p_tag, tags返却）
  - `get_deck_tags` / `bulk_update_tags` RPC関数
- [x] サブデッキ
  - POST /api/decks: parentDeckId対応、深度3制限バリデーション
  - DELETE /api/decks/[id]: 子デッキ存在時は削除ブロック
  - 学習ページ: RPC get_descendant_deck_idsで全子孫デッキのカードを取得
  - デッキ一覧: ツリー構造表示（インデント+集計カード数）
  - デッキ作成UI: 親デッキ選択ドロップダウン、?parent=IDクエリパラメータ
  - デッキ詳細: サブデッキ一覧セクション、「サブデッキを作成」ボタン
  - Dexie.js: parent_deck_idインデックス、getDescendantDeckIds()、オフライン学習対応
- [x] ノートタグ
  - POST /api/notes: tags対応
  - PUT /api/notes/[id]: tags対応
  - GET /api/notes/search: tag filter対応
  - POST /api/notes/bulk-tags: 一括タグ追加/削除API
  - NoteCard: タグピルバッジ表示
  - NoteEditModal: タグ編集セクション（入力+オートコンプリート）
  - NoteBrowser: タグフィルタドロップダウン、選択モードで一括タグ操作
  - Dexie.js: *tags MultiEntryインデックス、updateNoteTagsLocally()

### 7.5 学習カスタマイズ（Anki互換デッキオプション） ✅ 完了
デッキごとにAnki本家相当の学習設定（学習ステップ、間隔倍率、リーチ検知等）をカスタマイズ可能に。

- [x] DeckSettings型定義（17設定項目: 新規カード/復習/失念/表示順）
- [x] resolveDeckSettings()でPartial→完全オブジェクト変換（後方互換）
- [x] 設定バリデーション（settings-validation.ts、範囲チェック）
- [x] scheduler.tsリファクタリング（全関数にsettingsパラメータ追加）
  - calculateNextReview/getNextIntervalPreview にsettings引数追加
  - learning_steps、graduating/easy_interval、interval_modifier、max_interval対応
  - hard_interval_modifier、easy_bonus対応
  - lapse_new_interval、lapse_min_interval対応
  - リーチ検知（checkLeech: threshold+suspend/tagアクション）
- [x] schedulerテスト（41テスト: カスタム設定の全パターン）
- [x] DBマイグレーション（009_leech_support.sql: lapses列+suspended状態）
- [x] Dexie.js v5（LocalCardStateにlapses追加、upgradeで既存データ初期化）
- [x] カード並び順ロジック（card-ordering.ts: review_sort/new_card_order/new_review_mix）
- [x] 学習ページ更新（オンライン/オフライン: orderStudyCards使用、suspended除外）
- [x] answer API更新（デッキ設定読み込み、lapses保存、リーチ検知・tag/suspend）
- [x] sync.ts更新（saveAnswerLocallyにlapses対応）
- [x] StudySession更新（deckSettings prop、リーチ通知トースト、suspend対応）
- [x] DeckAdvancedSettingsコンポーネント（4タブ: 新規/復習/失念/表示順）
- [x] DeckForm統合（advancedSettings、レガシーnewCardsPerDay後方互換）
- [x] decks API更新（settings全体保存、バリデーション）

### 7.6 ノートブラウザ強化 + コピー/移動機能 🔧 作業中
全デッキ横断のノート検索・管理機能と、ノートのコピー/移動機能。

- [x] BrowsableNote型にdeck_id追加、NoteCardにデッキ名バッジ表示
- [x] 検索API修正（配布デッキも検索対象: 直接配布＋クラス経由）
- [x] bulk-delete / bulk-tags API: deckId任意化（クロスデッキ対応）
- [x] コピー/移動API（POST /api/notes/copy-move）
  - copy: 新規note+cards作成（Cloze/Basic対応）
  - move: deck_id更新（card_states維持=学習進捗保持）
- [x] DeckSelectorModalコンポーネント（デッキ選択モーダル）
- [x] NoteBrowserクロスデッキ対応（deckId任意化、deckNameMap、コピー/移動ボタン）
- [x] DeckDetailClientにコピー/移動ハンドラ追加
- [x] **専用ページ化（/notes）**: デッキ一覧埋め込みから独立ページに移行
  - ナビゲーションメニューに「ノート」ボタン追加
  - 全ノート検索結果が少ない問題の調査・修正
  - DecksPageClientから簡易検索UI撤去
- [x] CSVエクスポート（POST /api/notes/export）
  - 全アクセス可能デッキのノートをCSV出力（講師/管理者のみ）
  - /notesページにCSVエクスポートボタン追加

---

## 現在の進捗

**Phase**: Phase 7.6 ノートブラウザ強化 + コピー/移動（完了）
**最終更新**: 2026-02-06
**次のタスク**: Phase 7 ユーザー要望機能の続き

### 次回セッションでやること

1. **Phase 7**（ユーザー要望、続き）:
   - Anki互換機能強化（フィルターデッキ、カードタイプ一括変更）
   - デッキごとの学習リマインダー通知機能

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
- [x] Phase 6.3 動作確認完了（SW→RSC競合修正、error.tsx境界によるオフラインLink遷移確認）
- [x] Phase 6.4 OCRカスタムノートタイプ対応（ノートタイプ選択UI、動的プロンプト生成、フィールドベースレビューUI）
- [x] Phase 6.4 動作確認完了
- [x] Phase 6.5 AI生成ルール対応（GenerationRule、ルールエディタ、一括生成ルール選択UI、field_values保存）
- [x] Phase 6.5 動作確認完了
- [x] Phase 7.1 削除機能（ノート単体/一括削除、デッキ削除、ノートタイプ削除UI、IndexedDBクリーンアップ）
- [x] Phase 7.1 動作確認完了
- [x] Phase 7.2 ノートブラウズ・編集機能（検索/フィルタ/ソート/ページネーション、NoteEditModal、RPC検索関数）
- [x] Phase 7.2 動作確認完了
- [x] Phase 7.3 LLMベース テキストタグ付け機能（プリセット3種、NoteEditModal AI生成セクション、NoteCardワンタッチ生成）
- [x] Phase 7.3 動作確認完了
- [x] Phase 7.4 Anki互換機能強化（サブデッキ + ノートタグ）
- [x] Phase 7.5 学習カスタマイズ（Anki互換デッキオプション: DeckSettings、scheduler設定対応、リーチ検知、カード並び順、詳細設定UI）
