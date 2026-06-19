-- =====================================================
-- 講師同士のデッキ共同編集（自動共有）
-- Migration: 021_teacher_shared_decks.sql
--
-- 講師（teacher/admin）が作ったデッキ・ノート・カードを、他の講師も
-- 閲覧・編集・削除・配布できるようにする。生徒には一切共有しない。
-- 既存の「自分のデッキを管理」ポリシーに OR で重なる permissive ポリシーを追加するだけ。
-- 役割判定は既存の SECURITY DEFINER 関数 public.is_teacher_or_admin() を再利用する。
-- =====================================================

-- decks: 講師は「講師が所有するデッキ」を全操作できる
CREATE POLICY "Teachers manage teacher decks"
  ON public.decks
  FOR ALL
  TO authenticated
  USING (
    public.is_teacher_or_admin(auth.uid())
    AND public.is_teacher_or_admin(owner_id)
  )
  WITH CHECK (
    public.is_teacher_or_admin(auth.uid())
    AND public.is_teacher_or_admin(owner_id)
  );

-- notes: 講師所有デッキ内のノートを全操作できる
CREATE POLICY "Teachers manage notes in teacher decks"
  ON public.notes
  FOR ALL
  TO authenticated
  USING (
    public.is_teacher_or_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = notes.deck_id
      AND public.is_teacher_or_admin(d.owner_id)
    )
  )
  WITH CHECK (
    public.is_teacher_or_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = notes.deck_id
      AND public.is_teacher_or_admin(d.owner_id)
    )
  );

-- cards: 講師所有デッキ内のカードを全操作できる
CREATE POLICY "Teachers manage cards in teacher decks"
  ON public.cards
  FOR ALL
  TO authenticated
  USING (
    public.is_teacher_or_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = cards.deck_id
      AND public.is_teacher_or_admin(d.owner_id)
    )
  )
  WITH CHECK (
    public.is_teacher_or_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = cards.deck_id
      AND public.is_teacher_or_admin(d.owner_id)
    )
  );

-- deck_assignments: 講師は講師所有デッキの配布を管理できる（他講師の教材を生徒に配れる）
CREATE POLICY "Teachers manage assignments for teacher decks"
  ON public.deck_assignments
  FOR ALL
  TO authenticated
  USING (
    public.is_teacher_or_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_assignments.deck_id
      AND public.is_teacher_or_admin(d.owner_id)
    )
  )
  WITH CHECK (
    public.is_teacher_or_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.decks d
      WHERE d.id = deck_assignments.deck_id
      AND public.is_teacher_or_admin(d.owner_id)
    )
  );

-- note_types: 講師は他講師所有のノートタイプを閲覧できる（共有デッキのカードを正しく描画するため）
-- 編集はオーナーのみ（構造変更は意図せぬ破壊を避けるため共同編集対象外）。
CREATE POLICY "Teachers view teacher note types"
  ON public.note_types
  FOR SELECT
  TO authenticated
  USING (
    public.is_teacher_or_admin(auth.uid())
    AND public.is_teacher_or_admin(owner_id)
  );

-- card_templates: 講師は他講師所有ノートタイプのテンプレートを閲覧できる
CREATE POLICY "Teachers view teacher note templates"
  ON public.card_templates
  FOR SELECT
  TO authenticated
  USING (
    public.is_teacher_or_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.note_types nt
      WHERE nt.id = card_templates.note_type_id
      AND public.is_teacher_or_admin(nt.owner_id)
    )
  );
