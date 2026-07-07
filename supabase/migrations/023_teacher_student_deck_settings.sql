-- 講師が生徒のデッキ別学習設定（user_deck_settings）を読み書きできるようにする
--
-- 背景: user_deck_settings（012）の RLS は「本人のみ」。配布デッキの学習設定
-- （例: 1日の新規枚数）を講師が生徒ごとに調整できるようにする。
-- is_student_of_teacher（016版=billing連携クラス対応）を基準にし、
-- 講師が他講師の設定行を触れる全開放はしない（017 の card_states と同じ精神）。
--
-- 既存の「本人のみ」ポリシーとは permissive OR で共存＝生徒本人の操作は不変。
-- FOR ALL には DELETE も含む（講師UIの「既定に戻す」リセット用）。

CREATE POLICY "Teachers manage student deck settings"
  ON public.user_deck_settings
  FOR ALL
  TO authenticated
  USING (public.is_student_of_teacher(user_id, auth.uid()))
  WITH CHECK (public.is_student_of_teacher(user_id, auth.uid()));
