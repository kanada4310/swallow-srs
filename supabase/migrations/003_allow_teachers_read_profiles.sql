-- =====================================================
-- 講師が生徒のプロフィールを読み取れるようにする
-- Migration: 003_allow_teachers_read_profiles.sql
-- =====================================================

-- ヘルパー関数：ユーザーが講師またはadminかどうかを判定
CREATE OR REPLACE FUNCTION public.is_teacher_or_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
    AND role IN ('teacher', 'admin')
  );
$$;

-- 講師が全生徒のプロフィールを読み取れるようにする
-- （クラスへの生徒追加のため必要）
CREATE POLICY "Teachers can view student profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_teacher_or_admin(auth.uid())
  );
