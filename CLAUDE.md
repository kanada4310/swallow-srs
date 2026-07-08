# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**つばめSRS** - 塾（つばめ学習舎）向けのWeb版SRS学習アプリ
- コンセプト: **Web版Anki + 塾向け講師機能**
- 生徒数: 約40-50名
- デバイス: スマホ・タブレット中心

## コミュニケーションルール（最重要・すべての応答に適用）

### 前提

ユーザーは技術者ではない塾（つばめ学習舎）の経営者。このプロジェクトの意思決定者であり、内容を把握する責任を負う「上司」である。Claude は圧倒的に多くの情報を持つ「部下」であり、**上司が読んだだけで正しく把握・判断できる報告をすることが Claude の義務**。「伝えた」ではなく「伝わった」が基準。

### 言語と用語

- すべて日本語で書く。英語の文章・コマンド出力をそのまま貼らず、要点を日本語で説明する
- 技術用語・カタカナ語・略語は極力使わない。避けられない場合は初出時に一行で意味を添える（例:「デプロイ（作ったものをインターネット上で使える状態にする作業）」）
- コードやエラーメッセージは原則見せない。「何が起きたか・どう影響するか」を生活の言葉で説明する
- 機能に言及するときは日本語の機能名で呼ぶ（ファイル名・関数名を本文に混ぜない）

### 報告の型

- **結論ファースト**。最初の一文で「できた／できなかった／判断が必要」のどれかが分かるように書く
- 一度に伝える論点は**3つまで**。それ以上あるなら重要な順に絞り、残りは「他にも細かい点がありますが、必要なら説明します」に畳む
- 長い報告は「3行以内の要約 → 詳細」の2段構えにする。詳細を読まなくても判断できる要約にする
- 進行中の作業では、方針が変わったとき・重要な発見があったときに短く途中報告する

### 判断を仰ぐとき

- **技術的な質問をしない**。技術の選択は Claude が責任を持って決め、上司には「体験・お金・時間・リスクにどう響くか」の言葉に翻訳して伝える
- 選択肢は最大3つ。各選択肢は2行以内で「選ぶとどうなるか」を書く
- **必ず推奨案を先頭に置き、理由を一行添える**。「おまかせ」「それで進めて」と言われたら推奨案で進める
- 何を決めてほしいのかを質問の冒頭で明示する（「決めていただきたいのは○○です」）

### 正直さ

- 失敗・未完了・スキップした作業は、隠さず最初の一文で明示する
- 不確かなことは「確認できていませんが」と前置きし、断定と区別する
- 上司の指示に問題（設計方針との矛盾、想定外のコスト等）があると気づいたら、実行前に指摘する

### 事前承認が必要な操作

以下は判断材料と推奨案を添えて、実行前に必ず確認を取る:

- お金が発生する・発生しうる操作（有料サービスの契約、従量課金の API 等）
- 外部に公開される操作（インターネット公開、外部サービスへの送信）
- 削除・上書きなど元に戻しにくい操作

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

## コロケーション中心デッキ（本番974語・投入済み）

L2語彙論（高頻度語はコロケーション/フレーズで覚える、構文=コア+スロット）に基づく設計。パイロット50語で検証後、**本番974語**に拡張・投入済み。
- **本番デッキ（2026-06-22）**: パイロット50語を拡張。対象=**動詞343＋形容詞361＋副詞148＋前置詞42＋接続詞42＋助動詞19＝955語スコープ ∪ パイロット多義名詞19 = 974語**（名詞/代名詞/冠詞/間投詞は具体名詞中心ゆえ除外＝暗誦デッキに任せる）。デッキ「中学英単語 コロケーション」(`95cffa07…`, owner gaimon.maam, **未配布**)＝**2916ノート**。生成: `build_prod_words.py`→`build_colloc_workflow`(2743コロケ)→`build_exemplar_workflow`(例文プール5本)→`build_prod_deck.py`→文脈→`combine_decks.py`＋`build_colloc_notes.py`→`import-colloc-deck.mjs --notes=prod_colloc_notes.json --deck=...`。**文脈アシストは約70%（1911/2742）でAPI月次上限に到達**＝残825は上限回復後に `update-colloc-context.mjs` で in-place top-up（@docs/progress.md 2026-06-22 メモに手順）。**context ワークフローは順次実行**（並列だとレート制限）
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
- **★復習もタグで絞る（2026-06-19 変更）**: 以前は「復習はフィルタ無視・親全体から」だったが、サブデッキ学習で無関係な親の復習が出るのを嫌い、`getStudyCardsOffline` で**新規・復習の両方をタグで絞る**よう変更。デッキ一覧の「復習 N」表示（元々タグ絞り済み）と一致。全件まとめて復習したい時はフィルタの無い親（ルート）デッキを学習する

## 講師デッキの自動共有・共同編集（2026-06-19）✅ 実機確認済み

講師（teacher/admin）が作ったデッキ・ノートは講師間で**自動共有・共同編集**できる（生徒には共有しない）。
- **RLS** `021_teacher_shared_decks.sql`（**Supabase 適用済み**）: 既存 `is_teacher_or_admin()` を使い、decks/notes/cards/deck_assignments に「講師は講師所有のものを全操作可」、note_types/card_templates に「講師は講師所有のものを閲覧可」の permissive ポリシーを追加（編集はオーナーのみ＝構造破壊回避）
- **サーバー権限** `canManageDeck(supabase, userId, deckOwnerId)`（`src/lib/api/auth.ts`）= 自分のデッキ or（自分が講師 かつ 所有者も講師）。各 API の `owner_id !== user.id` 判定を一括置換（decks/[id]・notes・notes/[id]・bulk-delete・bulk-tags・copy-move・import・search・decks(親)・deck-assignments・export）
- **pull API**: 講師には他講師の全デッキ＋ノートタイプ＋テンプレートを admin client で配信（`isTeacher`＋`teacherIds`）。共有デッキのノート/カードも admin client で読む（RLS 適用前でも表示は可・編集は 021 必須）
- **クライアント**: デッキ詳細 `canEdit = isOwner || isTeacher`（設定も実デッキを編集）。デッキ一覧は非自分デッキを講師なら「講師共有デッキ」節に出し、削除・設定（実デッキ）を許可。`/notes` は既存の `isTeacherOrAdmin` 判定で対応済み
- **注意**: 講師数は少数だが、共有で各講師が全講師デッキ（中学英単語6858等含む）を pull するため同期は重め

## デッキ一覧のサブデッキ折りたたみ（2026-06-19）

- デッキ一覧でサブデッキを**既定で折りたたみ**（アコーディオン）。`DecksPageClient` の `expandedDecks`（展開中 id 集合・既定空）＋`getVisibleNodes`（祖先が全展開のノードのみ表示）。親デッキの行頭シェブロンで開閉。検索中は全展開（一致が見えるように）

## 学習体験の小改善（2026-06-19）

- **カード種別バッジ**: 学習画面の進捗バー左に 🆕新規 / 🔁復習 / 📖学習中 を色分け表示（`CardStateBadge`・`currentCard.schedule.state` で判定）
- **繰り上げ学習（練習モード）**: その日の復習・新規をやりきった後でも「➕ もっと練習する」で続行可。`getPracticeCardsOffline`（期限が近い順の未来復習＋枠外の新規、スコープは通常学習と同じ）＋ `StudySession` の `practiceMode`（**card_states は更新しない**＝早期復習でスケジュールを乱さない安全設計。インプリント等の永続化も practiceMode でスキップ）。**練習実績は端末内だけに `practice:true` 付き review_log を残す**（`savePracticeReviewLog`・サーバー非同期・sync_queue非経由）＝連続日数/デイリーミッションには数え、`/stats`・講師進捗（サーバー由来）と識別スコアは汚さない。ADR `20260707-practice-mode-local-logging`。完了画面・「カードがありません」画面の両方にボタン
- **講師アカウント作成スクリプト**: `data/create-teacher-account.mjs`（Supabase admin で email+password ユーザー作成＋profiles を role=teacher で upsert。`--email/--password/--name/--reset-password/--dry-run`）。荒井先生（naobees70@gmail.com）作成済み

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
- **純ロジック** `src/lib/multi-step/`（テスト26件）: `parse`（設問/傍線JSON・元教材の snake_case と camelCase 両対応）・`grade`（選択式の自動判定＋follow_up根拠問題の合算／選択肢シャッフル／「わからない」／記述式は `completeText`＝模範解答を見て進むだけ・採点なし）・`score`（**正誤85%＋解答時間15%で 0-100 のスコア**。`StepResult.graded` で記述式は正答率に算入しない）・`deriveEase`（**スコア(accuracyPct)から SRS 評価を自動判定**）
- **自動判定ルール**（`deriveEase(score)`・しきい値は定数 `TARGET_MS_PER_QUESTION`/`SPEED_EASY_THRESHOLD`/`ACCURACY_HARD_THRESHOLD` で調整可）: 全問正解＆速い（目標=設問数×20秒の約1.25倍以内）→ 簡単 / 全問正解＆普通〜遅い → 正解 / 一部正解(正答率≥50%) → 難しい / <50% → もう一度
- **UI** `src/components/card/MultiStepCard.tsx`: 傍線ハイライト・question_type バッジ・follow_up根拠問題・ステップ進捗ドット・古文の世界観CSS。完了画面は**スコアによる自動判定をハイライト表示＋4択は常時表示で生徒がタップ手直し可**（既定=自動／変更すると「手動：◯◯」＋「自動判定に戻す」）。**iframe ではなく React で直接描画**（テキストは React エスケープで安全・`dangerouslySetInnerHTML` 不使用）
- **StudySession 連携**: `isMultiStepNote()` で検出し `MultiStepCard` に分岐。多段階カードは timer/swipe を無効化。`handleAnswer(ease, {score, stepResults})` でスコアも記録
- **スコア永続化**: `review_logs` に `score`(0-100) / `step_results`(JSON) 追加（`020_multi_step_scores.sql`・**適用済み**）。`LocalReviewLog`・`saveAnswerLocally`・push route・answer API にスレッド。**通常カードは新列に一切触れない後方互換**（識別演習のときだけ含める＝マイグレーション未適用環境でも既存同期は壊れない）
- **スコア表示** `/stats`: `useIdentificationScores`（Dexie 駆動・オフライン）＋`IdentificationScoreCard`（平均スコア・例文数・平均解答時間・直近スコア推移バー。スコア付きレビューが無ければ非表示）
- **ノートタイプ「識別演習」**: `data/multi-step-template.mjs`（共有定義）＋`data/create-multi-step-notetype.mjs`（`is_system:true`・**作成済み**）。フィールド=例文/識別対象/出典/現代語訳/傍線(JSON)/設問(JSON)/補足
- **サンプルデッキ**: `data/import-kobun-shikibetsu.mjs` が `index.html` の `QUESTION_DATA` を抽出して投入。「識別演習（古文）」=46例文ノート（原典10語）**投入済み**

## 古文単語演習（tango.html モードA/B）✅（要実機確認）

`docs/tango.html`（つばめ古文 単語演習）のモードA/Bを **SRSカードに統合**。元データ `quiz_generator/data/古文/古文単語315.json`（全315語）。並行セッションの識別演習（多段階）と非干渉になるよう **独立した新カード種別**として実装（`src/lib/multi-step/*`・`MultiStepCard.tsx` には不干渉。共有ファイルは `StudySession.tsx` の分岐追加のみ）。

- **設計核**: 1ノート＝1問（1カード）。**モードA**＝見出し語→該当する意味をすべて選ぶ（複数選択）／**モードB**＝例文の傍線部→意味を四択。正誤＋解答時間でスコア化し SRS 評価を**自動判定**＋タップ手直し（識別演習と同じUX）。`review_logs` の既存 score/step_results 列に乗せるので**新マイグレーション不要**
- **ダミー選択肢**: インポート時に「同品詞・正解と非類似（`glossSim`）」の語義プールを生成してノートの `問題.distractors` に**焼き込み**、カードは毎レビューでプールから抽出（例文プール／画像マスクと同じ「毎回ランダム」）。モードA のダミー数 `max(正解数,4-正解数,2)`、モードB は四択
- **ノートタイプは A/B 別**（フィールド構成が異なるため）。`問題`(JSON) には採点に必要な配列（`correct`/`distractors`）だけを入れ、表示用テキスト（例文・傍線形・出典・訳）は**フラットフィールド**に持つ＝標準エディタで編集可能
- **純ロジック** `src/lib/kobun-tango/`（types/parse/grade/index＋テスト18件）: `parseKobunQuestion`（{mode,correct,distractors}）・`parseKobunMeta`・`parseKobunBDisplay`（例文/傍線形/出典/訳をフラットフィールドから）・`isKobunTangoNote`・`buildOptionsA/B`・`grade`（モードA は集合一致＋部分点 `(tp-fp)/正解数`、モードB は一致）・`computeKobunScore`・`deriveKobunEase`
- **UI** `src/components/card/KobunTangoCard.tsx`: tango.html の世界観（paper/indigo/enji）。複数/単一選択・「わからない」・採点後の色付け（正解/誤答/取りこぼし）・フィードバック（正しい意味＋訳）→SRS評価パネル。**React直接描画**（`dangerouslySetInnerHTML` 不使用）。`StudySession` が `isKobunTangoNote` で分岐（timer/swipe 無効）
- **ノートタイプ**: `data/kobun-tango-template.mjs`（A/B 定義の共有元）＋`data/create-kobun-tango-notetype.mjs`（両方を is_system で作成・**作成済み**）。「古文単語演習A（単語→意味）」=通し番号/品詞/見出し語/漢字/問題 ／「古文単語演習B（例文→傍線部）」=通し番号/品詞/見出し語/漢字/例文/傍線形/出典/現代語訳/問題
- **デッキ「古文単語315」**（**投入済み** owner=gaimon.maam）: `data/import-kobun-tango.mjs`（`--reset` で旧デッキ/旧単一ノートタイプを削除して再投入）。**904ノート**（A=315／B=589。A はノートタイプA、B はノートタイプB）＋モード別フィルタサブデッキ「モードA（単語→意味）」「モードB（例文→意味）」（filter_tags でモード選択を再現）
- **要実機確認**: Vercel デプロイ＋再ログイン後 `/study`「古文単語315」or モードサブデッキで出題・自動判定・スコア。`deriveKobunEase` のしきい値（`grade.ts` の TARGET_MS/SPEED_EASY_THRESHOLD/ACCURACY_HARD_THRESHOLD）は実データで要調整
- **表示改善（2026-07-07）**: ①**モードA は出題中に漢字（読み仮名）を非表示**（答えの推測防止・採点後フィードバックの `見出し語（漢字）` は従来どおり）②**解答表示で「あなたの解答」＋「正しい選択肢」を両タグ表示**（A/B共通。正解が複数あり1つだけ選んだ時に選んだ正解が誤答と誤解されるのを防止）。`KobunTangoCard.tsx` の `optTag` を複数タグ返却に変更

## 単語帳（定着度ビュー）＝マイ単語帳（2026-07-07）✅（要実機確認）

「間違えを蓄積して苦手単語を一覧化・全単語を定着度で可視化・定着度で絞り込み」（タゲ友「マイ単語帳」イメージ）。**全デッキ共通**。ログイン中ユーザー自身の `card_states`（FSRS）から導出する**純表示層**で学習エンジンには一切触れない（庭 `plant-state` と同じ思想・オフライン可）。
- **入口**: デッキ詳細ページのノート一覧セクションに**タブ切替**「ノート一覧」⇄「単語帳（定着度）」（`DeckDetailClient.tsx`・`useAuth()` の userId を渡す）。生徒・講師とも表示
- **純ロジック** `src/lib/wordbook/mastery.ts`（テスト13件）: `deriveMastery(card_states)` → 5段階 **未学習/苦手/学習中/定着中/定着済み**。しきい値 `MASTERY_THRESHOLDS`=学習中<7日≤定着中<21日≤定着済み（実効 stability＝FSRS stability or SM-2 interval）。**苦手**＝relearning／learning での失敗／`lapses≥WEAK_LAPSES(2)` かつ未固定（eff<21）。`aggregateMastery`（1単語=複数カード時は一番弱いレベル採用）・`MASTERY_ORDER`（苦手=最優先）
- **データ** `src/lib/wordbook/wordbook-data.ts`: `getWordbookForDeck(deckId, userId)`＝デッキ＋子孫の全カード×card_states を**見出し語（無ければ note 単位）でグループ化**して `WordbookEntry[]`（label/sub/pos/mastery/reviewCardId/reviewDeckId）。`pickLabel` 再利用。`Array.from(map.values())` 必須（downlevelIteration）
- **UI** `src/components/deck/WordbookView.tsx`: `useLiveQuery`。定着度フィルタチップ（件数バッジ＋色）＋検索＋苦手が上の並び。単語タップ→`/study?deck=X&card=cardId`（既存 priorityCardId で当該カードを最優先復習）。100件ずつ「もっと見る」
- **注意**: 定着度は本人の card_states 由来（講師が生徒の定着度を見るのは `/students/progress`）。sub（補足）は汎用フィールド（意味/和訳/Back/漢字…）から拾うため古文モードA は漢字が出る（語義は 問題 JSON 内で未抽出＝将来強化余地）

## デザインシステム「藍・空・喉の橙」（2026-07-07）✅ 全画面適用済み

一次仕様 @docs/design-system.md（トークン・慣用句・置換マップ・禁止事項）。つばめの羽色をブランド化。
- **トークン**（tailwind.config.ts）: `ai`(藍・見出し/濃地)・`sora`(空・アクション)・`nodo`(橙・最重要CTA/ストリーク、**1画面1箇所**)・`paper`/`ink`系・評価4色 `again/hard/good/easy`(+`-bg`)・`rounded-card`(18px)・`shadow-card`
- **適用範囲**: 全ページ＋全共有コンポーネント。学習画面=回答4ボタン「淡地×濃字・正解のみ塗り」＋Anki式3色残数／完了画面=つばめメダル＋統計3枚組＋0枚時文言分岐／生徒ホーム=「今日のミッション」カード（日次新規枠を反映した実枚数＋開始CTA）＋🔥ストリークチップ／デッキ一覧=ラベル付き意味色チップ（新規=easy・学習中=hard・復習=good、モバイルでも表示）
- **カード内部の世界観は独立**: ノートタイプのテンプレートCSS・KobunTangoCard(paper/indigo/enji)・MultiStepCard(古文様式)・庭アートにはブランドを持ち込まない（カード様式ごとに自由）
- **PWA**: theme_color=#1C2B4B。`SwallowMark`（`src/components/ui/SwallowMark.tsx`）はヘッダー/完了/空状態のみ。InstallPrompt は `/study` では出さない
- **残**: public/icons のPNGアイコン再生成（旧ブルーのまま）／ダークモード（トークン化済みなので差し替えのみ）

## チュートリアル（2026-07-07）✅ 第1弾

「ドキュメントではなく触りながら覚える」3層設計。
- **① チュートリアルデッキ「つばめSRSのつかいかた」**: 15枚（Basic・template_index 0 のみ=逆カードなし・created_at 1秒刻み=台本順出題）。`data/create-tutorial-deck.mjs`（`--reset` で再投入）。**投入済み**（owner gaimon.maam・**未配布**=講師がUIから配布）。評価ボタン/SRSの仕組み/3色残数/バッジ/取り消し/練習モード/スワイプ/通知/統計を実演形式で学ぶ
- **② コーチマーク**: `src/lib/tutorial/coach.ts`（localStorage 既読管理）＋`src/components/ui/CoachTip.tsx`。第1弾=学習画面の初回フリップ時に評価4ボタンの意味を1度だけ表示
- **出題順の土台修正**: `getStudyCardsOffline` が deckCards を created_at→id で安定ソート（「順番どおり」設定が本当に作成順になった。従来はIndexedDBのUUID順=実質ランダム。全デッキに効く）

## 生徒ファーストのナビゲーション（2026-07-07）✅ デプロイ済

「生徒が日常的に見るものをすぐ見えるようにし、普段使わない設定・機能は格納する」（経営判断）。ADR `20260707-student-first-navigation`。
- **下メニュー**: 生徒=`ホーム/デッキ/統計/もっと`（4項目）、講師=`ホーム/デッキ/生徒/統計/もっと`（5項目）。**定員目安=生徒4・講師5**。項目を足したくなったら、まず `/more` 行きを検討
- **「もっと」ページ** `/more`（`src/app/(student)/more/page.tsx`）: ノート/テンプレート/通知設定/設定/ログアウトを格納。OfflineNavContext に静的登録済み（オフライン可）。**機能は消していない**＝URL直打ちも従来どおり
- **ヘッダー**: ベル・歯車・ログアウトを撤去（ロゴ＋ユーザー名＋SyncIndicator のみ）
- **デッキ詳細の既定タブ**: 生徒=単語帳（定着度）、講師=ノート一覧（`userRole` prop で初期値分岐）。タブ順も単語帳が左
- **デッキ一覧の新規作成**: 講師=ヘッダー右上のまま、生徒=ページ下部の控えめな点線リンク

## 学習開始のデッキ選択＋サブデッキ体験の穴埋め＋生徒別設定（2026-07-08）

4機能をまとめて実装（ADR `20260708-subdeck-assignments` / `20260708-teacher-student-deck-settings`）。
- **ホームの学習開始**: ミッションカードに**ルートデッキ別内訳**（デッキ名＋枚数・最大3行）。対象1つ=即開始／2つ以上=`StudyDeckPicker` モーダルで選択（`src/app/page.tsx`・`src/components/home/StudyDeckPicker.tsx`）
- **フィルタサブデッキの詳細表示**: ノート一覧・単語帳・統計3枚を**ルートツリー＋タグ絞り**で表示（従来は実体が親にあるため全部空＝不具合に見えた）。共通ヘルパー `src/lib/db/deck-scope.ts`（`resolveDeckScope`/`noteMatchesFilterTags`・テスト10件）。実体作成系ボタンはフィルタサブデッキでは非表示＋絞り込み説明を表示。NoteBrowser はタグ1つならサーバー検索の `tag` に固定・複数はクライアント絞り
- **サブデッキも一緒に配布**: `deck_assignments.source_deck_id`（NULL=直接、非NULL=継承元）＋部分一意IDX＋既存配布のバックフィル（`022_subdeck_assignments.sql`）。配布API が子孫へ伝播（冪等）・解除も連動・後から作ったサブデッキも自動継承・削除ガードは直接配布のみ。継承行はUIで「親デッキから配布」バッジ＋解除不可。**notes/search のクラス配布403バグも修正**
- **生徒別の学習設定を講師が変更**: `user_deck_settings` に講師RLS（`is_student_of_teacher` 基準・`023_teacher_student_deck_settings.sql`）＋API `/api/teacher/student-deck-settings`（GET/PUT/DELETE・**deckId をサーバーでルート解決**）＋生徒詳細のデッキ別進捗ルート行に⚙→ DeckAdvancedSettings モーダル（保存/既定に戻す）。生徒本人の変更し直しは許容（後勝ち）。反映は生徒の次回同期。**非オーナー設定がサブデッキIDで保存され読まれないバグもルートキーに統一して修正**

## 現在の進捗

**進捗・現在地・次にやること・既知の課題は @docs/progress.md に集約**（このファイルには書かない）。詳しいセッション履歴は `docs/progress/`（ハンドオフ／アーカイブ）、技術判断は `docs/decisions.md`（ADR索引）を参照。

- **最終更新**: 2026-07-08
- **直近**: 学習開始のデッキ選択＋フィルタサブデッキ表示＋サブデッキ配布＋生徒別設定の4機能を実装・デプロイ。**マイグレーション 022/023 は適用済み**（当初 SQLエディタ経由・バックフィルで継承配布行49件生成を確認）。**その後 `supabase login` を再設定して CLI 復旧・020〜023 を `migration repair` で履歴記録済み＝以後は通常どおり `db push` 可**

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

## 開発運用ルール（CMS方式を踏襲）

- **実装前に必ず Plan Mode で計画を立て、承認を得てから実装に入る。** 3ファイル以上に影響する変更は必須
- **1タスク完了ごとに git commit。動く状態を保つ。** git push はユーザーが依頼したとき or Phase 完了時（Vercel 自動デプロイのため動作確認済みの状態でのみ）
- **セッション終了時のハンドオフは個別ファイル。** `docs/progress/handoff-YYYY-MM-DD.md` を新規作成し、`docs/progress.md` の「最新ハンドオフ」リンクを差し替える（直前分は「過去ハンドオフ」へ）。**過去分を progress.md 本体に積み上げない**
- **重要な技術判断は ADR に残す。** 実装前に `docs/decisions.md`（索引）を開き、関連タグで `grep -l "tags:.*<tag>" docs/decisions/*.md` → 該当 ADR を読んでから実装。新しい判断は `docs/decisions/YYYYMMDD-<slug>.md` を frontmatter（date / tags / phase / slug）付きで作成し、`node scripts/regenerate-decisions-index.mjs` で索引更新
- **品質チェックは `/check`。** 型（`npx tsc --noEmit`）・Lint（`npm run lint`）・テスト（`npm run test`）を一括点検。コミット前・Phase 完了時に回す
- **DB マイグレーションは新規ファイルを追加する。** 既存の `supabase/migrations/` を直接編集しない

## 禁止事項

- `dangerouslySetInnerHTML` を未サニタイズで使用しない
- Supabase RLS をバイパスするクエリを書かない
- 同期処理で `updated_at` を無視しない
