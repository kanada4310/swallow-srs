-- =====================================================
-- 018: review_logs に deck_id カラム追加
-- LINE通知から最後に学習したデッキ（フィルタサブデッキ含む）にリンクするため
-- =====================================================

ALTER TABLE public.review_logs ADD COLUMN deck_id UUID REFERENCES public.decks(id) ON DELETE SET NULL;

CREATE INDEX idx_review_logs_deck_id ON public.review_logs(deck_id);
