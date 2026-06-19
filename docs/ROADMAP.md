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

### 7.6 ノートブラウザ強化 + コピー/移動機能 ✅ 完了
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

## Phase 8: 学習セッション改善 ★最優先

### 8.1 セッション内カード再提示（learningキュー） ✅ 完了
Anki本家と同様に、Again/Hardで評価したカードを同一セッション内で再提示する。

- [x] StudySessionにセッション内キュー管理を追加
  - learning/relearning カードを learning_steps に従ってキューに再挿入
  - 例: Again → 1分後に再表示、再度Again → 10分後、Good → 卒業
- [x] 新規カード + 復習カード + learningカードの混合表示ロジック
  - pickNextCard: 期限切れlearningカード → mainキュー → 待機の優先順
- [x] セッション完了条件の変更（全カード卒業 or キュー空）
  - graduatedCount / totalCards でプログレス表示
- [x] DeckSettings の learning_steps をセッション内でも活用
- [x] WaitingCountdownコンポーネント（learningカード待機中のカウントダウン表示）
- [x] オフライン学習でも同じ挙動（クライアントサイドのみの実装）

### 8.2 {{FrontSide}} プレースホルダー実装 ✅ 完了
裏面テンプレートの `{{FrontSide}}` でレンダリング済みの表面HTMLを表示する（Anki互換）。

- [x] renderer.ts: renderTemplate に renderedFront オプション追加
- [x] processSimpleFields で {{FrontSide}} を特別処理
- [x] StudyCard: renderedFront を renderedBack の計算時に渡す
- [x] テスト追加（4件: Basic/Cloze/表面での空文字/未指定時の空文字）

### 8.3 タイマー機能 ✅ 完了
学習中のカウントダウンタイマー。時間切れ時に自動フリップまたは自動Again回答。

- [x] DeckSettings に answer_time_limit（秒）/ timer_action（flip / auto_again / none）追加
- [x] settings-validation にバリデーション追加
- [x] DeckAdvancedSettings に「タイマー」タブ追加
- [x] StudyCard に autoFlip / onFlipped props追加
- [x] CountdownTimer コンポーネント（色分けプログレスバー + 残り秒数）
- [x] 時間切れ時の自動アクション実装
  - flip: カード自動めくり
  - auto_again: めくり → 5秒カウントダウン → 自動Again（手動回答でキャンセル可）
  - none: カウントダウン表示のみ

### 8.4 回答取り消し（Undo）機能 ✅ 完了
誤タップ時に直前の回答を取り消せる。

- [x] 直前の card_state を一時保存（UndoSnapshot: React state + IndexedDB card_state）
- [x] 回答後10秒間「取り消し」ボタン表示（通常画面・待機画面・完了画面の3箇所）
- [x] card_state / review_log のロールバック処理（undoAnswerLocally + /api/study/undo）
- [x] sync_queueクリーンアップ + 補償エントリ追加（最終整合性保証）
- [x] ユニットテスト（6件: 状態復元、新規カード削除、sync_queue操作、reviewLogId指定）

### 8.5 スワイプジェスチャー ✅ 完了
モバイルでスワイプ操作でカード回答。

- [x] Vanilla Pointer Events でスワイプ検出（ライブラリ不使用）
  - detectDirection / calculateProgress 純粋関数 + useSwipeGesture カスタムフック
  - 表面: 上スワイプ → フリップ / 裏面: 左=Again, 下=Hard, 右=Good, 上=Easy
- [x] スワイプ方向のビジュアルフィードバック（SwipeOverlay: 色付きオーバーレイ + ラベル + 間隔プレビュー）
- [x] カード本体の微細な追従効果（translate 0.15倍）
- [x] DeckSettings に swipe_enabled 追加（デフォルト: 有効）
- [x] DeckAdvancedSettings に「スワイプ」タブ追加（トグル + 操作ガイド）
- [x] ユニットテスト（15件: detectDirection 10件 + calculateProgress 5件）

---

## Phase 9: ナビゲーション・UX改善

### 9.1 デッキ一覧UX改善 ✅ 完了
デッキ一覧ページにテキスト検索フィルタ、ワンタッチ学習開始、設定モーダルを追加。

- [x] DecksPageClient にテキスト入力フィルタ追加（虫眼鏡アイコン、クリアボタン）
- [x] クライアントサイドのデッキ名フィルタリング（サブデッキ親子関係を保持）
- [x] DeckCardに学習開始ボタン（▶）追加（期限切れカードがない場合グレーアウト）
- [x] DeckCardに設定ボタン（⚙）追加（マイデッキのみ、DeckAdvancedSettingsモーダル）
- [x] page.tsxにsettingsカラム追加（設定モーダルの初期値用）

### 9.2 最近学習したデッキのクイックアクセス ✅ 完了
ダッシュボードに直近学習デッキを表示し、ワンタップで学習開始。

- [x] review_logs から直近の学習デッキを取得
- [x] ダッシュボードに「最近のデッキ」セクション（3〜5件）
- [x] 「学習開始」ボタンで直接 /study?deckId=xxx に遷移

### 9.3 学習時間トラッキング表示
既存の review_logs.time_ms データを統計ページに表示。

- [ ] 日別/週別の学習時間集計
- [ ] 統計ページに学習時間グラフ追加
- [ ] ダッシュボードに今日の学習時間表示

### 9.4 デッキ習熟度スコア表示
デッキごとの習熟率（interval > 21日のカード割合）を表示。

- [ ] card_states から習熟率を計算
- [ ] デッキ一覧にプログレスバー表示
- [ ] 保護者/講師向けの分かりやすい指標

### 9.5 生徒セルフスタディ強化 ✅ 完了
生徒が自分のデッキ・ノートタイプを作成・管理できるようにし、配布デッキの学習設定をユーザー個別にオーバーライド可能に。

- [x] DBマイグレーション（012_user_deck_settings.sql: ユーザー別デッキ設定テーブル）
- [x] API権限変更（requireTeacher → requireAuth: デッキ・ノートタイプ作成）
- [x] デッキ設定API修正（非オーナーはuser_deck_settingsにupsert）
- [x] 学習ページでユーザー設定マージ（study/decks/decks[id]）
- [x] デッキ作成ページのブロック解除（生徒redirect削除）
- [x] canEdit = isOwner（ロールベース → 所有権ベース）
- [x] DeckDetailClient権限分離（配布設定は講師のみ、学習設定は全員）
- [x] デッキ一覧の新規作成ボタン全ロール表示
- [x] ノートページの所有権ベースcanEdit
- [x] NoteCard/NoteBrowserのノート別権限（canEditNote）
- [x] BottomNavにテンプレートタブ追加
- [x] ノートタイプページのロールチェック削除
- [x] Dexie.js v6（userDeckSettings テーブル）
- [x] バグ修正: 生徒作成デッキでカード枚数が0表示（RLS修正済み）

---

## Phase 10: 記憶のいきもの育成（ゲーミフィケーション中核）★次の主軸

詳細仕様は @docs/memory-creatures-design.md を一次仕様とする。
**1ノート＝1株の植物（果樹・花き）**を育てる育成ゲーム。全体で1キャラを育てるのではなく、
無数の小さな株を個別に世話する。生死（枯れ）・成長はすべて既存の FSRS `card_states` から
導出する（学習エンジンは不変、上にコスメティック層を被せるだけ）。実装はこのPhaseを先行。

アート方針＝**植物（果樹・花き）**に確定（@docs/memory-creatures-design.md）。
水やり＝復習、枯れ＝死、品種選択＝インプリント。

### 10.1 株のステータス基盤 ◧ 実装中
`card_states` → 株の状態を導出する純ロジック（テスト可能）。
`src/lib/garden/plant-state.ts`（`derivePlantState` / `summarizeGarden`）＋テスト17件。

- [x] 成長段階導出（`stability`→`interval`フォールバック → 種/芽/苗/成株/開花・結実）
- [x] 世話状態導出（`due` 超過度 → 健やか/乾き気味/しおれ/枯れかけ/枯れ）
- [x] `lapses`（弱り＝`struggled`）の反映 ／ `difficulty`（個性）は入力に保持・描画側で後日活用
- [ ] しきい値の実データ検証・調整（FSRS retention 依存。定数 `GROWTH_THRESHOLDS`/`CARE_THRESHOLDS` で調整可）
- [x] ユニットテスト（段階遷移・境界値・庭集計）

### 10.2 ハビタット（箱庭／野原）ビュー ★体験の中心 ◧ 実装中
デッキを箱庭/野原として表示。「今日水やりが必要な株」を学習開始導線に。
`/garden` ページ＋`src/components/garden/`（IsoTile/PlantSprite/GardenField）＋`garden-data.ts`。

- [x] アイソメ・タイル方式（1ノート＝ひし形ブロック1枚、個別=1枚拡大/全体=自動レイアウト合成）
- [x] 手続き生成SVGの株グリフ（種/芽/苗/成株/開花・結実＋しおれ〜枯れ、素朴トーン）＋揺れ/しずくアニメ
- [x] 「今日 水やりが必要 N株」サマリー → ワンタップ学習（＝水やり）リンク
- [x] オフライン（Dexie card_states）から導出（`getGardenForDeck`）
- [x] BottomNav に「庭」タブ追加（生徒）
- [x] 大規模デッキの全体表示（>150株は PixiJS/WebGL で全件描画。既存SVGアートをテクスチャ化して再利用＋ドラッグ移動/ホイール・ピンチズーム。遅延ロード＋WebGL失敗時はSVG縮退）
- [x] 学習完了→庭で成長を見せる演出（`GrowthCelebration`：セッション中に段階アップした株を品種別スプライトで表示・「庭で見る」導線）
- [x] 学習画面の「水やり→成長」リアルタイムアニメ（回答ごとに非ブロッキングの一時オーバーレイ：正答=💧しずく／段階アップ=品種別スプライトのポップ。`prefers-reduced-motion` 対応）

### 10.3 枯れ＆芽吹き直し ✅ 完了
放置の帰結を可視化しつつ、SRSの科学を壊さない。

- [x] 長期放置でしおれ→枯れ（コスメティックのみ、card_states 不変。`derivePlantState` の `withered`/`isDead`）
- [x] 久々の復習→FSRS自然リセット（Again→stability低下）で種/芽から育て直し（学習エンジンが自然に実現）
- [x] 枯れ株に水やり（=復習）で芽吹き直す導線（`/study?deck=X&card=cardId` で当該株を最優先＝永久ロスト禁止の安全弁）
- [x] 枯れ株一覧ビュー（全デッキ横断。`getWitheredPlants` ＋ `WitheredList`、`/garden` の「枯れ株 N」バッジから展開）

### 10.4 品種選択（果樹・花きのインプリント） ✅ 完了
個別性は品種選択で担保。記憶術（視覚化）としても機能。

- [x] 品種カタログ（`src/lib/garden/varieties.ts`：果樹6＋花き5。**ベース形状＋品種色**方式＝`PlantSprite` が kind/色で姿を変える。5段階フル描き下ろしは将来）
- [x] 初回インプリントUI（`ImprintPicker`。学習の初回出題時＝new カードで未刻印のノートに1度だけ。「おまかせ」=noteId ハッシュで決定的／「あとで」=スキップ。AI初期提案は見送り）
- [x] DBマイグレーション: `user_creature_state`（`019_user_creature_state.sql`、imprint JSONB + nickname、RLS=自分のみ）**要 Supabase 実行**
- [x] Dexie 対応（生徒ごと・オフライン。Dexie v12 `userCreatureState`、`saveCreatureState`/`getCreatureState`/`getCreatureStatesMap`、pull API＋sync 同期、`POST /api/garden/imprint`）

### 10.5 集計・ランキングレイヤー ◧ 実装中
継続のフック。公平性に配慮。

- [x] 学習ストリーク + ヒートマップカレンダー（review_logs 集計・4時区切り）。`src/lib/stats/streak.ts`（純ロジック・テスト13件）＋`useStreak`（Dexie/オフライン）＋`StreakHeatmap`。`/stats` に表示＋`/garden` ヘッダーに 🔥連続日数
- [x] デイリーミッション（今日の水やり進捗・軽量版）：`getDailyMission`（reviewLogs今日分＋全デッキ要水やりから導出・Dexie/オフライン）＋`DailyMissionCard`（`/garden` 上部）。**プッシュ通知連携は未（Phase 12.3 のインフラに乗せる将来分）**
- [~] クラスランキング（**絶対量でなく成長率**）— **見送り**（順位付けは逆にモチベーションを削ぐ懸念があるとの方針判断・2026-06-15）。将来やるならオプトアウト前提
- [x] アチーブメントバッジ（`achievements.ts`：結実/ストリーク/累計レビュー/品種/株数の9種を既存データから導出。`AchievementsModal`、`/garden` の「🏅 実績」から。テスト7件）

---

## Phase 11: 講師ツール強化

### 11.1 宿題機能（期限付き課題配布）★塾向け最重要
デッキに期限を設定して課題として配布。進捗を追跡。

- [ ] assignments テーブル（deck_id, class_id/user_id, due_date, required_count）
- [ ] 課題作成UI（講師側）
- [ ] 生徒ダッシュボードに課題一覧（期限表示）
- [ ] 課題完了状況の追跡・表示（講師側）

### 11.2 生徒詳細ビュー（取組状況） ✅ 完了
講師が生徒ごとの学習状況を一覧・詳細で確認。

- [x] 生徒一覧ページ `/students/progress`（今日の復習数/累計/期限切れ/正答率/最終活動）
- [x] 生徒詳細ページ `/students/progress/[userId]`（統計グラフ + デッキ別進捗）
- [x] ノート別ドリルダウン（デッキクリックで状態/正答率/最終レビュー）
- [x] 講師向けAPI `/api/teacher/student-progress`（バッチクエリでN+1回避）
- [x] 共通統計モジュール `src/lib/stats/calculations.ts`
- [x] 講師のcard_states閲覧RLS（017_teacher_student_progress.sql）
- [x] クラス管理ページに「取組状況」ボタンの導線

### 11.3 クラス全体分析ダッシュボード
クラス横断の分析。最も難しいカード、平均正答率、遅れている生徒の検出。

- [ ] クラス全体の正答率分布
- [ ] 最も間違いが多いカードランキング
- [ ] 学習ペースが遅い生徒のアラート

### 11.4 保護者向け進捗レポート
週次/月次の学習レポートをメールで自動送信。

- [ ] 保護者連絡先テーブル
- [ ] レポートテンプレート（学習量、正答率、ストリーク、弱点分野）
- [ ] メール送信インフラ（Resend/SendGrid）
- [ ] 送信スケジュール（Vercel Cron）

---

## Phase 12: クライアントファースト化（SPA化） ✅ 完了

全画面をClient Component + Dexie.jsプライマリに移行し、ページ遷移を高速化。
サーバー通信はバックグラウンド同期のみ。

### 12.1 全画面のClient Component化 ✅ 完了
Server Component → Client Component への段階的移行。

- [x] AuthProvider + useAuth グローバル認証コンテキスト
- [x] useDexieQuery stale-while-revalidateフック
- [x] ダッシュボードページのクライアントファースト化
- [x] デッキ詳細ページのクライアントファースト化
- [x] 講師ページ（生徒管理/クラス詳細）のクライアントファースト化
- [x] ノートタイプ管理ページのクライアントファースト化
- [x] Stats/Settings/Notes/Study/Decksページのクライアントファースト化
- [x] ルーティングの最適化（クライアントサイドナビゲーション）

### 12.2 バックグラウンド同期の強化 ✅ 完了
stale-while-revalidate パターンで、表示はローカル即時 → 裏でサーバー同期。

- [x] 全テーブルのDexie.js同期ロジック整備（Dexie v7: classes, classMembers, deckAssignments追加）
- [x] 同期状態インジケーター（最終同期時刻表示、SyncIndicatorコンポーネント）
- [x] Pull API拡張（classes, classMembers, deckAssignments, userDeckSettings）
- [x] バックグラウンド同期（5分間隔 + タブフォーカス + 初回ログイン）
- [x] **liveQuery 化**（2026-04-28）: `dexie-react-hooks` で `useLiveQuery` 導入。バックグラウンド sync が IndexedDB を更新すると画面が自動再描画。対象ページ: デッキ一覧、学習、ダッシュボード、デッキ詳細
- [x] **SyncErrorBanner**（2026-04-28）: `fullSync` エラーを画面上部に赤バナーで表示（再試行ボタン付き）
- [x] **FirstSyncOverlay**（2026-04-28）: IndexedDB 空 + 初回 sync 未完了時の全画面ローディング。LIFF in-app browser からの初回着地で「デッキがありません」誤表示を防止

### 12.3 プッシュ通知（学習リマインダー） ✅ 完了
Web Push API で学習リマインダーを送信。

- [x] VAPID キー生成、通知購読テーブル（push_subscriptions, notification_settings, notification_logs）
- [x] Service Worker でプッシュイベント受信（worker/index.ts）
- [x] 通知送信サービス（Vercel Cron + web-push、毎日07:00 JST）
- [x] 通知設定UI（/settings に NotificationSettings コンポーネント）
- [x] テスト送信機能（/api/push/test）
- [ ] デッキ/ユーザー単位の通知時刻設定（現在は全員07:00 JST固定）
- [ ] 宿題期限リマインダー（Phase 11.1と連携）

### 12.4 LINE通知連携（billing経由）
billing側のLINE Bot経由で復習カード通知を送信する。

- [x] SRS側データAPI `GET /api/admin/due-cards-summary`（Bearer認証、line_user_id + dueCount + 代表カードfrontText + deckId）
- [x] `/auth/line?next=<path>` 深いリンク対応（`safeNext` で open redirect 防止）
- [x] billing側実装スペック書き下ろし（`docs/billing-line-notification-spec.md`）
- [ ] billing側の送信ジョブ実装（Flexメッセージ生成 + LINE Messaging API 呼び出し）
- [ ] billing側のLIFF経由 `/auth/line` リダイレクト
- [ ] 通知時刻のユーザー設定（SRSの`notification_settings`と連携するかbilling側で別管理か方針決定）

---

## Phase 13: コンテンツ作成効率化

### 13.1 AI一括カード生成（テキスト/PDF/URL→カード）
テキスト貼り付け・PDF・URLからAIがカードを自動生成。

- [ ] テキスト入力 → Claude API でQ&Aペア抽出 → ノート作成
- [ ] PDF対応（pdf-parse + Claude）
- [ ] URL対応（fetch + 本文抽出 + Claude）
- [ ] ノートタイプのフィールドに合わせた生成

### 13.2 ノート一括フィールド編集（Find & Replace）
全ノート横断でフィールドテキストの検索・置換。

- [ ] NoteBrowserに「一括編集」モード追加
- [ ] フィールド指定 + 検索/置換テキスト入力
- [ ] プレビュー → 確認 → 一括適用

### 13.3 デッキテンプレート/プリセット
よく使うデッキ構成をテンプレート化してワンクリック複製。

- [ ] デッキ + ノートタイプ + テンプレートのバンドル複製
- [ ] テンプレートライブラリUI
- [ ] 「ターゲット1900」「JLPT N3」等のプリセット

### 13.4 リッチコンテンツ表示（数式・画像）★Phase 10 の次
カードで数式・画像を表示し、英語塾から数学・理科へ科目を拡張する土台。

- [x] 数式: **KaTeX** をカード描画に統合（Anki互換 `\(…\)`・`\[…\]`・`$$…$$`）。`src/lib/template/math.ts`＝`renderMath`/`containsMath`。数式を含むカードでのみ**動的import**（`/study` バンドルを軽く保つ）。`StudyCard`＋`TemplatePreview` 対応・テスト7件
- [x] サニタイズとの両立: カードは **iframe(sandbox, allow-same-origin なし) 隔離**で `dangerouslySetInnerHTML` 不使用 → KaTeX 出力をそのまま渡せる（サニタイザと衝突しない）。出力は **MathML（ブラウザネイティブ描画）** で外部 CSS/フォント不要。※旧 KaTeX-HTML 用の `public/katex/`＋`/katex` publicPath/CORS/SW キャッシュは MathML 化で撤去済み（2026-06-17）
- [x] 画像（URL）: `<img>` は iframe で既に表示可能（テンプレ/フィールドに `<img src>` で利用）
- [x] 画像アップロード（`POST /api/images/upload`＝TTS の Storage 流用、`images` バケット）＋ オフライン（IndexedDB）画像キャッシュ（Dexie v13 `imageCache`・URLキー）。StudyCard が `<img>` URL を data: URL に書換えて sandbox iframe でオフライン表示（実機確認済み）
- [x] 画像マスキング（実機確認済み）: AI候補検出（**Google Vision 高精度OCR**＋Claude Vision フォールバック・`/api/image-mask-candidates`）→`MaskRegionEditor` で選択/自由描画/移動/リサイズ→ノート作成。`src/lib/image-mask`（純ロジック・テスト13件）。StudyCard が `マスク領域`(JSON) から**毎回ランダムにN領域**を隠して出題（視覚リコール＋めくり／裏面は枠＋番号＋画像下の答えリスト／隠す数=ノート毎設定＋既定30%）。ノートタイプ「画像マスキング」（`data/create-image-occlusion-notetype.mjs`）
- [x] 画像マスキング 一括作成（`/notes/image-mask/bulk`：複数画像→並列アップ＋検出→レビュー→全作成）＋ ビジュアル再編集（`/notes/image-mask/[id]/edit`）。編集キャンバスは `MaskRegionEditor` に共通化
- [ ] → 数学・理科デッキで「記憶のいきもの」を飼えるようにする（Phase 10 連携）

---

## Phase 14: 学習モード拡張

### 14.1 テストモード
カードデータから選択式/記述式のテストを自動生成。

- [ ] 選択式: 同デッキから誤答選択肢をサンプリング
- [ ] 記述式: 回答を入力して照合
- [ ] 正誤判定 + スコア表示
- [ ] 試験形式のカスタマイズ（問題数、制限時間、出題範囲）

### 14.2 マッチングモード
表裏のペアをドラッグ＆ドロップで結ぶタイムアタック。

- [ ] カードからランダムに10組選出
- [ ] ドラッグ＆ドロップ or タップ式マッチングUI
- [ ] タイムアタック + スコア記録

### 14.3 イメージオクルージョン
画像の一部を隠して覚える特殊ノートタイプ。

- [ ] 画像上に矩形を描画するエディタ
- [ ] SVGオーバーレイでのマスク表示
- [ ] 専用ノートタイプの定義

---

## Phase 15: SRSアルゴリズム進化

### 15.1 FSRS（Free Spaced Repetition Scheduler）導入 ✅ 完了
SM-2からFSRSへのアップグレード。復習回数を20〜30%削減。

- [x] ts-fsrs パッケージ導入
- [x] card_states スキーマ拡張（FSRS用パラメータ: stability, difficulty, elapsed_days, scheduled_days, last_review）
- [x] SM-2 → FSRS マイグレーションパス（migrate-fsrs API + fsrs-migration.ts）
- [x] 目標記憶率（desired retention）設定UI
- [x] SM-2 / FSRS 切り替えオプション（デッキ単位）
- [x] DeckAdvancedSettingsにアルゴリズムタブ追加（FSRS設定: ファジング、短期スケジュール等）
- [x] SM-2固有設定のFSRSモード時非表示
- [x] Dexie.js v8（LocalCardState拡張）
- [x] sync/answer/undo/push API全面FSRS対応
- [x] テスト39件追加（全231件パス）
- [x] SQLマイグレーション（013_fsrs_support.sql）

---

## Phase 16: コラボレーション

### 16.1 Quizlet Live風クラスゲーム
リアルタイムのクラス対戦クイズゲーム。

- [ ] ゲームセッション管理（Supabase Realtime）
- [ ] 講師用ホスト画面 + 生徒用プレイヤー画面
- [ ] チーム分け、スコア計算、ランキング表示

### 16.2 生徒間デッキ共有
生徒が自分のデッキをクラスメイトに共有。

- [ ] 共有リンク or クラス内公開設定
- [ ] 読み取り専用 or コピー可能の選択
- [ ] 講師承認オプション

### 16.3 カードコメント/質問機能
カードに質問やコメントを残し、講師が回答。

- [ ] card_comments テーブル
- [ ] カード詳細/編集画面にコメントセクション
- [ ] 講師への通知

---

## 現在の進捗

**Phase**: **多段階設問・識別演習（古文）完了（要実機確認）**＋Phase 10 ほぼ完了＋Phase 13.4 数式・画像・画像マスキング完了
**最終更新**: 2026-06-19
**次のタスク**: 識別演習の実機確認（自動判定しきい値の実データ調整）→ 科目拡張（数学・理科デッキ＋そこのいきもの育成）

### 次回セッションでやること

1. **★SQL実行**: `supabase/migrations/019_user_creature_state.sql`（未実行だと品種保存が500）→ Vercel デプロイ → 再ログインで Dexie v12 マイグレーション
2. **実機確認**: 学習で new カード初回に品種ピッカー → `/garden` で品種別の姿。10.3 枯れ株一覧、`/stats` のストリーク/ヒートマップ＋`/garden` の🔥連続日数も
3. **Phase 10.5 残**: デイリーミッション（今日◯株）＋プッシュ連携、クラスランキング（成長率・オプトアウト）、バッジ
4. **10.2 残**: 大規模デッキ→PixiJS化、学習完了→庭で成長を見せる演出、`GROWTH/CARE_THRESHOLDS` の実データ調整
5. **その後**: リッチコンテンツ表示（Phase 13.x 数式・画像）→ 数学・理科へ科目拡張

### 今後のロードマップ（優先度順）
- **Phase 10**: 記憶のいきもの育成（育成ゲーム）★次の主軸（@docs/memory-creatures-design.md）
- **Phase 13.x**: リッチコンテンツ表示（数式 KaTeX/MathJax・画像フィールド）＝科目拡張の土台
- **Phase 12.4**: billing側LINE送信（SRS側データAPIは実装済み）
- **Phase 9.3-9.4**: 学習時間トラッキング、習熟度スコア
- **Phase 11.1/11.3/11.4**: 宿題機能・クラス分析・保護者レポート
- **据え置き（中長期・計画のみ）**: ①レッスン/教材モード（題材単位の順序付き出題）、③学習パス/アンロック（Duolingo型スキルツリー）。データモデル新規追加が重いため後回し
- **Phase 14, 16**: 学習モード拡張（テスト/マッチング）、コラボ。将来 Phase 10 と統合

### 完了済み
- [x] **多段階設問・識別演習（古文）**（2026-06-19・要実機確認）: 1カードに複数設問→例文単位で1回SRS評価。**正誤＋解答時間のスコアから SRS 評価を自動判定**（生徒はタップで手直し可）。`src/lib/multi-step`（テスト24件）＋`MultiStepCard`＋StudySession分岐＋`review_logs` に score/step_results（`020` 適用済み・後方互換）＋`/stats` スコアカード＋ノートタイプ「識別演習」＋サンプルデッキ46ノート。詳細は CLAUDE.md「多段階設問・識別演習」節
- [x] Phase 1-5: MVP、講師機能、オフライン、LLM連携、拡張機能
- [x] Phase 6: UX改善 & パフォーマンス最適化（6.1-6.5）
- [x] Phase 7: ユーザー要望機能（7.1-7.6）
- [x] Phase 8: 学習セッション改善（8.1-8.5）
- [x] Phase 9.1 デッキ一覧UX改善
- [x] Phase 9.2 最近学習したデッキのクイックアクセス
- [x] Phase 9.5 生徒セルフスタディ強化
- [x] Phase 11.2 生徒詳細ビュー（取組状況UI + ノートドリルダウン）
- [x] Phase 12: クライアントファースト化/SPA化（12.1-12.2）+ プッシュ通知（12.3）
- [x] Phase 12.4（部分）: SRS側LINE通知データAPI
- [x] Phase 15: FSRS導入（15.1）
- [x] フィルタデッキ機能（タグベースサブデッキ + 配布サブデッキ自動同期）
- [x] **Dexie liveQuery 化 + 同期 UI フィードバック**（2026-04-28）: バックグラウンド sync 完了で画面自動再描画、SyncErrorBanner、FirstSyncOverlay
- [x] **中学英単語デッキ**（2026-06-13/14）: 学習指導要領2286語×3例文=6858ノート、穴埋め型、品詞別10サブデッキ、イディオムタグ＋サブデッキ
- [x] **同期/認証バグ修正**（2026-06-14）: pull/offline-data の1000行ページング、未認証 /api/* の405→401
- [x] **コロケーション中心デッキ パイロット**（2026-06-14）: 語義A1/A2統制＋コア+スロット＋例文プールローテーション（StudyCard）＋頭子音ヒント空欄、50語パイロット投入
- [x] **文脈アシスト**（2026-06-14）: コロケーションパイロットの表面最上部に例文ごとの日本語リード文を追加（enrich-only AI生成870例文、例文プール {en,blank,ja,ctx} 拡張、DB in-place 更新）
- [x] **Phase 10.1/10.2 記憶のいきもの育成**（2026-06-15）: 株のステータス導出（`plant-state.ts`）＋アイソメ箱庭ビュー `/garden`（実機確認済み）
- [x] **Phase 10.3 枯れ株一覧・復活導線**（2026-06-15）: 全デッキ横断 `getWitheredPlants`＋`WitheredList` モーダル＋「水やり」で当該株を最優先復習（`/study?...&card=`）。枯れは見た目のみ・永久ロストなし
- [x] **Phase 10.4 品種インプリント**（2026-06-15）: `varieties.ts`（果樹6＋花き5、ベース形状＋色）＋初回出題時 `ImprintPicker`＋`user_creature_state`（019/Dexie v12/pull同期/`/api/garden/imprint`）。庭・枯れ株一覧が品種別の姿で描画
- [x] **Phase 10.5 一部 ストリーク/ヒートマップ**（2026-06-15）: `streak.ts`（4時区切りの連続日数/最長/ヒートマップ純ロジック・テスト13件）＋`useStreak`(Dexie/オフライン)＋`StreakHeatmap`。`/stats` に表示＋`/garden` ヘッダーに🔥連続日数
- [x] **Phase 10.2 学習完了→成長演出**（2026-06-15）: `StudySession` がセッション中の段階アップを集計し、完了画面で `GrowthCelebration`（品種別スプライト＋「庭で見る」）。`/garden` は `?deck=` 対応
- [x] **019 マイグレーション適用**（2026-06-15）: Supabase CLI を導入・link し、001〜018 を `migration repair`（手動適用分を履歴記録）→ `db push` で 019（`user_creature_state`）適用。以後 `db push` で運用可能
- [x] **Phase 10.5 アチーブメントバッジ**（2026-06-15）: `achievements.ts`（9種を既存データから導出・テスト7件）＋`getAchievementInput`(Dexie)＋`AchievementsModal`。`/garden`「🏅 実績」から達成/進捗を表示
- [x] **Phase 10.2 リアルタイム成長アニメ**（2026-06-15）: 回答ごとに非ブロッキングの一時演出（正答=💧／段階アップ=品種別スプライトのポップ、`StudySession`）
- [x] **Phase 10.5 デイリーミッション（軽量版）**（2026-06-15）: `getDailyMission`（今日の水やり進捗を既存データから導出・テスト3件）＋`DailyMissionCard`（`/garden` 上部）。プッシュ連携は将来
- [x] **Phase 10.2 PixiJS 大規模描画**（2026-06-15）: `GardenFieldPixi`（>150株を WebGL 全件描画・ドラッグ/ズーム・遅延ロード・SVG縮退）＋`tileTexture`（既存SVGを canvas 化キャッシュ）。pixi.js v8 導入。タップ選択のゴーストクリック不具合も修正済（実機でパン/ズーム/タップ確認済）
- [x] **Phase 13.4 数式（KaTeX→MathML）**（2026-06-15・実機確認済み）: `math.ts`（renderMath/containsMath・テスト7件）＋数式カードのみ動的import。**`output:'mathml'` でブラウザネイティブ描画＝CSS/フォント不要**（iframe での二重表示/空欄を根本解消）。StudyCard/TemplatePreview 対応。庭の名札は `見出し` フィールド優先＋タイル天面をベージュ土に。画像は `<img>` で表示可（アップロード/オフラインキャッシュは次の増分）
- [x] **Phase 13.4 画像アップロード＋画像マスキング**（2026-06-16・実機確認済み）: 画像アップ（`/api/images/upload`・`images`バケット）＋オフラインキャッシュ（Dexie v13・`<img>`→data:URL）。画像マスキング＝AI候補検出（**Google Vision 高精度OCR**＋Claude Vision フォールバック）＋毎回ランダム出題（`src/lib/image-mask`・テスト13件）＋裏面は枠+番号+答えリスト。**一括作成**（`/notes/image-mask/bulk`）＋**ビジュアル再編集**（`/notes/image-mask/[id]/edit`）、編集キャンバスは `MaskRegionEditor` 共通化。退役モデルID更新（Sonnet4→4.6・Haiku3→4.5）＋ pull で全ノートタイプ＋カードテンプレ毎回同期（表面空白の真因解消）
