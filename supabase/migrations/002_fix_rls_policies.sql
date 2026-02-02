-- =====================================================
-- RLSポリシー修正 - 循環参照問題の解決
-- Migration: 002_fix_rls_policies.sql
-- =====================================================

-- 問題: deck_assignments → class_members → classes → class_members の循環参照
-- 解決: SECURITY DEFINER関数を使用してRLS評価を中断

-- =====================================================
-- ヘルパー関数（SECURITY DEFINER）
-- =====================================================

-- ユーザーがクラスのメンバーかどうかを判定
CREATE OR REPLACE FUNCTION public.is_class_member(p_class_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_members
    WHERE class_id = p_class_id
    AND user_id = p_user_id
  );
$$;

-- ユーザーがクラスの講師かどうかを判定
CREATE OR REPLACE FUNCTION public.is_class_teacher(p_class_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = p_class_id
    AND teacher_id = p_user_id
  );
$$;

-- デッキがユーザーに配布されているかどうかを判定（直接 or クラス経由）
CREATE OR REPLACE FUNCTION public.is_deck_assigned_to_user(p_deck_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deck_assignments da
    WHERE da.deck_id = p_deck_id
    AND (
      da.user_id = p_user_id
      OR public.is_class_member(da.class_id, p_user_id)
    )
  );
$$;

-- ユーザーがデッキのオーナーかどうかを判定
CREATE OR REPLACE FUNCTION public.is_deck_owner(p_deck_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.decks
    WHERE id = p_deck_id
    AND owner_id = p_user_id
  );
$$;

-- 講師の担当生徒かどうかを判定
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
    AND c.teacher_id = p_teacher_id
  );
$$;

-- =====================================================
-- 既存の問題のあるポリシーを削除
-- =====================================================

-- classes
DROP POLICY IF EXISTS "Students can view their classes" ON public.classes;

-- class_members
DROP POLICY IF EXISTS "Teachers can manage class members" ON public.class_members;

-- decks
DROP POLICY IF EXISTS "Users can view assigned decks" ON public.decks;

-- deck_assignments
DROP POLICY IF EXISTS "Assigned users can view their assignments" ON public.deck_assignments;

-- notes
DROP POLICY IF EXISTS "Users can view notes in assigned decks" ON public.notes;

-- cards
DROP POLICY IF EXISTS "Users can view cards in assigned decks" ON public.cards;

-- review_logs
DROP POLICY IF EXISTS "Teachers can view students review logs" ON public.review_logs;

-- =====================================================
-- 修正版ポリシーを作成
-- =====================================================

-- -----------------------------------------------------
-- classes ポリシー（修正版）
-- -----------------------------------------------------
-- 生徒は所属クラスを閲覧可能（ヘルパー関数使用）
CREATE POLICY "Students can view their classes"
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (public.is_class_member(id, auth.uid()));

-- -----------------------------------------------------
-- class_members ポリシー（修正版）
-- -----------------------------------------------------
-- 講師は自分のクラスのメンバーを管理可能（ヘルパー関数使用）
CREATE POLICY "Teachers can manage class members"
  ON public.class_members
  FOR ALL
  TO authenticated
  USING (public.is_class_teacher(class_id, auth.uid()))
  WITH CHECK (public.is_class_teacher(class_id, auth.uid()));

-- -----------------------------------------------------
-- decks ポリシー（修正版）
-- -----------------------------------------------------
-- 配布されたデッキを閲覧可能（ヘルパー関数使用）
CREATE POLICY "Users can view assigned decks"
  ON public.decks
  FOR SELECT
  TO authenticated
  USING (public.is_deck_assigned_to_user(id, auth.uid()));

-- -----------------------------------------------------
-- deck_assignments ポリシー（修正版）
-- -----------------------------------------------------
-- 配布先のユーザーは閲覧可能（ヘルパー関数使用）
CREATE POLICY "Assigned users can view their assignments"
  ON public.deck_assignments
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_class_member(class_id, auth.uid())
  );

-- -----------------------------------------------------
-- notes ポリシー（修正版）
-- -----------------------------------------------------
-- 配布されたデッキのノートは閲覧可能（ヘルパー関数使用）
CREATE POLICY "Users can view notes in assigned decks"
  ON public.notes
  FOR SELECT
  TO authenticated
  USING (public.is_deck_assigned_to_user(deck_id, auth.uid()));

-- -----------------------------------------------------
-- cards ポリシー（修正版）
-- -----------------------------------------------------
-- 配布されたデッキのカードは閲覧可能（ヘルパー関数使用）
CREATE POLICY "Users can view cards in assigned decks"
  ON public.cards
  FOR SELECT
  TO authenticated
  USING (public.is_deck_assigned_to_user(deck_id, auth.uid()));

-- -----------------------------------------------------
-- review_logs ポリシー（修正版）
-- -----------------------------------------------------
-- 講師は生徒のレビューログを閲覧可能（ヘルパー関数使用）
CREATE POLICY "Teachers can view students review logs"
  ON public.review_logs
  FOR SELECT
  TO authenticated
  USING (public.is_student_of_teacher(user_id, auth.uid()));
