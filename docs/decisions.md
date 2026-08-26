# 技術的意思決定ログ (ADR) — 索引

詳細は `docs/decisions/YYYYMMDD-<slug>.md` を参照。

## 使い方 (コード変更前のルーチン)

1. 関連領域のタグ (例: `srs`) で `grep -l "tags:.*srs" docs/decisions/*.md` を実行
2. 該当 ADR を読んで過去の判断・ハマりポイントを把握
3. それから実装に入る

タグ一覧: `srs` / `scheduling` / `sync` / `offline` / `auth` / `line` / `billing-sync` / `rls` / `schema` / `ui-ux` / `garden` / `llm` / `vision` / `content` / `infra` / `convention` (必要に応じて追加)

新しい ADR を追加したら `node scripts/regenerate-decisions-index.mjs` で索引更新。

---

## ADR 一覧 (新しい順)

### 2026-08-26
- [20260826-pen-onboarding-calibration](decisions/20260826-pen-onboarding-calibration.md) `#pen-syntax` `#reading` `#input` `#recognition` `#ux` _(Phase 構文分析のペン入力)_ — ペン入力の初回お手本登録の義務化と、登録お手本による閉じ括弧の判別強化・記号の扱い3点の修正
- [20260826-pen-input-acceptance](decisions/20260826-pen-input-acceptance.md) `#pen-syntax` `#reading` `#input` `#palm` `#diagnostics` _(Phase 構文分析のペン入力)_ — ペン入力の受け付け方針: ペン由来の互換タッチは止めない・描画中は画面を固定する
- [20260826-pen-foundation-hardening](decisions/20260826-pen-foundation-hardening.md) `#pen-syntax` `#reading` `#input` `#recognition` `#architecture` `#testing` _(Phase 構文分析のペン入力)_ — ペン入力の基盤の作り込み（ゾーン方式・入力/座標の一元化・記号台帳の確定版・記録の再生）
- [20260826-pen-finger-scroll](decisions/20260826-pen-finger-scroll.md) `#pen-syntax` `#reading` `#input` `#palm` `#ux` _(Phase 構文分析のペン入力)_ — ペン入力モード中の指の扱い: 常時無効化をやめ「ペンの接近・接触中と直後だけ止める」時間窓方式に

### 2026-08-25
- [20260825-sparta-program-management](decisions/20260825-sparta-program-management.md) `#teacher` `#sparta` `#mastery` `#review_logs` `#progress` _(Phase sparta)_ — スパルタプログラム管理（登録・自動進捗・終了判定）
- [20260825-pen-syntax-feasibility](decisions/20260825-pen-syntax-feasibility.md) `#reading` `#ui-ux` `#pen-input` `#testing` _(Phase 読解 ペン入力検証)_ — 構文分析のペン入力 — 実現可能性検証の実装設計
- [20260825-pen-pos-letters](decisions/20260825-pen-pos-letters.md) `#pen-syntax` `#reading` `#syntax` `#notation` _(Phase 構文分析のペン入力)_ — 品詞の書き込みは黄リー教式の英字略記6種（n/v/a/ad/aux/p）に統一する

### 2026-08-21
- [20260821-syntax-ai-trial](decisions/20260821-syntax-ai-trial.md) `#reading` `#llm` `#schema` `#ui-ux` `#cost` _(Phase 読解 構文AI試行)_ — 構文添削AI判定の試行導入 — 実装設計

### 2026-08-20
- [20260820-reading-page](decisions/20260820-reading-page.md) `#reading` `#工房連携` `#C22` `#途中保存` `#teacher` `#pwa` `#ui` _(Phase 読解 第1弾)_ — 読解ページ（工房の2アプリを1本の流れに統合して演習室へ移す・第1弾）

### 2026-08-19
- [20260819-deck-review-pause](decisions/20260819-deck-review-pause.md) `#notifications` `#line` `#user_deck_settings` `#billing連携` `#teacher` _(Phase 12.4)_ — デッキ単位の復習通知停止（reviewPaused）と集計時の自動解除

### 2026-07-08
- [20260708-teacher-student-deck-settings](decisions/20260708-teacher-student-deck-settings.md) `#rls` `#srs` `#ui-ux` `#scheduling` — 配布デッキの学習設定は講師が生徒ごとに上書きできる（user_deck_settings 共有）
- [20260708-subdeck-assignments](decisions/20260708-subdeck-assignments.md) `#rls` `#schema` `#sync` `#ui-ux` — サブデッキの配布は「継承配布行」を明示的に作る（source_deck_id）

### 2026-07-07
- [20260707-sync-queue-durability](decisions/20260707-sync-queue-durability.md) `#sync` `#offline` `#srs` _(Phase SRS総合評価レポート)_ — 送信キューは「失敗を静かに埋もれさせない」設計にする
- [20260707-student-first-navigation](decisions/20260707-student-first-navigation.md) `#ui-ux` `#convention` — 生徒ファーストのナビゲーション（下メニューは毎日使う4つ＋「もっと」に格納）
- [20260707-practice-mode-local-logging](decisions/20260707-practice-mode-local-logging.md) `#srs` `#offline` `#ui-ux` `#garden` _(Phase SRS総合評価レポート)_ — 練習モードの回答は「端末内ローカルログのみ」で実績に数える
- [20260707-ops-rules-cms](decisions/20260707-ops-rules-cms.md) `#convention` — 開発運用ルールを CMS 方式に揃える
- [20260707-learn-ahead](decisions/20260707-learn-ahead.md) `#srs` `#scheduling` `#ui-ux` — 学習ステップの待ち時間を learn-ahead（前倒し出題）で解消する

### 2026-06-19
- [20260619-teacher-shared-decks](decisions/20260619-teacher-shared-decks.md) `#rls` `#auth` `#sync` — 講師デッキは講師間で自動共有・共同編集にする
- [20260619-subdeck-review-filter](decisions/20260619-subdeck-review-filter.md) `#srs` `#scheduling` — フィルタサブデッキは復習もタグで絞る（設計転換）

### 2026-06-15
- [20260615-math-mathml](decisions/20260615-math-mathml.md) `#content` `#ui-ux` _(Phase 13)_ — 数式は KaTeX の MathML 出力でブラウザネイティブ描画する
- [20260615-garden-cosmetic-layer](decisions/20260615-garden-cosmetic-layer.md) `#garden` `#srs` `#ui-ux` _(Phase 10)_ — 記憶のいきもの育成は FSRS から導出する純コスメティック層にする

### 2026-06-14
- [20260614-collocation-deck-design](decisions/20260614-collocation-deck-design.md) `#content` `#srs` `#llm` — コロケーション中心デッキは「構文単位SRS＋例文ローテーション」で設計する

