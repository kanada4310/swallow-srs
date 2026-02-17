-- =====================================================
-- RLS修正: 配布デッキのノートタイプ・テンプレートを生徒が閲覧可能に
-- Migration: 011_fix_note_type_rls.sql
-- =====================================================
-- 問題: note_types / card_templates のRLSが is_system=true OR owner_id のみ。
-- 講師がカスタムノートタイプで配布デッキを作ると、生徒はテンプレートを読めず
-- フォールバック {{Front}}/{{Back}} が使われ、フィールド名不一致で空表示になる。

-- =====================================================
-- ヘルパー関数
-- =====================================================

-- ノートタイプがユーザーにアクセス可能かどうかを判定
-- （システム、自分のもの、または配布デッキで使用されている）
CREATE OR REPLACE FUNCTION public.is_note_type_accessible(p_note_type_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.note_types
    WHERE id = p_note_type_id
    AND (is_system = true OR owner_id = p_user_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.notes n
    WHERE n.note_type_id = p_note_type_id
    AND public.is_deck_assigned_to_user(n.deck_id, p_user_id)
  );
$$;

-- =====================================================
-- note_types: 配布デッキのノートで使われているノートタイプも読める
-- =====================================================
CREATE POLICY "Users can view note types used in assigned decks"
  ON public.note_types
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.note_type_id = note_types.id
      AND public.is_deck_assigned_to_user(n.deck_id, auth.uid())
    )
  );

-- =====================================================
-- card_templates: 既存ポリシーを更新してヘルパー関数を使用
-- =====================================================
DROP POLICY IF EXISTS "Users can view templates of accessible note types" ON public.card_templates;

CREATE POLICY "Users can view templates of accessible note types"
  ON public.card_templates
  FOR SELECT
  TO authenticated
  USING (
    public.is_note_type_accessible(note_type_id, auth.uid())
  );
