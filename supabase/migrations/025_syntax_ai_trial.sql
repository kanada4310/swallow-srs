-- 構文添削AI判定の試行導入（2026-08-21・ADR syntax-ai-trial）
--
-- 試行の枠（上限月3,000円・対象生徒2〜3人・期間1ヶ月）を機械的に担保するための2表。
-- 学習エンジンの既存の表（card_states / review_logs）には一切触れない。
--
-- - syntax_ai_config: 1行だけの設定表。許可生徒・期間・月上限・モデル。
--   入口の表示とサーバ側の受付判定はすべてこの表を根拠にする。
-- - syntax_ai_usage: AI呼び出し1回ごとの記録（トークン数・概算費用）。
--   月の使用額はこの表の合計で計算し、上限到達で受付を止める。
--   実測（1文あたり往復数・費用）の集計材料でもある。

CREATE TABLE IF NOT EXISTS public.syntax_ai_config (
  -- 1行に固定する（id は常に 1）
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- 許可する生徒（2〜3人）。ここに入っていない生徒にはAIの入口を表示しない
  allowed_user_ids UUID[] NOT NULL DEFAULT '{}',
  -- 試行期間。ends_at を過ぎたら受付を止める（開始時に +1ヶ月 で設定する運用）
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  -- 月の上限額（円）。使用額がこれに達したら受付を止める
  monthly_cap_yen NUMERIC NOT NULL DEFAULT 3000,
  -- 使うモデル（中位=claude-sonnet-4-6 を既定。設定で変更可）
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.syntax_ai_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.syntax_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- judge = 1文の通し分析への判定（1往復） / dialogue = 添削問答の1往復
  kind TEXT NOT NULL CHECK (kind IN ('judge', 'dialogue')),
  -- どの講・どの文か（集計用。外部のAIへは送らない内部情報）
  lesson_id TEXT,
  sentence_key TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  -- このAPI呼び出し1回の概算費用（円）
  cost_yen NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 月次の合計と生徒別集計に使う
CREATE INDEX IF NOT EXISTS idx_syntax_ai_usage_created_at
  ON public.syntax_ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_syntax_ai_usage_user
  ON public.syntax_ai_usage (user_id, created_at DESC);

ALTER TABLE public.syntax_ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syntax_ai_usage ENABLE ROW LEVEL SECURITY;

-- 講師・管理者: 設定と使用記録を閲覧できる（使用額の見える化）
-- 書き込みはサーバ（service role）だけが行うので INSERT/UPDATE ポリシーは作らない。
-- 講師画面からの設定変更もサーバAPI経由（requireTeacher → admin client）。
CREATE POLICY "Teachers view syntax ai config"
  ON public.syntax_ai_config
  FOR SELECT
  TO authenticated
  USING (public.is_teacher_or_admin(auth.uid()));

CREATE POLICY "Teachers view syntax ai usage"
  ON public.syntax_ai_usage
  FOR SELECT
  TO authenticated
  USING (public.is_teacher_or_admin(auth.uid()));
