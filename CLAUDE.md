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
- **文脈アシスト**: 例文プール1件を `{en, blank, ja, ctx}` に拡張。`ctx`＝日本語の場面リード文（例「私は荷物が多くて困っています。そのとき、」）を**表面の最上部**に表示しイメージ強化。`文脈` は StudyCard が合成する表示専用フィールド（保存フィールド非追加）。enrich-only パイプライン: `build_context_workflow.py`→`gen-context.js`(Workflow/Sonnet)→`merge_context.py`→`build_colloc_notes.py`。テンプレ定義は `colloc-template.mjs` に集約（`import-colloc-deck.mjs`/`update-colloc-template.mjs` 共有）。既存DB反映は `update-colloc-context.mjs`(例文プール in-place)＋`update-colloc-template.mjs`(front/css)
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

## 記憶のいきもの育成（Phase 10・実装中）

一次仕様 @docs/memory-creatures-design.md。**1ノート＝1株の植物（果樹・花き）**を育てる育成ゲーム。
水やり＝復習／枯れ＝死（見た目のみ・復習で芽吹き直し）／品種選択＝インプリント。
**FSRS の `card_states` から導出する純コスメティック層で、学習エンジンには一切触れない。**

- **状態導出ロジック（10.1）**: `src/lib/garden/plant-state.ts`
  - `derivePlantState(card, now)` → 成長段階（`stability`→`interval` フォールバック: 種/芽/苗/成株/開花・結実）＋世話状態（`due`超過度: 健やか/乾き気味/しおれ/枯れかけ/枯れ）
  - `summarizeGarden(cards, now)` → 庭サマリー（要水やり数・枯れ数・段階別）
  - しきい値は `GROWTH_THRESHOLDS`/`CARE_THRESHOLDS`（実データで調整）
- **箱庭ビュー（10.2）**: `/garden`（`src/app/(student)/garden/page.tsx`）。アイソメ・タイル方式
  - 1ノート＝ひし形ブロック1枚。個別=1枚拡大／全体=自動レイアウトで合成（`x=(col-row)*hw, y=(col+row)*hh`、奥→手前描画）
  - `src/components/garden/`: `PlantSprite`（手続き生成SVG・素朴トーン）/`IsoTile`（ブロック+株+水やりバッジ）/`GardenField`（自動レイアウト+揺れ/しずくアニメ）
  - `src/lib/garden/garden-data.ts` `getGardenForDeck(deckId, userId)`: デッキ配下の全カード×card_states を株データ化（オフライン可）
  - 大規模デッキ（>150株）は **PixiJS/WebGL で全件描画**（`GardenFieldPixi`＋`tileTexture`：既存SVGアートを canvas 化してテクスチャ再利用・ドラッグ移動/ホイール・ピンチズーム・タップ選択。`next/dynamic` 遅延ロード・WebGL失敗時はSVG縮退）。150以下は従来 `GardenField`（SVG）
- **枯れ株一覧・復活導線（10.3）✅**: 全デッキ横断で枯れ株を集め、水やり（=復習）で芽吹き直す導線
  - `src/lib/garden/garden-data.ts` `getWitheredPlants(userId, now?)`: 全 card_states を走査 → `isDead` のみ抽出 → deckId/deckName/label/plant 付与・放置日数降順（Dexie のみ・オフライン可）
  - `src/components/garden/WitheredList.tsx`: 枯れ株モーダル一覧。行ごとに「水やり」→ `/study?deck=X&card=cardId`（既存 `priorityCardId` で当該株を最優先表示）
  - `/garden` のサマリー「🍂 枯れ株 N（全デッキ）」バッジから展開。枯れは見た目のみ・card_states 不変・永久ロストなし（安全弁）
- **品種インプリント（10.4）✅**: 「この単語をどの植物で育てる？」を初回出題時に選ぶ（視覚化記憶術）
  - `src/lib/garden/varieties.ts`: 品種カタログ（果樹6＋花き5）。**ベース形状（tree/flower）＋品種アクセント色**方式で `PlantSprite` が姿を変える（5段階フル描き下ろしは将来）。`pickVarietyByHash`（おまかせ用・決定的）
  - `src/components/garden/ImprintPicker.tsx`: 学習で new カード＋未刻印ノートのみ1度プロンプト（`StudySession` に統合）。「おまかせ」/「あとで」あり
  - DB: `user_creature_state`（`019_user_creature_state.sql`、imprint JSONB + nickname、RLS=自分のみ）。Dexie v12 `userCreatureState`＋`saveCreatureState`/`getCreatureState`/`getCreatureStatesMap`。pull API＋sync で同期、保存は `POST /api/garden/imprint`（オフラインは Dexie 即時・オンラインで upsert）
  - 庭/個別/枯れ株一覧はインプリント済みの品種で描画（未刻印は汎用の果樹）
- **ストリーク/ヒートマップ（10.5 一部）✅**: review_logs から導出する継続フック
  - `src/lib/stats/streak.ts`: `computeStreak`（current/longest・4時区切り、当日未学習でも継続）/`buildHeatmap`（週×7日）。純ロジック・テスト13件
  - `src/lib/stats/useStreak.ts`（Dexie reviewLogs を liveQuery・オフライン可）＋`src/components/stats/StreakHeatmap.tsx`。`/stats` 上部に表示＋`/garden` ヘッダーに🔥連続日数
- **学習完了→成長演出（10.2 残）✅**: `StudySession` がセッション中の段階アップ（`GROWTH_ORDER` で基準比較）を集計し、完了画面で `GrowthCelebration`（品種別スプライト＋from→to＋「庭で見る」）。`/garden` は `?deck=` でデッキ指定可
- **回答ごとのリアルタイム成長アニメ（10.2 残）✅**: `StudySession` が回答ごとに非ブロッキングの一時オーバーレイ（正答=💧しずく／その回答で段階アップ=品種別 `PlantSprite` のポップ）。styled-jsx keyframes・`prefers-reduced-motion` 対応・高速フローを止めない
- **アチーブメントバッジ（10.5）✅**: `src/lib/garden/achievements.ts`（結実/ストリーク/累計レビュー/品種数/株数の9種を既存データから導出する純ロジック・テスト7件）＋`getAchievementInput`（Dexie・オフライン）＋`src/components/garden/AchievementsModal.tsx`。`/garden` の「🏅 実績」から達成/進捗を表示
- **デイリーミッション（10.5・軽量版）✅**: `getDailyMission`（今日の水やり進捗＝reviewLogs今日分の distinct card ＋ 全デッキの要水やり株から導出・Dexie/オフライン・テスト3件）＋`src/components/garden/DailyMissionCard.tsx`（`/garden` 上部）。**プッシュ通知連携は未**（Phase 12.3 のインフラに乗せる将来分）
- **DB適用**: `019_user_creature_state.sql` は Supabase に**適用済み**（CLI 導入・link・001〜018 repair・db push）。以後の新規マイグレーションは `npx supabase db push` で適用可能（手動SQL不要）
- **方針**: アートは当面**自前の手続き生成SVG**で世界観統制（CC0素材は絵柄不一致で見送り）。将来 PixiJS（大規模）/Rive（状態アニメ）。品種別の5段階フルスプライトは後日
- **クラスランキング（10.5）は見送り**: 順位付けは逆にモチベーションを削ぐ懸念があるとの方針判断（2026-06-15）

## リッチコンテンツ表示（Phase 13.4）

- **数式（KaTeX → MathML 描画）✅**: カードで TeX を描画。Anki互換デリミタ `\(…\)`（インライン）・`\[…\]`・`$$…$$`（ディスプレイ）。単一 `$…$` は誤検出回避で対象外
  - `src/lib/template/math.ts`: `renderMath(html)`/`containsMath(html)`。KaTeX で **`output:'mathml'`**（ブラウザネイティブ描画＝**CSS/Webフォント不要**）。KaTeX は重い(~270KB)ため**数式を含むカードでのみ動的 import**（`StudyCard`/`TemplatePreview` が `containsMath` 判定→`import`）。`/study` 初期バンドル不変
  - **なぜ MathML**: iframe(sandbox=opaque origin) で KaTeX-HTML を使うと CSS/フォントの読込・CORS・高さ計測が壊れ、二重表示や空欄が頻発した。MathML は外部アセット不要で最も壊れにくい。`CardIframe` は KaTeX CSS link を持たず、`math` prop で最小 CSS（`math[display=block]` 中央寄せ）と最低高さ160pxのみ付与
  - **サニタイズとの両立**: カードは iframe(sandbox, allow-same-origin なし) 隔離描画で `dangerouslySetInnerHTML` 不使用 → MathML をそのまま渡せる
  - 庭の名札（`pickLabel`）は数式を描画しないので `\(…\)` 等を除去
  - ※ 旧 KaTeX-HTML 用の `public/katex/`＋`/katex` publicPath/CORS/SW キャッシュは MathML 化で不要になり**撤去済み**（2026-06-17）。`katex` npm パッケージは MathML 生成に引き続き使用
- **画像（URL/アップロード/オフライン）✅**: `<img src>` は iframe で表示可能。アップロードは `POST /api/images/upload`（TTS の Storage 処理流用・`images` バケット・`{userId}/{uuid}`・公開URL返却）。`ImageUploadButton`＋`NoteEditModal` で挿入。**オフライン**=Dexie v13 `imageCache`（URLキー）＋`StudyCard` がカード内 `<img>` http(s) URL を **data: URL に書換え**て sandbox iframe に埋め込む（opaque origin では親の blob: が参照できないため）。`src/lib/template/images.ts`（純関数・テスト10件）
- **画像マスキング（Image Occlusion）✅（要実機確認）**: 画像内の用語を隠して暗記。`POST /api/image-mask-candidates` が用語を**%bbox付き**で検出→`ImageMaskEditor`（`/notes/image-mask/new?deck=X`）で**選択/自由描画/移動/リサイズ/答え編集**→ノート作成。`StudyCard` が `マスク領域`(JSON) から**レビュー毎にN領域ランダムで隠す**（例文プールと同じ思想・表示専用 `画像表`/`画像裏` を合成・保存フィールド非追加）。出題=視覚リコール＋めくり、隠す数=ノート毎設定＋既定30%（`resolveMaskCount`）。座標は**0-100の%**（表示サイズ非依存）。純ロジック `src/lib/image-mask/`（テスト12件）。ノートタイプ「画像マスキング」=`data/create-image-occlusion-notetype.mjs`（**要実行**・`is_system:true`・共有定義 `data/image-occlusion-template.mjs`）
  - **候補検出の2系統フォールバック**: ①`GOOGLE_CLOUD_VISION_API_KEY` があれば **Google Cloud Vision（DOCUMENT_TEXT_DETECTION）で正確なbbox**＋Claude テキストパスで暗記対象を選別（`recommended`）。②無ければ **Claude Vision で%bbox推定**（位置は**近似**＝UI微調整前提）。Vision キー未設定/失敗時は自動で②に縮退。レスポンスに `source: google-vision|claude-vision`
  - **編集UXの手直し高速化**: 枠タップ選択→ドラッグ移動／右下リサイズ／**選択中に画像タップでその位置へ移動**（モバイル）／オンスクリーン微調整パッド／PCは矢印キー（Shiftで大）／ドラッグ閾値でタップ誤作動防止
  - **共通エディタ＋一括作成＋再編集**: 編集キャンバスを controlled な `MaskRegionEditor`（`src/components/image-mask/`）に共通化。①単一作成 `/notes/image-mask/new` ②**一括作成** `/notes/image-mask/bulk`（複数画像→並列アップ＋AI検出（同時3）→各画像レビュー（展開で編集）→「全て作成」・各画像=1ノート・毎回隠す数は全件共通） ③**ビジュアル再編集** `/notes/image-mask/[id]/edit`（既存ノートを開き直し→PUT）。デッキ詳細に「画像マスキング」「一括マスキング」ボタン。ノート一覧の編集はマスクノートを自動でビジュアルエディタへ（`画像`＋`マスク領域` を持つノートを判定）。共有API `src/components/image-mask/api.ts`（uploadImage/detectCandidates）

## 多段階設問・識別演習（古文）✅（要実機確認）

1枚のカードに複数の設問を順番に解かせる演習（古典文法の識別演習が母体）。元プロトタイプ `swallow-base.com/kobun/shikibetsu`（手元の `SRS/index.html`）の構造を保持しつつ、**SRSはつばめSRSの本物のFSRS/SM-2エンジンで例文単位・日付ベース**に置換。

- **設計核**: 1ノート＝1例文＝1カード。例文に紐づく全設問を解き終えたら、正誤を集約して `onAnswer(ease)` を**1回だけ**呼ぶ（要件3「例文単位で間隔管理／設問ごとに別管理しない」）。スケジューラ・学習キュー・Undo・同期は無改修で再利用
- **純ロジック** `src/lib/multi-step/`（テスト24件）: `parse`（設問/傍線JSON・元教材の snake_case と camelCase 両対応）・`grade`（選択式の自動判定＋follow_up根拠問題の合算／記述式の自己採点／選択肢シャッフル／「わからない」）・`score`（**正誤85%＋解答時間15%で 0-100 のスコア**）・`deriveEase`（**スコアから SRS 評価を自動判定**）
- **自動判定ルール**（`deriveEase(score)`・しきい値は定数 `TARGET_MS_PER_QUESTION`/`SPEED_EASY_THRESHOLD`/`ACCURACY_HARD_THRESHOLD` で調整可）: 全問正解＆速い（目標=設問数×20秒の約1.25倍以内）→ 簡単 / 全問正解＆普通〜遅い → 正解 / 一部正解(正答率≥50%) → 難しい / <50% → もう一度
- **UI** `src/components/card/MultiStepCard.tsx`: 傍線ハイライト・question_type バッジ・follow_up根拠問題・ステップ進捗ドット・古文の世界観CSS。完了画面は**スコアによる自動判定をハイライト表示＋4択は常時表示で生徒がタップ手直し可**（既定=自動／変更すると「手動：◯◯」＋「自動判定に戻す」）。**iframe ではなく React で直接描画**（テキストは React エスケープで安全・`dangerouslySetInnerHTML` 不使用）
- **StudySession 連携**: `isMultiStepNote()` で検出し `MultiStepCard` に分岐。多段階カードは timer/swipe を無効化。`handleAnswer(ease, {score, stepResults})` でスコアも記録
- **スコア永続化**: `review_logs` に `score`(0-100) / `step_results`(JSON) 追加（`020_multi_step_scores.sql`・**適用済み**）。`LocalReviewLog`・`saveAnswerLocally`・push route・answer API にスレッド。**通常カードは新列に一切触れない後方互換**（識別演習のときだけ含める＝マイグレーション未適用環境でも既存同期は壊れない）
- **スコア表示** `/stats`: `useIdentificationScores`（Dexie 駆動・オフライン）＋`IdentificationScoreCard`（平均スコア・例文数・平均解答時間・直近スコア推移バー。スコア付きレビューが無ければ非表示）
- **ノートタイプ「識別演習」**: `data/multi-step-template.mjs`（共有定義）＋`data/create-multi-step-notetype.mjs`（`is_system:true`・**作成済み**）。フィールド=例文/識別対象/出典/現代語訳/傍線(JSON)/設問(JSON)/補足
- **サンプルデッキ**: `data/import-kobun-shikibetsu.mjs` が `index.html` の `QUESTION_DATA` を抽出して投入。「識別演習（古文）」=46例文ノート（原典10語）**投入済み**

## 現在の進捗

詳細は @docs/progress.md を参照。

- **最終更新**: 2026-06-19
- **直近の修正**: **多段階設問・識別演習（古文）を実装**（要実機確認）。1カードに複数設問→例文単位で1回SRS評価。**正誤＋解答時間のスコアから SRS 評価を自動判定**（生徒はタップで手直し可）。`src/lib/multi-step/`（テスト24件）＋`MultiStepCard`＋StudySession分岐＋`review_logs` に score/step_results（`020` 適用済み・後方互換）＋`/stats` スコアカード＋ノートタイプ「識別演習」＋サンプルデッキ46ノート。lint クリーン・テスト374件・build 成功
- **次にやること**:
  1. **識別演習の実機確認**: デプロイ＋再ログイン後、`/study`「識別演習（古文）」で多段階出題・自動判定・スコア・`/stats` スコアカードを確認。自動判定しきい値の調整も実データで
  2. **科目拡張**: 数学・理科デッキ作成（数式＋画像マスキングが使える）→ そこの「いきもの」も飼える（Phase 10 連携）
  3. **10.2 残**: しきい値の実データ調整／デイリーミッションのプッシュ連携（Phase 12.3）

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
