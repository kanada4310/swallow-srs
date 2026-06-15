# 進捗管理

## 現在の作業
- Phase: **Phase 10「記憶のいきもの育成」** — 10.1〜10.4 完了＋**10.5 一部（ストリーク/ヒートマップ）完了**。残るは 10.5残/10.2残
- 最終更新: 2026-06-15
- 次にやること:
  1. **★SQL実行**: `supabase/migrations/019_user_creature_state.sql`（未実行だと品種保存が500）→ Vercel デプロイ → 再ログインで Dexie v12 マイグレーション
  2. **実機確認**: 品種ピッカー／品種別の庭／10.3 枯れ株一覧／`/stats` ストリーク・ヒートマップ／`/garden` の🔥連続日数
  3. **Phase 10.5 残**: デイリーミッション（今日◯株）＋プッシュ連携、クラスランキング（成長率・オプトアウト可）、アチーブメントバッジ
  4. **10.2 残**: 大規模デッキの全体表示（現状 MAX_TILES=150 打ち切り→PixiJS化）／学習完了→庭で成長を見せる演出
  5. **しきい値調整**: `GROWTH_THRESHOLDS`/`CARE_THRESHOLDS` を実データで検証
  6. **その後**: Phase 13.4 リッチ表示（数式・画像）→ 科目拡張
  7. パイロット系（別軸）: OOV例文リペア / 全語展開

## セッション引継ぎメモ

### 2026-06-15（Phase 10.5 一部 — 学習ストリーク＆ヒートマップ）
- **依頼**: 「今のが終わったら次のステップも進めておいて」→ ロードマップ順で 10.5 の最も自己完結なスライス（ストリーク/ヒートマップ）を実装。review_logs から導出＝新DB不要・オフライン可・実データ調整不要で 10.x の実績パターンに沿う
- **実装**:
  - `src/lib/stats/streak.ts`（純ロジック）: `studyDayKey`（4時区切り）/`levelFor`/`countByStudyDay`/`computeStreak`（current＝当日未学習でも継続、longest＝独立に最長連続）/`buildHeatmap`（週×7日・日曜整列・未来は future フラグ）。テスト13件（4時境界・連続/中断・同日複数）
  - `src/lib/stats/useStreak.ts`: Dexie reviewLogs を `useLiveQuery`（同期で自動再描画・オフライン可）→ `{current,longest,heatmap,empty,loading}`。`useMemo` で再計算
  - `src/components/stats/StreakHeatmap.tsx`: 🔥連続日数＋最長＋GitHub風ヒートマップ（emerald 5段階、曜日ラベル、凡例）。barrel に追加
  - 表示: `/stats` 上部（Dexie駆動なのでサーバー統計のロード/エラーとは独立）＋`/garden` ヘッダーに🔥連続日数チップ（`useStreak` 再利用）
- **ハマり/学び**: `[...map.keys()]` は本プロジェクトの tsconfig target で `--downlevelIteration` エラー → **`Array.from(...)` を使う**（next build で発覚、vitest は通る）
- **検証**: 311テスト全通過（298→+13）／lint クリーン（既存 TemplatePreview 警告のみ）／本番ビルド成功（`/garden` 10.4kB・`/stats` 1.77kB・52ページ）
- **次セッション注意**: 要 Vercel デプロイ（新コンポーネント）。実機は同期後に `/stats`・`/garden`。ヒートマップは直近12週・4時区切り。ストリークの定義は「当日未学習でも切らさない／翌日になって未学習だと切れる」。10.5 残はデイリーミッション（プッシュ連携 Phase 12.3）・クラスランキング（成長率/オプトアウト・講師ビュー＋RLS要）・バッジ（保存先の検討要）

### 2026-06-15（Phase 10.4 品種インプリント）
- **依頼**: 10.3 完了に続き「品種選択に進んで」。**学習の初回出題時に選択／ベース形状＋品種色／AI初期提案は見送り**で合意
- **データモデル（唯一の新規）**: `user_creature_state(user_id, note_id, imprint JSONB, nickname)`。card_states には一切触れない純コスメ層
  - SQL `supabase/migrations/019_user_creature_state.sql`（RLS=自分のみ・updated_at トリガ）**※要 Supabase 実行**
  - 型 `UserCreatureState`/`CreatureImprint`（`types/database.ts`）
  - Dexie **v12** `userCreatureState: 'id, user_id, note_id, [user_id+note_id]'`＋ヘルパー `createCreatureStateId`/`getCreatureState`/`saveCreatureState`/`getCreatureStatesMap`（`schema.ts`）。`clearAllData` にも追加
  - 同期: pull API（`/api/sync/pull`）＋`savePulledData`（`sync.ts`）に `userCreatureState` を追加。保存は `POST /api/garden/imprint`（upsert・VARIETY_MAP で検証）。クライアントは Dexie 即時＋オンライン時に fire-and-forget POST
- **品種カタログ**: `src/lib/garden/varieties.ts`（果樹6: りんご/みかん/さくらんぼ/ぶどう/レモン/いちじく＋花き5: ひまわり/チューリップ/ばら/コスモス/あさがお）。各 {id,name,kind,accent,accentDark,accentLight,emoji}。`pickVarietyByHash`（おまかせ＝noteId から決定的・FNV風）
- **スプライト**: `PlantSprite` に `variety?` 追加。**ベース形状＋品種色**＝果樹は果実色、花き(kind='flower')は mature=つぼみ/blooming=花（花びら7枚＋中心）。早い段階（種/芽/苗）は品種差なし。しおれ以降は実/花が出ない（既存の lush 判定流用）。※5段階フル描き下ろしは将来
- **初回インプリントUI**: `ImprintPicker`（3列グリッド＋おまかせ＋あとで）。`StudySession` に統合＝currentCard が `state==='new'` かつ Dexie に未刻印のノートのみ1度プロンプト。`resolvedNotesRef`（Set）でセッション内の再プロンプト/再クエリ抑止。「あとで」はスキップ（保存せず汎用の姿）。プロンプト中はタイマー一時停止
- **描画反映**: `IsoTile`/`GardenField`/`WitheredList`/`/garden`(個別モーダル) に variety を伝播。`getGardenForDeck`/`getWitheredPlants` が `getCreatureStatesMap` で note→品種を解決（未刻印は汎用）。`pickLabel` を garden-data から export して StudySession のラベル抽出に再利用
- **検証**: 298テスト全通過（291→+7、varieties 7件＋garden-data モックに `getCreatureStatesMap` 追加）／lint クリーン（既存 TemplatePreview 警告のみ）／本番ビルド成功（`/garden` 9.7kB・`/api/garden/imprint` 登録・52ページ）
- **次セッション注意**:
  - **★最重要: `019_...sql` を Supabase で実行**しないと品種保存が 500（Dexie 側は動くがサーバー upsert 失敗）
  - **要 Vercel デプロイ＋再ログイン**（Dexie v12 マイグレーション＝既存ユーザーは初回 sync で userCreatureState 取得）
  - 大規模デッキ（中学英単語6858）では new カードのたびにプロンプト → 「おまかせ/あとで」で流せる設計だが、頻度が気になるなら「デッキ設定でインプリントOFF」等を将来検討
  - 品種別スプライトは色＋形状の差のみ（ぶどうも丸い実）。フィデリティを上げるなら品種ごとの専用パスを追加

### 2026-06-15（Phase 10.3 枯れ株一覧・復活導線）
- **依頼**: /start-session → 10.1/10.2 実機確認済み・文脈アシストのデプロイ確認済みを確認 → 今回の主軸は **Phase 10.3 枯れ株一覧（復活導線）**
- **設計決定（ユーザー合意）**: ①一覧は **`/garden` 内・全デッキ横断**（枯れ株は複数デッキに散るため）②「水やり（復活）」は **その株を最優先で出す**（`/study?deck=X&card=cardId`、既存 `priorityCardId` を活用）
- **実装（このセッション）**:
  - `src/lib/garden/garden-data.ts`: `getWitheredPlants(userId, now?)` 追加。全 `card_states` を走査 → `derivePlantState` で `isDead` のみ抽出 → cards/notes/decks をまとめ引きして `deckId`/`deckName`/`label`/`plant(PlantState)` を付与、放置日数（`plant.overdueDays`）降順。Dexie のみ・オフライン可。card 本体が未同期なら除外
  - `src/components/garden/WitheredList.tsx`（新規）: 枯れ株モーダル一覧（小グリフ＝`IsoTile animate={false}`／名札／所属デッキ／放置日数／行ごとに「水やり」リンク）。コピーは「もう一度育てましょう」の再生トーン
  - `src/app/(student)/garden/page.tsx`: 全デッキ横断の `getWitheredPlants` を liveQuery。サマリーの「枯れ N」をクリック可能な「🍂 枯れ株 N（全デッキ）」ボタンに変更 → `WitheredList` モーダル表示
  - テスト: `src/lib/garden/garden-data.test.ts`（新規5件、`@/lib/db/schema` をモック）
- **設計の肝（再掲）**: 枯れは見た目のみ。`card_states` は不変。水やり（=復習）で FSRS が自然に芽吹き直す（永久ロストなし＝安全弁）
- **検証**: 291テスト全通過（286→+5）／lint クリーン（既存の TemplatePreview 警告のみ）／本番ビルド成功（`/garden` 8.5kB）
- **次セッション注意**:
  - **要 Vercel デプロイ**（新コンポーネント・新ロジック）。実機は再ログイン/同期後に `/garden`、枯れ株は長期放置アカウントで
  - 枯れ判定は `CARE_THRESHOLDS.dryingOut`（interval の4倍超過）。実データで枯れが出にくい/出すぎる場合は `plant-state.ts` のしきい値調整
  - 次は 10.4 品種選択（`user_creature_state` 新テーブル）or 10.2 残（PixiJS・成長演出）

### 2026-06-15（Phase 10 記憶のいきもの育成 — 設計確定＋10.1/10.2 実装）
- **このセッションの流れ**: 機能拡張ディスカッション → 育成ゲームの世界観を植物に確定 → アイソメ・タイル方式に決定 → 10.1/10.2 を実装
- **世界観の確定**: アート＝**植物（果樹・花き）**。水やり＝復習／枯れ＝死／品種選択＝インプリント。タッチ＝**自然で素朴な手描き風**（最初の植物アイコンの質感、高校生も対象＝幼すぎ回避）。動物/モンスター系は一度検討したが不採用
- **描画方針の確定**: **アイソメ（斜め45°）タイル**。1ノート＝ひし形ブロック1枚。個別=1枚拡大／全体=自動レイアウト合成。「ブロック／株グリフ/配置」を分離し絵柄は後から差し替え可能。**当面は自前の手続き生成SVG（素朴トーン）**で世界観を統制。**CC0素材（Kenney/OpenGameArt の Free isometric plants-pack 等）は絵柄が素朴トーンとずれるため一旦見送り**（差し替えは株グリフのみで可）。将来 PixiJS（大規模）/Rive（状態アニメ）へ段階移行
- **実装（コミット済み）**:
  - `1e5ddcf` 10.1: `src/lib/garden/plant-state.ts` — `derivePlantState`/`summarizeGarden`。card_states(FSRS) から成長段階(種→芽→苗→成株→開花/結実)・世話状態(健やか→乾き気味→しおれ→枯れかけ→枯れ)を導出。SM-2は interval フォールバック。しきい値は `GROWTH_THRESHOLDS`/`CARE_THRESHOLDS` で調整可。テスト17件
  - `1c1efe3` 10.2: `src/components/garden/{PlantSprite,IsoTile,GardenField}.tsx` ＋ `src/lib/garden/garden-data.ts`(`getGardenForDeck`) ＋ `/garden` ページ ＋ BottomNav「庭」タブ。揺れ/しずくの軽いCSSアニメ（styled-jsx global、prefers-reduced-motion対応）
- **実機確認で出た不具合2件を修正（push 済み）**:
  - `4d1ed85` ナビ「庭」が一瞬表示→消える: 生徒ナビにしか入れておらず、ロール確定(teacher/admin)で消えていた → `teacherNavItems` にも追加＋7項目が収まるようナビの最小幅/余白調整
  - `b1f30c5` 庭画面で下ナビ（＆ヘッダー）が消え他画面へ移動できない: `(student)` グループに共有レイアウトが無く各ページが自前で `<AppLayout>` を巻く方式なのに garden ページが未ラップだった → 読み込み中/本体の両方を `<AppLayout>` で包む
- **検証**: 286テスト全通過 / lint クリーン / 本番ビルド成功（`/garden` 7.64kB 静的、51ページ生成）。**全コミット push 済み（main: b1f30c5）**
- **設計の肝（再掲）**: FSRS の card_states だけで育成が成立。学習エンジンには一切触れていない（純コスメティック層）
- **学び（次回ハマり回避）**: `(student)`/`(teacher)` グループには共有 layout.tsx が無い。**新規ページは必ず自前で `<AppLayout>` でラップする**こと（でないとヘッダー/下ナビが出ない）。ナビ項目はロール別配列（`studentNavItems`/`teacherNavItems`）の**両方**に入れる
- **次セッション注意**:
  - **要デプロイ**（新ページ・新コンポーネント）。実機は再ログイン/同期後に `/garden`
  - 株グリフは現状**汎用の木1種**。品種別（りんご/花 等）は 10.4（`user_creature_state` 追加）で。配置は自動レイアウト（合意）。自由配置は将来
  - 大規模デッキは MAX_TILES=150 で打ち切り表示（page.tsx に注記表示済み）。本格対応は PixiJS
  - 既存の軽微な型エラー `src/lib/db/sync.test.ts(125,48)` は本セッションと無関係（next build は通る）
  - モック（チャット内 show_widget）は世界観確認用。実物は `/garden`

### 2026-06-14（コロケーションパイロット 文脈アシスト追加）
- **依頼**: コロケーションパイロット（50語/ノートタイプ「コロケーション構文」）で、カードの一番はじめに目にする位置に**日本語の場面リード文（文脈アシスト）**を追加してイメージを強化したい。例:「私は荷物が多くて困っています。そのとき、」→ `She gave me a hand.`。既存の和訳ヒントは残す（＝加えて）
- **方針（合意）**: **enrich-only**＝既存の検証済み英文/和訳/穴埋めは保持し、各例文に `ctx`（1文・接続句で終える）だけをAIで追記。表示は**表面の最上部のみ**
- **データモデル**: 例文プール1件を `{en, blank, ja}` → `{en, blank, ja, ctx}` に拡張。`文脈` は note 保存フィールドにせず、`StudyCard` が例文プールから合成する表示専用フィールド（`英文穴埋め`/`和文`/`英文` と同じ扱い）。ノートタイプの FIELDS 変更なし
- **やったこと**:
  - 新規 `gen-context.js`（`build_context_workflow.py` が pilot2_deck.json から生成）→ `Workflow` 実行（Sonnet・15バッチ・174コロケーション・失敗0）→ `context_result.json`
  - `merge_context.py` で ctx を `pilot2_deck.json` の各 exemplar に書き戻し（870例文すべて付与）→ `build_colloc_notes.py`（`ctx` を pool に含めるよう変更）で `colloc_notes.json` 再生成
  - `src/components/card/StudyCard.tsx`: `effectiveFieldValues` に `'文脈': ex.ctx` を追加
  - カードテンプレ定義を `data/中学英単語/colloc-template.mjs` に集約（import/update 両スクリプトで共有）。表面最上部に `<div class="context">{{文脈}}</div>`＋CSS（`.context:empty{display:none}`）
  - DB反映: `update-colloc-context.mjs`（既存174ノートの例文プールを (見出し語,コア) 照合で in-place 更新＝note ID不変→SRS進捗保持）＋ `update-colloc-template.mjs`（card_templates の front/css をパッチ）。両方 --dry-run 確認後に本実行・DB読戻し検証OK
  - 検証: lint クリーン / 269テスト全通過 / 本番ビルド成功
- **次セッション注意**:
  - **要 Vercel デプロイ**（StudyCard 改修）。テンプレ/プールはDB更新済みなので**再同期（再ログイン or バックグラウンド同期）で反映**。デプロイ後に実機確認
  - 再生成手順: `python build_context_workflow.py pilot2_deck.json gen-context.js` → Workflow → 出力の `result` を `context_result.json` に保存 → `merge_context.py` → `build_colloc_notes.py` → `update-colloc-context.mjs`
  - ctx の質は概ね良好だが一部やや一般的。手直しは `pilot2_deck.json` の ctx を直接編集 → build → update でも可（AI再生成不要）
  - 全語（2286）展開時は同パイプラインを full データで回す（コスト要見積もり）

### 2026-06-14（機能拡張ディスカッション → 育成ゲーム設計＋ロードマップ再構成）
- **依頼**: 「単語学習だけでなく機能拡張したい」— 題材単位の順序付き出題／数式・画像／階層アンロック／育成・ランキング等のアイデア出しディスカッション
- **ユーザーの選択**: ②数式・画像のリッチ表示 ＋ ④ゲーミフィケーション。ゴール＝全体ロードマップ再構成。着手順は **育成ゲームを先に**
- **★育成ゲームの核心哲学（ユーザー発）**: 「全体進捗で1キャラ育成」ではなく **1ノート＝1匹、無数の小さな生き物を飼育**。互いに関係しつつ個々に大切
- **追加で合意した2メカニクス**:
  - **死＆復活**: 復習しないと生き物が死ぬ→ゼロから育て直し。**ただしSRSを壊さない設計**＝死は見た目だけ（card_states 不変）、「ゼロから育て直し」はFSRSの自然リセット（長期放置→Again→stability低下→卵に戻る）で実現。墓石→お墓参り（復習）で**復活可能**（永久ロスト禁止＝安全弁）。ユーザーは墓石→復活案を高評価
  - **初回インプリント**: 生き物に初めて触れた時に生徒がイメージを刻む→個別の絵。実装は「手続き生成スプライト（単語IDシードで自動ユニーク）＋生徒のインプリント入力」の2層。視覚化記憶術としても機能。生徒×ノートの新テーブル `user_creature_state` が唯一の新規データモデル
- **成果物（このセッションで作成・コード変更なし）**:
  - `docs/memory-creatures-design.md` 新規（Phase 10 の一次仕様）
  - `docs/ROADMAP.md` Phase 10 を「記憶のいきもの育成」に再定義（10.1〜10.5）、Phase 13.4 リッチ表示を新設、優先度順を再構成
  - `docs/progress.md` 更新（本メモ）
- **据え置き（中長期・計画のみ）**: ①レッスン/教材モード、③学習パス/アンロック（データモデル新規が重い）
- **次セッション注意**: FSRS の `card_states`（stability/difficulty/lapses/due）だけで育成ゲームが作れるのが設計の肝。学習エンジンには手を入れない。成長段階のしきい値は実データ検証後に確定

### 2026-06-14（コロケーション中心デッキ パイロット + イディオムタグ + 同期/認証バグ修正）
- **依頼の流れ**: 中学英単語デッキ（6858）の確認 → ①イディオム判定タグ ②表示バグ調査 ③L2語彙論に基づくコロケーション中心デッキ設計＆パイロット ④空欄ヒント改善
- **同期/認証バグ2件を修正（要デプロイ済み push）**:
  - `fix 7f3af70`: **同期ページング** — `/api/sync/pull` と `/api/decks/[id]/offline-data` が notes/cards/card_states を取得する際 **PostgREST のデフォルト1000行上限**でページングしておらず、6858ノートの先頭1000件(=名詞のみ)しか同期されず「名詞サブデッキしか出ない」真因だった。1000件ずつ `.range()` ループで全件取得に修正
  - `fix 3de0e83`: **未認証 /api/* の405** — ミドルウェアが未認証リクエストを `/login` へ307リダイレクト → POST が `/login`(GET専用)に転送され **405**。`/api/*` はリダイレクトせず各ルートの requireAuth に401を返させる。再現・検証済み（POST /api/sync/pull が401に）
  - **教訓**: インポートスクリプトが講師一覧先頭(荒井尚緒)を既定オーナーにしてデッキ非表示 → 既定を `gaimon.maam@gmail.com` 優先に修正済み
- **イディオムタグ（`feat e2673a2`）**: 全6858コロケーションをAI(Sonnet)で「推測可能/推測困難イディオム」分類 → 1059ノートにタグ「イディオム」付与＋フィルタサブデッキ「★ イディオム（推測困難）」作成。`tag-idioms.mjs` はノートID安定の in-place 更新
- **中学英単語デッキ穴埋め化（`feat 2c53f0f`）**: 旧「単語が表面に出て暗誦にならない」設計 → **表=英文(暗誦対象を空所)+和訳ヒント / 裏=完成英文(答え強調)+和訳** に再設計。`build_deck_tsv.py` の穴埋め/強調ロジック（語幹・不規則動詞・重子音・ss・e脱落・A/Bプレースホルダ対応のアンカー一致、空所最大4語）を整備
- **★コロケーション中心デッキ パイロット（`feat 762cdba`,`01ae9ef`,`d80995f`）**:
  - **設計の核**: 「意味×コロケーション」は積ではなく、コロケーションが語義を担う（run=走る/経営する等）→ 語義軸はコロケーションに畳む。学習単位=構文(コア+スロット)、SRSは構文単位、表示例文は毎回回す（token頻度=定着, type頻度=生産性）
  - **3層統制**: ①語義レベルA1/A2（LLM+EVP/GSE基準。run は走る義のみ、経営する義B2は除外）②共起語統制（`words.tsv`照合バリデータ `vocab_validate.py`、範囲内90%）③コーパス裏取り（Google Books Ngrams JSON。ただし `put on` 等まで近ゼロを返し**弱い**→補助シグナルに留め足切りしない）
  - **パイプライン**: 50語選定 → `gen-colloc.js`(語義A1/A2コロケーション選定) → `corpus_attest.py`(頻度注釈) → `gen-exemplar.js`(語彙統制例文プール5本) → `build_colloc_notes.py`(実現コロケーション全体を空所化, filler対応)
  - **アプリ実装**: ノートタイプ「コロケーション構文」(見出し語/語義/コア/スロット型/例文プールJSON)。`StudyCard.tsx` に**例文プールからレビューごとに1本ランダム表示**する処理を追加（SRSはノート単位）。デッキ「中学英単語 コロケーション（パイロット50語）」174ノート投入
  - **空欄ヒント**（`d80995f`）: 当初「語数分の下線」→「頭文字」→ **最終「最初の音節の頭子音クラスタ＋語長下線」**（take the bus→`t___ th_ b__`、think→`th___`、school→`sch___`、母音始まりは先頭1文字）。`_blank_for` を変更、パイロットDBの例文プールも in-place 更新済み
- **次のセッションで注意すべきこと**:
  - **要デプロイ**: `01ae9ef`(StudyCardローテーション) と バグ修正(pull/middleware) はアプリ改修なので Vercel デプロイが必要。空欄ヒント等データ側変更は再同期のみで反映
  - `build_deck_tsv.py` は `main()` ガード化済み。穴埋めロジック(`emphasize`,`realize_blank`用の `_match`/`_blank_for` 等)は `build_colloc_notes.py` から import 再利用
  - StudyCard のプール選択は「カードマウントごとにランダム」。1セッション内では各カード1回出題なのでローテーションは復習をまたいで現れる。`例文プール` フィールドが無い通常ノートは素通り（effectiveFieldValues=fieldValues）
  - コーパスは Google Ngrams で**弱い**と判明。本格化するなら SkELL/Sketch Engine/COCA か EVP/GSE の段階別コロケーションリスト（要アクセス/コスト）
  - データ生成物: `pilot2_deck.json`(コロケーション+例文+freq), `colloc_notes.json`(投入用), `full_result.json`/`idioms.json` は版管理。`gen-*.js`(データ埋め込みワークフロー)と `raw/` は .gitignore
  - パイロットデッキ id `10765cf3…` / ノートタイプ「コロケーション構文」`0cfab65b…` / 中学英単語2286デッキ `c5dcc810…`。すべてオーナー=金田(`04f87dee…`)

### 2026-06-13（中学英単語 暗誦例文デッキ + 同期ページングバグ修正）
- **依頼**: 公立中学で覚えるべき英単語（CEFR等準拠）を全リスト化し、例文暗誦デッキを作成
- **単語リスト**: 学習指導要領 全2286語（青森県教委ベース、全国6社教科書分析 / CEFR A1〜A2相当）。english-club.jp の品詞別xlsx 10本をDLして抽出 → `data/中学英単語/words.tsv`（id付き、名詞1254/動詞343/形容詞361/副詞148/代名詞60/前置詞42/接続詞42/助動詞19/間投詞14/冠詞3）
- **例文生成**: 1語×3つの異なるコロケーション例文（英文＋和訳）を AI(Sonnet) のワークフロー並列生成（115バッチ, 約567万トークン）。`data/中学英単語/build_workflow.py` で単語データ埋め込みのワークフロー .js を生成し `Workflow` で実行 → `full_result.json`
- **後処理** `build_deck_tsv.py`: コロケーション部を `<strong>` 強調＋空所化。語幹・不規則動詞・重子音・ss・e脱落・A/Bプレースホルダ対応のアンカー一致。空所は最大4語（超過は見出し語のみ）。検証: 重複0/3文揃い100%/強調付与ほぼ100%（未一致2/6858）
- **カード構成（穴埋め型）**: 表=英文（暗誦対象を空所 `<span class="blank">`）＋和訳ヒント / 裏=完成英文（答え緑下線）＋和訳＋単語・意味・表現。ノートタイプ「中学英単語（暗誦）」7フィールド
- **投入**: `import-chu-eitango.mjs` で 6858ノート＋カード。`create-pos-subdecks.mjs` で品詞別フィルタサブデッキ10個（filter_tags=[品詞:◯◯]）。デッキ `c5dcc810…`、オーナー=金田啓之
- **重要バグ修正（同期ページング）**: `/api/sync/pull` と `/api/decks/[id]/offline-data` が notes/cards を取得する際 **PostgREST のデフォルト1000行上限**でページングしておらず、6858ノートの先頭1000件(=名詞のみ)しか同期されず「名詞サブデッキしか出ない」症状の真因だった。両ルートを1000件ずつ `.range()` ループで全件取得に修正（commit `7f3af70`）
- **オーナー付け替えの教訓**: インポートスクリプトが講師一覧の先頭（荒井尚緒）を既定オーナーにしてしまい「デッキが表示されない」発生 → 既定を `gaimon.maam@gmail.com` 優先に修正済み
- **未デプロイ注意**: コード修正(pull/offline-data)は push 済みだが**Vercelデプロイ後にログアウト→再ログインしないと反映されない**（旧デッキの ghost も IndexedDB に残るため要フル同期）
- **コミット**: `7f3af70`(fix 同期ページング) / `2c53f0f`(feat 中学英単語デッキ一式) push 済み
- **次セッション注意**: 端末で動作確認後、例文・空所の手直し要望が来たら `build_deck_tsv.py` 調整 → 旧デッキ削除（cleanup は inline node、`data/中学英単語/` の手順参照）→ 再import → サブデッキ再作成の順。`full_result.json` があれば AI 再生成なしで TSV 再構築可能

### 2026-04-28（デッキ表示バグ修正 — Dexie liveQuery 化）
- **背景**: 林奏太さん（LINE 経由ログイン）が「デッキ一覧が空」と報告
- **調査結果**:
  - 林奏太のサーバーデータは完全に正常（クラス所属 2、配布デッキ 1=動詞の語法 + 13サブデッキ、review_logs 398件、最終学習 4/23）
  - アカウント重複なし、ban されていない、配布忘れでもない
  - **真因**: `DecksPageClient.tsx` 等が `useEffect + useState` で Dexie を一度しか読まず、バックグラウンド sync が IndexedDB を更新しても画面が再描画されない設計
  - 特に LIFF in-app browser は通常ブラウザと別 storage で IndexedDB が空、初回アクセスで「デッキがありません」が固定表示される
- **やったこと**:
  - **`dexie-react-hooks` 導入** で `useLiveQuery` パターンに移行
  - **5 ページを liveQuery 化**:
    - `DecksPageClient.tsx`（デッキ一覧）
    - `StudyPageClient.tsx`（学習画面 — LINE Flex 着地で最重要）
    - `src/app/page.tsx`（ダッシュボード — `/auth/line?next=/` のデフォルト着地点）
    - `decks/[id]/page.tsx`（デッキ詳細）
    - `decks/page.tsx`（薄ラッパー、Server-data 経由を廃止）
  - **`SyncErrorBanner.tsx` 新規作成**: `fullSync` エラーを画面上部に赤バナーで表示（再試行ボタン付き）
  - **`FirstSyncOverlay.tsx` 新規作成**: IndexedDB 空 + オンライン + 初回 sync 未完了の時、全画面オーバーレイで「データを取得しています…」を表示。8 秒以上で「再読み込み」ボタン出現
  - **AppLayout.tsx に組み込み**
  - **調査スクリプト 3 本** を `data/debug-{student-decks,deck-tree,student-activity}.mjs` として残置（今後の同類調査でも使える）
  - 269 / 269 テスト通過、typecheck クリーン、ESLint クリーン、dev server 起動 OK
  - **コミット b8722d9 / プッシュ済み**
- **未着手の Audit 結果（中優先度、次セッション以降）**:
  - `src/app/(student)/notes/page.tsx` — liveQuery 化候補（中優先度）
  - `src/app/(teacher)/students/page.tsx` — billing 同期反映に liveQuery が望ましい
  - `src/app/(teacher)/note-types/page.tsx` + `[id]/page.tsx` — 編集後の反映タイムラグあり
  - `src/app/(student)/decks/new/page.tsx` — 親デッキドロップダウン（低優先度）
- **次のセッションで注意すべきこと**:
  - **林奏太さんの動作確認待ち**。LINE 経由で `/decks` を開いて自動表示されることを本人に確認してもらう必要あり
  - `dexie-react-hooks` の `useLiveQuery` 内ではトランザクションを開始できない（同期的な read のみ）。書き込みは外側で `db.xxx.put()` を直接呼ぶ
  - `useLiveQuery` の戻り値は `T | undefined`（loading）。`null` を返したい場合は明示的に return null
  - StudySession の内部 state は `useState(() => initialCards)` で lazy 初期化なので、liveQuery で props が変わっても学習中のセッションはリセットされない（確認済み）
  - 残った orphan 変更（`docs/billing-line-notification-spec.md`、`data/create-teacher-account.mjs`、`data/update-teacher-email.mjs`、`docs/srs-due-cards-summary-history-filter.md`、`.claude/settings.local.json`）は今回スコープ外で未コミット

### 2026-04-16 夜2（SRS側 LINE通知準備 + billing実装スペック）
- **やったこと**:
  - **due-cards-summary API 改善** (`src/app/api/admin/due-cards-summary/route.ts`)
    - レスポンスに `deckId` を追加（Flex ボタンから `/study?deckId=xxx` に深いリンク用）
    - `dueCount` を `count: 'exact'` で実枚数取得（旧: `.limit(10)` で上限10）
    - サンプル抽出は別クエリで最大10枚に制限（プレビュー用1枚を選ぶため）
  - **`/auth/line` の `next` パラメータ対応**
    - `?next=/study?deckId=xxx` で SRS 内任意パスへ遷移可能
    - `safeNext` ヘルパー (`src/lib/auth/safe-next.ts`) で open redirect 防止
    - 5件のテスト追加（null/相対/protocol-relative/絶対URL/javascript: スキーム）
  - **billing 側実装スペック書き下ろし** (`docs/billing-line-notification-spec.md`)
    - 全体フロー図、API 仕様、環境変数、Flex メッセージ JSON、サービスコード雛形
    - Cron 設定（Vercel Cron 22:00 UTC = 07:00 JST）
    - LIFF 経由の SRS 自動ログインフロー
    - 運用注意（レート制限、重複防止、オプトアウト、JST/UTC）
- **次のセッションで注意すべきこと**:
  - billing 側コードは `kanada4310/swallow-billing` リポジトリで実装（このセッションからは触れない）
  - billing 側で必要な環境変数: `SRS_BASE_URL`, `SRS_AUTH_SECRET`（既存）, `LINE_CHANNEL_ACCESS_TOKEN`, `LIFF_NOTIFICATION_URL`
  - Flex メッセージのボタン URI は LIFF URL（直接 `/auth/line` には飛ばせない、JWT 必要）
  - billing 側にすでに LIFF 自動ログイン用 JWT 発行 API があれば再利用可

### 2026-04-16 夜（生徒取組状況UI + LINE通知データAPI + 掃除）
- **やったこと**:
  - **生徒取組状況UI**:
    - 一覧ページ `/students/progress`（今日の復習数、累計、期限切れ、最終活動、全体正答率を表示）
    - 詳細ページ `/students/progress/[userId]`（StatsOverview + 各種グラフ + デッキ別進捗）
    - ノート別ドリルダウン（デッキクリックで各ノートの状態/正答率/最終レビューを表示）
    - API `/api/teacher/student-progress`（バッチクエリでN+1回避、?deckId=xxx でノート一覧モード）
    - 共通統計モジュール `src/lib/stats/calculations.ts`（生徒/講師で共有）
    - DBマイグレーション `017_teacher_student_progress.sql`（card_states に講師閲覧RLS追加）
    - クラス管理ページに「取組状況」ボタン追加
  - **LINE通知データAPI**:
    - `GET /api/admin/due-cards-summary`（Bearer認証、期限切れカードを持つ全生徒のサマリー返却）
    - レスポンス: `{ students: [{ lineUserId, name, dueCount, frontText, deckName }] }`
    - `middleware.ts` の publicPaths に追加
    - extract-text ユーティリティで frontText を生成
  - **掃除**:
    - 未使用の Google OAuth コールバック `/callback/route.ts` 削除 + publicPaths から除去
    - progress.md の既知の課題から解消済み項目を削除
- **次のセッションで注意すべきこと**:
  - `017_teacher_student_progress.sql` 実行済み
  - 生徒取組状況UIは講師ロールのみアクセス可（card_states RLSで制御）
  - LINE通知送信本体（Flexメッセージ生成 + Messaging API呼び出し）は**billing側に未実装**
  - billing側は SRS_AUTH_SECRET + `GET /api/admin/due-cards-summary` で呼び出す
  - FSRS card_states の `lapses` カラムはノート別進捗で正答率計算に使用

### 2026-04-16 後半（billing-SRS同期 + フィルタデッキ修正 + 設定継承）
- **やったこと**:
  - **billing-SRSミラーリング同期の完全実装**
    - SRS側: Admin billing-sync API (`POST /api/admin/billing-sync`)
    - SRS側: LINE認証ロジックの共通ユーティリティ抽出 (`src/lib/auth/line-user.ts`)
    - SRS側: DBマイグレーション `016_billing_sync.sql`（billing_template_id + teacher_id nullable + RLSポリシー）
    - SRS側: Dexie v10（billing_template_id インデックス追加）
    - billing側: `srs-sync.service.ts`（データ収集 + SRS API呼び出し）
    - billing側: Daily Cronに同期ジョブ追加（#7）
    - billing側: 手動同期API (`POST /api/admin/srs-sync`) + ダッシュボードにSRSSyncButton
    - 同期結果: 21クラス、48生徒アカウント、60メンバー登録を確認
  - **billing連携クラスの講師UI対応**
    - GET /api/classes でbilling連携クラスも返す
    - 生徒管理ページ・クラス詳細ページでbilling連携クラス表示
    - billing連携クラスの編集/削除/メンバー変更をブロック（読み取り専用）
    - RLSポリシー追加（Teachers can view billing-synced classes）
    - `is_class_teacher` / `is_student_of_teacher` 関数をbilling連携クラス対応に更新
    - Pull sync APIでbilling連携クラスも同期
  - **フィルタデッキの不具合修正**
    - `getStudyCardsOffline`: フィルタサブデッキでルートデッキツリーからカード取得するように修正
    - `getDecksWithStatsOffline`: フィルタサブデッキのカード数を親デッキからタグマッチで計算
  - **デッキ設定の不具合修正**
    - `OfflineDeckWithStats`に`settings`フィールド追加（設定モーダルがデフォルトに戻る問題修正）
    - 学習ページでルートデッキ設定をロードしStudySessionに渡す（フィルタサブデッキの設定継承）
  - **配布デッキのサブデッキ同期修正**
    - Pull APIでサブデッキ取得にadmin clientを使用（RLSバイパス）
  - **その他**
    - LINE auth routeを共通ユーティリティ使用にリファクタ
    - billing-sync APIのミドルウェア除外（publicPaths追加）
    - エラーハンドリング強化（billing側: text→JSON パース、SRS側: グローバルtry-catch）
- **途中で止まっていること**:
  - Pull APIにデバッグログが残っている（次セッションで削除推奨）
- **次のセッションで注意すべきこと**:
  - `016_billing_sync.sql` は実行済み（RLSポリシー含む）
  - billing連携クラスは `teacher_id = null`, `billing_template_id IS NOT NULL` で識別
  - 退塾処理は `ban_duration: '876000h'` でアカウント無効化（データ保持）
  - SRS_AUTH_SECRETは両システムで共有済み
  - billing側のコードはswallow-billingリポジトリ（`/c/Users/gaimo/AppData/Local/Programs/swallow-billing`）
  - フィルタデッキの動作: 新規カードのみフィルタ、復習カードはルートデッキ全体から
  - サブデッキ同期はPull APIでadmin clientを使用（RLSバイパス）

### 2026-04-16（フィルタデッキ実装 + サブデッキ一括作成 + 配布デッキ同期改善）
- **やったこと**:
  - フィルタデッキ機能の完全実装（設計→コーディング→テスト→ビルド→プッシュ）
    - DBマイグレーション `015_filter_decks.sql`（filter_tags列 + get_root_deck_id RPC）実行済み
    - Deck型にfilter_tags追加、Dexie v9、getRootDeckId()ヘルパー
    - getStudyCardsOffline(): ルートデッキベースの新規カード枠共有 + タグフィルタ
    - デッキ作成/編集API: filterTagsパラメータ対応
    - DeckForm UI: フィルタータグ入力（オートコンプリート付き）
    - デッキ一覧: フィルタタグの紫バッジ表示
    - 12テスト追加（getRootDeckId、タグフィルタリングロジック）
  - 動詞の語法デッキに13セクション別フィルタサブデッキを一括作成（スクリプト: `data/create-filter-subdecks.mjs`）
  - 配布デッキのサブデッキ自動同期（pull API修正: 子・孫デッキも自動取得）
  - 配布デッキのツリー構造表示（フラットリストからツリーに変更）
  - 既存のSVCサブデッキ（filter_tagsなし）を削除

### 2026-04-10（動詞の語法デッキ + 講師ログイン + LINE認証修正 + フィルタデッキ設計）
- **やったこと**:
  - LINE自動ログインE2Eテスト完了確認
  - 動詞の語法デッキ作成（582ノート、5カテゴリタグ体系、インポート完了）
  - 講師用メール+パスワードログイン追加（`gaimon.maam@gmail.com`）
  - LINE認証ルート大幅修正（3段階フォールバック + magic link方式）
  - 同期403エラー修正（pull APIのuserIdチェック削除）
  - デッキ設定保存後のDexie未更新バグ修正
  - フィルタデッキ機能の設計・計画書作成

### 2026-04-10（前半セッション — billing側設計）
- billing側の総合メニューに「学習支援」セクション追加設計 → ユーザーが実装済み
- LINE自動ログインの環境変数設定手順ドキュメント化 → ユーザーが設定済み

### 2026-04-09（LINE自動ログイン実装）
- LINE自動ログイン統合（Phase 17a）のコード実装完了
- Supabaseプロジェクト復旧、Google OAuth修正

### 2026-02-19
- TTS設定デッキ移動 + 通知UI整理 完了
- テンプレートTTSプレースホルダー実装
- TTSプリフェッチ実装

## 既知の課題
- billing側のビルドがWindows環境でOOMになることがある（`--max-old-space-size=4096` で回避）
- LINE端末のIndexedDBに古いユーザーIDがキャッシュされる場合がある（pull APIで対処済み、push APIも同様の対処が必要かもしれない）
- コロケーションパイロットの例文プール: 語彙統制で範囲外語(OOV) ~5-7%（scissors/aloud/vase/cashier/essay 等）。禁止語指定での再生成リペアが未実施
- コロケーション選定のコーパス裏取りは Google Books Ngrams で**弱い**（常用句まで近ゼロを返す）。精度を上げるなら別コーパス（SkELL/Sketch Engine/COCA）か EVP/GSE 段階別リストが必要
- インポート系スクリプトは講師一覧先頭をオーナーにしがち（既定を gaimon.maam に修正済みだが、新規スクリプト作成時は要注意）
- **`(student)`/`(teacher)` グループに共有 layout.tsx が無い** → 新規ページは必ず自前で `<AppLayout>` を巻くこと（巻き忘れるとヘッダー/下ナビが出ない。今回ハマった）
- BottomNav が講師ナビ7項目（庭追加）でやや窮屈。`min-w-0`＋`px-1.5`で収めているが、今後さらに項目を増やすなら再設計（スクロール or まとめメニュー）が必要
- 既存の型エラー `src/lib/db/sync.test.ts(125,48)`（null 非許容）。`tsc --noEmit` では出るが `next build` は通る。本セッションと無関係（要時に別途修正）
- 育成ゲーム: 株グリフは現状**汎用の木1種**のみ（品種別は 10.4）。大規模デッキは `/garden` で MAX_TILES=150 打ち切り（PixiJS化まで）

## 今後のロードマップ概要（優先度順、詳細は ROADMAP.md）
- **Phase 12.4**: billing側でLINE Flex送信（SRS側データAPIは完了）★次
- **Phase 9.3-9.4**: 学習時間トラッキング、習熟度スコア
- **Phase 10**: ゲーミフィケーション
- **Phase 11.1/11.3/11.4**: 宿題機能・クラス分析・保護者レポート
- **Phase 13-14, 16**: コンテンツ効率化、学習モード拡張、コラボレーション
