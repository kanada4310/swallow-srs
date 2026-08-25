-- スパルタプログラム管理（2026-08-25・ADR sparta-program-management）
--
-- 期間を定めた暗記の取り組み（達成報酬つき）の登録簿。
-- 生徒の毎日の LINE 手打ち報告を廃止し、学習記録そのものを進捗にする。
--
-- - 進捗・達成状況はすべて既存の card_states / review_logs から集計時に導出する。
--   この表は「誰が・どのデッキで・いつからいつまで・何を目標に」の定義だけを持つ。
--   学習エンジンの既存の表には一切触れない。
-- - deck_ids はルートデッキIDの配列（登録APIがルートに解決してから保存する）。
-- - baseline_achieved_count は登録時点で既に習得済みだったカード数（進捗の起点）。
--   登録APIが計算して書く。
-- - 報酬の金額計算・支払いはこの表の外（塾長が判断する）。

CREATE TABLE IF NOT EXISTS public.sparta_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 対象の生徒
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 対象ルートデッキ（1つ以上）。デッキ削除に備え FK は張らず、表示側で欠損を許容する
  deck_ids UUID[] NOT NULL CHECK (cardinality(deck_ids) >= 1),
  -- 期間（両端を含む・日本時間の暦日）
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  -- 目標カード数。NULL = 対象デッキの全カード習得が目標
  target_card_count INTEGER CHECK (target_card_count IS NULL OR target_card_count >= 1),
  -- 習得と数える定着度の基準（単語帳の定着度区分と同じ）
  --   stable   = 定着中以上（実効安定度7日以上）… 既定
  --   mastered = 定着済み（21日以上）
  goal_mastery TEXT NOT NULL DEFAULT 'stable' CHECK (goal_mastery IN ('stable', 'mastered')),
  -- 登録時点で既に習得済みだったカード数（進捗の起点。登録APIが計算）
  baseline_achieved_count INTEGER NOT NULL DEFAULT 0,
  -- active = 実施中（終了は end_date から導出） / canceled = 中止
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled')),
  -- コーチングで決めた条件のメモ（任意）
  memo TEXT,
  -- 登録した講師
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sparta_programs_user
  ON public.sparta_programs (user_id, status, end_date DESC);

ALTER TABLE public.sparta_programs ENABLE ROW LEVEL SECURITY;

-- 講師・管理者: 登録・編集・中止・削除・閲覧のすべて
CREATE POLICY "Teachers manage sparta programs"
  ON public.sparta_programs
  FOR ALL
  TO authenticated
  USING (public.is_teacher_or_admin(auth.uid()))
  WITH CHECK (public.is_teacher_or_admin(auth.uid()));

-- 生徒: 自分のプログラムを閲覧のみ
CREATE POLICY "Students view own sparta programs"
  ON public.sparta_programs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_sparta_programs_updated_at
  BEFORE UPDATE ON public.sparta_programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
