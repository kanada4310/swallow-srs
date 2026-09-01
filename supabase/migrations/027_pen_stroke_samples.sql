-- ペン入力の実書き蓄積（2026-09-01・文字認識検討会の確定内容 v1・論点2）
--
-- 構文の練習で実際に書いて確定した線を、お手本としてためる。
-- 「関所」= 本人が確定し、訂正しなかったことが確認できた線だけを採る（採否はAPI側）。
-- 判定そのものは従来どおり端末内・書いた瞬間に行い、練習を開くときに蓄積を手元へ読み込む。
--
-- 二段構え:
-- 1. pen_stroke_samples … 本人の蓄積（利用者ごと。端末をまたいで引き継げる）
-- 2. pen_shared_samples … 塾の共通お手本集（**名前を付けない形**＝利用者の列を持たない。
--    全員の判定の土台。新しい生徒は初日からこの土台で判定される）
--
-- 個人情報: 共通お手本集には利用者を特定できる情報を入れない（user_id 列なし・
--   線の座標と記号名だけ。書き込みはサーバー側の service role のみ＝改ざん・削除も不可）。
-- 上限と間引き: 1記号あたりの上限（本人16件・共通24件）と「似た線は足さない」間引きは
--   API 側（src/lib/pen-syntax/sample-store.ts）が行う。無限に増やすと照合が遅くなるため。

CREATE TABLE IF NOT EXISTS public.pen_stroke_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 記号のID（paren-open / S / n など。台帳 ledger.ts の記号に限る＝APIが検査）
  symbol TEXT NOT NULL,
  -- ペン先が通った点の座標の列（[[{x,y},…],…]。時刻は保存しない）
  strokes JSONB NOT NULL,
  -- 採った経路: confirmed=自動確定して訂正されなかった / chip=候補から本人が選んだ（最良）
  --             / enrolled=お手本登録で本人が書いた
  source TEXT NOT NULL DEFAULT 'confirmed' CHECK (source IN ('confirmed', 'chip', 'enrolled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pen_stroke_samples_user_symbol
  ON public.pen_stroke_samples (user_id, symbol, created_at);

ALTER TABLE public.pen_stroke_samples ENABLE ROW LEVEL SECURITY;

-- 本人の蓄積は本人だけが読み書きできる
CREATE POLICY "Users manage own pen samples"
  ON public.pen_stroke_samples
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.pen_shared_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  strokes JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT 'confirmed' CHECK (source IN ('confirmed', 'chip', 'enrolled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pen_shared_samples_symbol
  ON public.pen_shared_samples (symbol, created_at);

ALTER TABLE public.pen_shared_samples ENABLE ROW LEVEL SECURITY;

-- 共通お手本集はログインした人なら誰でも読める（判定の土台）。
-- 書き込み・削除のポリシーは作らない＝サーバー（service role）だけが書ける
CREATE POLICY "Authenticated read shared pen samples"
  ON public.pen_shared_samples
  FOR SELECT
  TO authenticated
  USING (true);
