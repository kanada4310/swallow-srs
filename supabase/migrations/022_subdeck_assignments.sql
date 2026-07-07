-- サブデッキの配布を明示的な deck_assignments 行にする
--
-- 背景: 従来はサブデッキに配布行が無く、pull API の admin client だけが子・孫を補っていた。
-- そのため通常権限の API（offline-data / notes/search 等）は RLS でサブデッキを読めなかった。
-- 親を配布したら子孫にも「継承配布」の行を作り、source_deck_id で直接配布と区別する。
--
-- 1. 既存重複の掃除（一意制約が無かったため）
-- 2. 部分一意インデックス（deck_id×class_id / deck_id×user_id）
-- 3. source_deck_id 列（NULL=直接配布、非NULL=継承元デッキ）
-- 4. 既存配布のバックフィル（子孫分の継承行を作成）
-- 5. 子孫の is_distributed 同期

-- ============================================================
-- 1. 重複排除（同じデッキ×同じ配布先の行が複数あれば古い方を残す）
-- ============================================================
DELETE FROM public.deck_assignments WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY deck_id, class_id, user_id
      ORDER BY assigned_at, id
    ) AS rn
    FROM public.deck_assignments
  ) t
  WHERE t.rn > 1
);

-- ============================================================
-- 2. 部分一意インデックス（CHECK 制約により class_id/user_id は必ず片方のみ非NULL）
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_deck_assignments_deck_class
  ON public.deck_assignments (deck_id, class_id) WHERE class_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_deck_assignments_deck_user
  ON public.deck_assignments (deck_id, user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 3. 継承マーカー列
-- ============================================================
ALTER TABLE public.deck_assignments
  ADD COLUMN IF NOT EXISTS source_deck_id UUID REFERENCES public.decks(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.deck_assignments.source_deck_id IS
  'NULL=直接配布。非NULL=このデッキ（祖先）の配布から継承された行';

-- ============================================================
-- 4. バックフィル: 既存の直接配布それぞれについて子孫デッキ分の継承行を作成
--    （DISTINCT ON: 同一ターゲットへ複数祖先から重複生成されるのを防ぐ）
-- ============================================================
INSERT INTO public.deck_assignments (deck_id, class_id, source_deck_id)
SELECT DISTINCT ON (dd, da.class_id) dd, da.class_id, da.deck_id
FROM public.deck_assignments da
CROSS JOIN LATERAL public.get_descendant_deck_ids(da.deck_id) AS dd
WHERE da.class_id IS NOT NULL AND da.source_deck_id IS NULL
ON CONFLICT (deck_id, class_id) WHERE class_id IS NOT NULL DO NOTHING;

INSERT INTO public.deck_assignments (deck_id, user_id, source_deck_id)
SELECT DISTINCT ON (dd, da.user_id) dd, da.user_id, da.deck_id
FROM public.deck_assignments da
CROSS JOIN LATERAL public.get_descendant_deck_ids(da.deck_id) AS dd
WHERE da.user_id IS NOT NULL AND da.source_deck_id IS NULL
ON CONFLICT (deck_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;

-- ============================================================
-- 5. is_distributed の同期（配布行を持つデッキは true に）
-- ============================================================
UPDATE public.decks d SET is_distributed = TRUE
WHERE d.is_distributed = FALSE
  AND EXISTS (SELECT 1 FROM public.deck_assignments da WHERE da.deck_id = d.id);
