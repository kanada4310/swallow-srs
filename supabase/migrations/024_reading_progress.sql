-- 読解ページの途中保存（生徒 × 講）
--
-- 背景: 工房の読解コーチには保存の仕組みが1つも無く、画面を閉じると入力が全部消えていた。
-- 生徒が家で自習するには「途中でやめて、別の端末でも続きから開ける」ことが要る（DEC-039 第1弾）。
--
-- 中身は1つの JSON にまとめる。どこで切ったか・大意の文・組み立て・ヒントを何段押したかが
-- 全部そこに入っており、講師の見る画面もこの JSON から集計する（別に集計表を持たない）。
-- 学習エンジン（card_states / review_logs）には一切触れない。

CREATE TABLE IF NOT EXISTS public.reading_progress (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 講の識別子。工房が届ける index.json の id（例: 英語長文最前線_第2講）
  lesson_id TEXT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id)
);

-- 講師の一覧は「最近やった順」で見る
CREATE INDEX IF NOT EXISTS idx_reading_progress_updated_at
  ON public.reading_progress (updated_at DESC);

ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

-- 生徒本人: 自分の作業だけ読み書きできる
CREATE POLICY "Users manage own reading progress"
  ON public.reading_progress
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 講師: 担当する生徒の作業を「見る」だけできる（書き換えはしない）
-- 基準は 017 の card_states と同じ is_student_of_teacher（016版=billing連携クラス対応）
CREATE POLICY "Teachers view student reading progress"
  ON public.reading_progress
  FOR SELECT
  TO authenticated
  USING (public.is_student_of_teacher(user_id, auth.uid()));

CREATE TRIGGER update_reading_progress_updated_at
  BEFORE UPDATE ON public.reading_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
