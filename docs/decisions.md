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

### 2026-07-07
- [20260707-sync-queue-durability](decisions/20260707-sync-queue-durability.md) `#sync` `#offline` `#srs` _(Phase SRS総合評価レポート)_ — 送信キューは「失敗を静かに埋もれさせない」設計にする
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

