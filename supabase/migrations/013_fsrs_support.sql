-- 013: FSRS (Free Spaced Repetition Scheduler) support
-- Add FSRS-specific columns to card_states

ALTER TABLE public.card_states ADD COLUMN IF NOT EXISTS stability REAL;
ALTER TABLE public.card_states ADD COLUMN IF NOT EXISTS difficulty REAL;
ALTER TABLE public.card_states ADD COLUMN IF NOT EXISTS elapsed_days REAL NOT NULL DEFAULT 0;
ALTER TABLE public.card_states ADD COLUMN IF NOT EXISTS scheduled_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.card_states ADD COLUMN IF NOT EXISTS last_review TIMESTAMPTZ;
