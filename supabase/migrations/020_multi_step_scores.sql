-- =====================================================
-- 020: review_logs に多段階設問（識別演習）のスコアを追加
-- 正誤＋解答時間から算出した例文単位のスコア(0-100)と、設問別正誤(JSON)を保持する。
-- 通常カードは NULL のまま（後方互換・無害）。
-- =====================================================

ALTER TABLE public.review_logs
  ADD COLUMN IF NOT EXISTS score SMALLINT,
  ADD COLUMN IF NOT EXISTS step_results JSONB;

COMMENT ON COLUMN public.review_logs.score IS '多段階設問の総合スコア 0-100（正誤＋解答時間）。通常カードは NULL';
COMMENT ON COLUMN public.review_logs.step_results IS '多段階設問の設問別正誤 [{id,mainCorrect,followCorrect,overallCorrect}]。通常カードは NULL';
