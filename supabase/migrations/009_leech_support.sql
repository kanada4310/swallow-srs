-- Phase 7.5: リーチ（leech）対応 - lapses カラム追加 + suspended 状態

-- card_states に lapses カラムを追加
ALTER TABLE public.card_states ADD COLUMN IF NOT EXISTS lapses INTEGER NOT NULL DEFAULT 0;

-- state の CHECK 制約を更新（suspended を追加）
ALTER TABLE public.card_states DROP CONSTRAINT IF EXISTS card_states_state_check;
ALTER TABLE public.card_states ADD CONSTRAINT card_states_state_check
  CHECK (state IN ('new', 'learning', 'review', 'relearning', 'suspended'));
