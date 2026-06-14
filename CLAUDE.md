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
- **useLiveQuery**: Dexie 変更を購読する反応的フック（`dexie-react-hooks`）。デッキ一覧/学習/ダッシュボード/デッキ詳細で使用。バックグラウンド sync で IndexedDB が更新されると自動再描画
- **全ページClient Component化**: 全13ページを`'use client'`に変換、Dexie.jsプライマリ
- **SyncIndicator**: ヘッダーに同期状態インジケーター（`src/components/ui/SyncIndicator.tsx`）
- **SyncErrorBanner**: 同期失敗時に画面上部に再試行ボタン付き赤バナー（`src/components/ui/SyncErrorBanner.tsx`）
- **FirstSyncOverlay**: IndexedDB 空 + 初回 sync 未完了時の全画面ローディング（`src/components/ui/FirstSyncOverlay.tsx`）。LIFF in-app browser からの初回着地で「デッキがありません」誤表示を防ぐ
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

## LINE自動ログイン（Phase 17a） ✅ 完了

- **LINE認証フロー**: billing側LIFF → JWT生成 → SRS `/auth/line` → Supabaseセッション確立
- **3段階フォールバック**: (1) パスワードログイン → (2) `user_metadata.line_user_id` 検索 + magic link → (3) 新規作成
- **講師PCログイン**: ログインページに折りたたみ式メール+パスワードフォーム（`signInWithPassword`）
- **セッション確立**: 既存ユーザーは `generateLink` + `verifyOtp`（パスワード非依存）
- **同期対策**: pull APIは `body.userId` を無視し `auth.uid()` を使用（IndexedDBキャッシュ不整合対策）
- **環境変数**: `SRS_AUTH_SECRET`（JWT署名共有鍵）、`SUPABASE_SERVICE_ROLE_KEY`（admin操作用）

## 動詞の語法デッキ

- **データ**: `data/` ディレクトリに元データ（.md + .tsv）、統合スクリプト、インポートスクリプト
- **ノートタイプ**: 「動詞の語法」（フィールド: 日本語文/指定動詞/パーツ/正答/ID）
- **タグ体系**: セクション | サブセクション | v:動詞 | 文型:パターン | 前置詞:パターン
- **582ノート**: 13セクション（自動詞vs他動詞、SVO、SVC、SVOO、tell型、rob型、etc.）

## 中学英単語 暗誦例文デッキ ✅ 完了

- **データ**: `data/中学英単語/`（元xlsxは `raw/` で未追跡、`words.tsv`=全2286語にid付与、生成・後処理・インポート各スクリプト）
- **単語リスト**: 学習指導要領 全2286語（青森県教委ベース・全国6社教科書分析 / CEFR A1〜A2相当）。品詞別: 名詞1254・動詞343・形容詞361・副詞148・代名詞60・前置詞42・接続詞42・助動詞19・間投詞14・冠詞3
- **例文生成**: 1語×3つの異なるコロケーション例文を AI(Sonnet) ワークフロー並列生成 → `build_workflow.py` がデータ埋め込み .js を生成 → `Workflow` 実行 → `full_result.json`
- **後処理** `build_deck_tsv.py`: コロケーション部の `<strong>` 強調＋空所化。語幹・不規則動詞・重子音・ss・e脱落・A/Bプレースホルダ対応のアンカー一致。空所は最大4語（超過は見出し語のみ）
- **ノートタイプ**「中学英単語（暗誦）」: 単語/品詞/意味/コロケーション/和文/英文/英文穴埋め
- **カード（穴埋め型）**: 表=英文（暗誦対象を空所）＋和訳ヒント / 裏=完成英文（答え緑下線）＋和訳＋語義
- **6858ノート**（2286語×3）。`import-chu-eitango.mjs`（既定オーナー=gaimon.maam）。品詞別フィルタサブデッキ10個（`create-pos-subdecks.mjs`、filter_tags=[品詞:◯◯]）
- **同期ページング修正**: `/api/sync/pull` と `/api/decks/[id]/offline-data` の notes/cards/card_states を1000件ずつ `.range()` で全件取得（PostgREST の1000行上限対策、大規模デッキ必須）
- **イディオムタグ**: 全コロケーションをAIで「推測可能/推測困難イディオム」分類 → 1059ノートにタグ「イディオム」＋フィルタサブデッキ「★ イディオム（推測困難）」（`tag-idioms.mjs`, in-place更新）

## コロケーション中心デッキ（パイロット・実装中）

L2語彙論（高頻度語はコロケーション/フレーズで覚える、構文=コア+スロット）に基づく設計のパイロット（50語）。
- **設計核**: 語義はコロケーションが担う（run=走る/経営する）→ 語義軸はコロケーションに畳む。学習単位=構文(コア+スロット)、**SRSは構文単位・表示例文は毎回ローテーション**（token頻度=定着, type頻度=生産性）
- **3層統制**: ①語義レベルA1/A2（LLM+EVP/GSE基準, 経営する義B2等は除外）②共起語統制（`words.tsv`照合 `vocab_validate.py`）③コーパス頻度裏取り（Google Ngrams, ただし弱く補助のみ）
- **パイプライン**（`data/中学英単語/`）: `gen-colloc.js`(コロケーション選定)→`corpus_attest.py`→`gen-exemplar.js`(語彙統制例文プール5本)→`build_colloc_notes.py`(実現コロケーション全体を空所化)
- **アプリ**: ノートタイプ「コロケーション構文」(見出し語/語義/コア/スロット型/例文プールJSON)。`StudyCard.tsx` がプールからレビュー毎に1本ランダム表示（`例文プール`フィールドが無い通常ノートは素通り）
- **空欄ヒント**: `_blank_for` = 各語「最初の音節の頭子音クラスタ＋語長下線」（take the bus→`t___ th_ b__`, think→`th___`）
- **未認証405修正**: ミドルウェアが未認証 `/api/*` を `/login` へ307→POST が405化していた問題を、`/api/*` はリダイレクトせず401返却に修正（`src/lib/supabase/middleware.ts`）

## TTS設定（デッキ単位）

- **DeckSettings**: `tts_voice`（6種: alloy/echo/fable/onyx/nova/shimmer）、`tts_speed`（0.25〜4.0）
- **DeckAdvancedSettings「音声」タブ**: ボイス選択グリッド、速度ボタン（0.5x/0.75x/1.0x/1.25x）、テスト再生
- **テンプレートプレースホルダー**: `{{tts:FieldName}}` でカード内に音声ボタンを自由配置
- **TTSプリフェッチ**: カード表示時にバックグラウンドでTTS生成・IndexedDBキャッシュ
- **TTS API skipSave**: テスト再生用にnote不要のbase64データURL返却モード

## フィルタデッキ ✅ 完了

- **概要**: サブデッキにタグフィルタを設定し、新規カード導入をタグで絞り込む
- **設計**: 復習カードはフィルタ無視（親デッキ全体から）、新規カードのみフィルタ適用
- **新規カード枠**: ルート親デッキの`new_cards_per_day`で一元管理、全子孫で共有消費
- **DB**: `decks.filter_tags TEXT[]` カラム + `get_root_deck_id` RPC（015_filter_decks.sql 実行済み）
- **Dexie v9**: filter_tags対応、`getRootDeckId()` ヘルパー
- **配布サブデッキ同期**: pull APIが配布デッキの子・孫デッキも自動取得（深度2まで、admin clientでRLSバイパス）
- **動詞の語法**: 13セクション別フィルタサブデッキ作成済み（スクリプト: `data/create-filter-subdecks.mjs`）

## billing-SRSミラーリング同期 ✅ 完了

- **概要**: billingの生徒・授業テンプレート・受講登録をSRSに自動同期
- **SRS Admin API**: `POST /api/admin/billing-sync`（SRS_AUTH_SECRET認証）
- **共通ユーティリティ**: `src/lib/auth/line-user.ts`（findOrCreateSRSUser, banUser, unbanUser）
- **billing側**: `srs-sync.service.ts` + daily cron + 手動同期ボタン（ダッシュボード）
- **データマッピング**: students→profiles, class_templates→classes, registrations→class_members
- **退塾処理**: ban_duration='876000h'でアカウント無効化（データ保持）
- **DBマイグレーション**: `016_billing_sync.sql`（billing_template_id + teacher_id nullable + RLSポリシー）実行済み
- **Dexie v10**: classes に billing_template_id インデックス追加

## 生徒取組状況UI + LINE通知データAPI ✅ 完了

- **一覧ページ**: `/students/progress`（生徒ごとの今日の復習数/累計/期限切れ/最終活動/全体正答率）
- **詳細ページ**: `/students/progress/[userId]`（StatsOverview + デッキ別進捗 + ノート別ドリルダウン）
- **講師向けAPI**: `GET /api/teacher/student-progress`（バッチクエリでN+1回避、`?deckId=xxx` でノート一覧）
- **共通統計モジュール**: `src/lib/stats/calculations.ts`（生徒/講師で共有）
- **RLS**: `017_teacher_student_progress.sql`（card_states に `is_student_of_teacher` 基準のSELECTポリシー追加）
- **LINE通知データAPI**: `GET /api/admin/due-cards-summary`（Bearer認証、billing側から呼び出し）
  - レスポンス: `{ students: [{ lineUserId, name, dueCount, frontText, deckName, deckId }] }`
  - `dueCount` は実枚数（`count: 'exact'` で取得、上限なし）。`deckId` は深いリンク用
  - `middleware.ts` の publicPaths に追加済み
  - billing側のFlex送信実装スペック: `docs/billing-line-notification-spec.md`
- **`/auth/line` 深いリンク対応**: `?next=<path>` で SRS 内任意パスへ遷移可能
  - `safeNext` ヘルパーで open redirect を防止（`/path` のみ許可）
  - LIFF 経由で Flex メッセージから `/study?deckId=xxx` に直接遷移できる

## 現在の進捗

詳細は @docs/progress.md を参照。

- **最終更新**: 2026-06-14
- **直近の修正**: 機能拡張ディスカッション → **Phase 10「記憶のいきもの育成」を次の主軸に確定**（設計メモ @docs/memory-creatures-design.md 作成、ROADMAP 再構成。コード未着手）
- **次にやること**:
  1. **Phase 10 着手**: 記憶のいきもの育成（1ノート＝1匹の飼育、@docs/memory-creatures-design.md）。まず 10.1 いきものステータス基盤（`card_states` → 成長/世話状態の純ロジック＋テスト）
  2. **Phase 13.4**: リッチコンテンツ表示（数式 KaTeX/MathJax・画像）→ 数学・理科へ科目拡張
  3. 実機検証（手作業・並行）: コロケーションパイロット50語デッキの例文ローテーション＋頭子音ヒント空欄
  4. billing側のLINE送信ジョブ / Phase 9.3-9.4

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
