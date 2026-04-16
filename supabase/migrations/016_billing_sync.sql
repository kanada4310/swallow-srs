-- 016_billing_sync.sql
-- billing-SRS ミラーリング同期のためのスキーマ変更

-- classesテーブルにbilling連携カラム追加
ALTER TABLE classes ADD COLUMN IF NOT EXISTS billing_template_id TEXT UNIQUE;

-- teacher_idをnullable化（billing同期で講師なしクラスを作成可能に）
ALTER TABLE classes ALTER COLUMN teacher_id DROP NOT NULL;

-- =====================================================
-- RLSポリシー: billing連携クラスへのアクセス許可
-- =====================================================

-- 講師/管理者はbilling連携クラスを閲覧可能
CREATE POLICY "Teachers can view billing-synced classes"
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (
    billing_template_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('teacher', 'admin')
    )
  );

-- is_class_teacher をbilling連携クラスも含むように更新
-- billing連携クラスは全講師/管理者がアクセス可能
CREATE OR REPLACE FUNCTION public.is_class_teacher(p_class_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = p_class_id
    AND (
      teacher_id = p_user_id
      OR (
        billing_template_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = p_user_id
          AND role IN ('teacher', 'admin')
        )
      )
    )
  );
$$;

-- is_student_of_teacher をbilling連携クラスも含むように更新
CREATE OR REPLACE FUNCTION public.is_student_of_teacher(p_student_id UUID, p_teacher_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_members cm
    JOIN public.classes c ON c.id = cm.class_id
    WHERE cm.user_id = p_student_id
    AND (
      c.teacher_id = p_teacher_id
      OR (
        c.billing_template_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = p_teacher_id
          AND role IN ('teacher', 'admin')
        )
      )
    )
  );
$$;
