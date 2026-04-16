-- 017: Teacher student progress
-- 講師が生徒のcard_statesを閲覧できるRLSポリシー

-- Teachers can view their students' card states (same pattern as review_logs in 002)
CREATE POLICY "Teachers can view students card states"
  ON public.card_states
  FOR SELECT
  TO authenticated
  USING (public.is_student_of_teacher(user_id, auth.uid()));
