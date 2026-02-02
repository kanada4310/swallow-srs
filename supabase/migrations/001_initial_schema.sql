-- =====================================================
-- つばめSRS Database Schema
-- Migration: 001_initial_schema.sql
-- =====================================================

-- 注意: profilesテーブルは既に作成済みのため、このファイルには含まれていません。
-- このファイルには残りのすべてのテーブルが含まれています。

-- =====================================================
-- ユーティリティ関数
-- =====================================================

-- updated_at を自動更新する関数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- クラス関連テーブル
-- =====================================================

-- クラス（例: 高3理系）
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- クラスメンバー（生徒の所属）
CREATE TABLE public.class_members (
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (class_id, user_id)
);

-- =====================================================
-- ノートタイプ・テンプレート
-- =====================================================

-- ノートタイプ（Anki互換）
CREATE TABLE public.note_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  fields JSONB NOT NULL,  -- [{name: "Front", ord: 0}, {name: "Back", ord: 1}]
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- カードテンプレート（HTML/CSS）
CREATE TABLE public.card_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_type_id UUID NOT NULL REFERENCES public.note_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  front_template TEXT NOT NULL,  -- HTML with {{Field}} placeholders
  back_template TEXT NOT NULL,
  css TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- デッキ・ノート・カード
-- =====================================================

-- デッキ
CREATE TABLE public.decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_distributed BOOLEAN DEFAULT FALSE,
  parent_deck_id UUID REFERENCES public.decks(id) ON DELETE SET NULL,
  settings JSONB DEFAULT '{"new_cards_per_day": 20}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- デッキ配布（クラスまたは個人に配布）
CREATE TABLE public.deck_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  -- クラスか個人のどちらかのみ指定可能
  CONSTRAINT deck_assignment_target CHECK (
    (class_id IS NOT NULL AND user_id IS NULL) OR
    (class_id IS NULL AND user_id IS NOT NULL)
  )
);

-- ノート（カードの元データ）
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  note_type_id UUID NOT NULL REFERENCES public.note_types(id),
  field_values JSONB NOT NULL,  -- {"Front": "apple", "Back": "りんご"}
  source_info JSONB,  -- {"book": "ターゲット1900", "unit": 3, "number": 142}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- カード（ノートから生成される学習単位）
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  template_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 学習記録（ユーザー個別）
-- =====================================================

-- カード状態（SM-2アルゴリズム用）
CREATE TABLE public.card_states (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  due TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  interval INTEGER NOT NULL DEFAULT 0,  -- 日数
  ease_factor REAL NOT NULL DEFAULT 2.5,
  repetitions INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'learning', 'review', 'relearning')),
  learning_step INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, card_id)
);

-- レビューログ（学習履歴）
CREATE TABLE public.review_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  ease INTEGER NOT NULL CHECK (ease BETWEEN 1 AND 4),  -- 1=Again, 2=Hard, 3=Good, 4=Easy
  interval INTEGER NOT NULL,
  last_interval INTEGER NOT NULL,
  time_ms INTEGER,  -- 回答にかかった時間
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- =====================================================
-- インデックス
-- =====================================================

-- パフォーマンス向上のためのインデックス
CREATE INDEX idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX idx_class_members_user_id ON public.class_members(user_id);
CREATE INDEX idx_note_types_owner_id ON public.note_types(owner_id);
CREATE INDEX idx_card_templates_note_type_id ON public.card_templates(note_type_id);
CREATE INDEX idx_decks_owner_id ON public.decks(owner_id);
CREATE INDEX idx_decks_parent_deck_id ON public.decks(parent_deck_id);
CREATE INDEX idx_deck_assignments_deck_id ON public.deck_assignments(deck_id);
CREATE INDEX idx_deck_assignments_class_id ON public.deck_assignments(class_id);
CREATE INDEX idx_deck_assignments_user_id ON public.deck_assignments(user_id);
CREATE INDEX idx_notes_deck_id ON public.notes(deck_id);
CREATE INDEX idx_notes_note_type_id ON public.notes(note_type_id);
CREATE INDEX idx_cards_note_id ON public.cards(note_id);
CREATE INDEX idx_cards_deck_id ON public.cards(deck_id);
CREATE INDEX idx_card_states_due ON public.card_states(user_id, due);
CREATE INDEX idx_card_states_state ON public.card_states(user_id, state);
CREATE INDEX idx_review_logs_user_id ON public.review_logs(user_id);
CREATE INDEX idx_review_logs_card_id ON public.review_logs(card_id);
CREATE INDEX idx_review_logs_reviewed_at ON public.review_logs(user_id, reviewed_at);

-- =====================================================
-- トリガー (updated_at 自動更新)
-- =====================================================

CREATE TRIGGER update_classes_updated_at
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_note_types_updated_at
  BEFORE UPDATE ON public.note_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_card_templates_updated_at
  BEFORE UPDATE ON public.card_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_decks_updated_at
  BEFORE UPDATE ON public.decks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_cards_updated_at
  BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_card_states_updated_at
  BEFORE UPDATE ON public.card_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- RLS (Row Level Security) ポリシー
-- =====================================================

-- すべてのテーブルでRLSを有効化
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------
-- classes ポリシー
-- -----------------------------------------------------
-- 講師は自分のクラスを管理可能
CREATE POLICY "Teachers can manage their own classes"
  ON public.classes
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- 生徒は所属クラスを閲覧可能
CREATE POLICY "Students can view their classes"
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_members
      WHERE class_members.class_id = classes.id
      AND class_members.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------
-- class_members ポリシー
-- -----------------------------------------------------
-- 講師は自分のクラスのメンバーを管理可能
CREATE POLICY "Teachers can manage class members"
  ON public.class_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classes
      WHERE classes.id = class_members.class_id
      AND classes.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes
      WHERE classes.id = class_members.class_id
      AND classes.teacher_id = auth.uid()
    )
  );

-- 生徒は自分の所属を閲覧可能
CREATE POLICY "Students can view their own membership"
  ON public.class_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- -----------------------------------------------------
-- note_types ポリシー
-- -----------------------------------------------------
-- システムノートタイプは全員閲覧可能
CREATE POLICY "Anyone can view system note types"
  ON public.note_types
  FOR SELECT
  TO authenticated
  USING (is_system = true);

-- 自分のノートタイプを管理可能
CREATE POLICY "Users can manage their own note types"
  ON public.note_types
  FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- -----------------------------------------------------
-- card_templates ポリシー
-- -----------------------------------------------------
-- ノートタイプを閲覧できればテンプレートも閲覧可能
CREATE POLICY "Users can view templates of accessible note types"
  ON public.card_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.note_types
      WHERE note_types.id = card_templates.note_type_id
      AND (note_types.is_system = true OR note_types.owner_id = auth.uid())
    )
  );

-- 自分のノートタイプのテンプレートを管理可能
CREATE POLICY "Users can manage templates of their note types"
  ON public.card_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.note_types
      WHERE note_types.id = card_templates.note_type_id
      AND note_types.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.note_types
      WHERE note_types.id = card_templates.note_type_id
      AND note_types.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------
-- decks ポリシー
-- -----------------------------------------------------
-- 自分のデッキを管理可能
CREATE POLICY "Users can manage their own decks"
  ON public.decks
  FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 配布されたデッキを閲覧可能
CREATE POLICY "Users can view assigned decks"
  ON public.decks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deck_assignments da
      WHERE da.deck_id = decks.id
      AND (
        da.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.class_members cm
          WHERE cm.class_id = da.class_id
          AND cm.user_id = auth.uid()
        )
      )
    )
  );

-- -----------------------------------------------------
-- deck_assignments ポリシー
-- -----------------------------------------------------
-- デッキオーナーのみ配布を管理可能
CREATE POLICY "Deck owners can manage assignments"
  ON public.deck_assignments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_assignments.deck_id
      AND decks.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = deck_assignments.deck_id
      AND decks.owner_id = auth.uid()
    )
  );

-- 配布先のユーザーは閲覧可能
CREATE POLICY "Assigned users can view their assignments"
  ON public.deck_assignments
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.class_members cm
      WHERE cm.class_id = deck_assignments.class_id
      AND cm.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------
-- notes ポリシー
-- -----------------------------------------------------
-- デッキオーナーはノートを管理可能
CREATE POLICY "Deck owners can manage notes"
  ON public.notes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = notes.deck_id
      AND decks.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = notes.deck_id
      AND decks.owner_id = auth.uid()
    )
  );

-- 配布されたデッキのノートは閲覧可能
CREATE POLICY "Users can view notes in assigned decks"
  ON public.notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deck_assignments da
      WHERE da.deck_id = notes.deck_id
      AND (
        da.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.class_members cm
          WHERE cm.class_id = da.class_id
          AND cm.user_id = auth.uid()
        )
      )
    )
  );

-- -----------------------------------------------------
-- cards ポリシー
-- -----------------------------------------------------
-- デッキオーナーはカードを管理可能
CREATE POLICY "Deck owners can manage cards"
  ON public.cards
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = cards.deck_id
      AND decks.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.decks
      WHERE decks.id = cards.deck_id
      AND decks.owner_id = auth.uid()
    )
  );

-- 配布されたデッキのカードは閲覧可能
CREATE POLICY "Users can view cards in assigned decks"
  ON public.cards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deck_assignments da
      WHERE da.deck_id = cards.deck_id
      AND (
        da.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.class_members cm
          WHERE cm.class_id = da.class_id
          AND cm.user_id = auth.uid()
        )
      )
    )
  );

-- -----------------------------------------------------
-- card_states ポリシー
-- -----------------------------------------------------
-- 自分の学習状態のみアクセス可能
CREATE POLICY "Users can manage their own card states"
  ON public.card_states
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------
-- review_logs ポリシー
-- -----------------------------------------------------
-- 自分のレビューログのみアクセス可能
CREATE POLICY "Users can manage their own review logs"
  ON public.review_logs
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 講師は生徒のレビューログを閲覧可能
CREATE POLICY "Teachers can view students review logs"
  ON public.review_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_members cm
      JOIN public.classes c ON c.id = cm.class_id
      WHERE cm.user_id = review_logs.user_id
      AND c.teacher_id = auth.uid()
    )
  );

-- =====================================================
-- システムデータ（初期データ）
-- =====================================================

-- Basic ノートタイプ（英↔和、両方向）
INSERT INTO public.note_types (id, name, fields, is_system)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Basic (and reversed card)',
  '[{"name": "Front", "ord": 0}, {"name": "Back", "ord": 1}]',
  true
);

-- Basic カードテンプレート（Front → Back）
INSERT INTO public.card_templates (note_type_id, name, ordinal, front_template, back_template, css)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Card 1',
  0,
  '<div class="front">{{Front}}</div>',
  '<div class="front">{{Front}}</div>
<hr>
<div class="back">{{Back}}</div>',
  '.card {
  font-family: sans-serif;
  font-size: 20px;
  text-align: center;
  padding: 20px;
}
.front, .back {
  margin: 10px 0;
}'
);

-- Basic カードテンプレート（Back → Front）
INSERT INTO public.card_templates (note_type_id, name, ordinal, front_template, back_template, css)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Card 2',
  1,
  '<div class="front">{{Back}}</div>',
  '<div class="front">{{Back}}</div>
<hr>
<div class="back">{{Front}}</div>',
  '.card {
  font-family: sans-serif;
  font-size: 20px;
  text-align: center;
  padding: 20px;
}
.front, .back {
  margin: 10px 0;
}'
);

-- Cloze ノートタイプ（穴埋め）
INSERT INTO public.note_types (id, name, fields, is_system)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Cloze',
  '[{"name": "Text", "ord": 0}, {"name": "Extra", "ord": 1}]',
  true
);

-- Cloze カードテンプレート
INSERT INTO public.card_templates (note_type_id, name, ordinal, front_template, back_template, css)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Cloze',
  0,
  '<div class="cloze">{{cloze:Text}}</div>',
  '<div class="cloze">{{cloze:Text}}</div>
{{#Extra}}
<hr>
<div class="extra">{{Extra}}</div>
{{/Extra}}',
  '.card {
  font-family: sans-serif;
  font-size: 20px;
  text-align: center;
  padding: 20px;
}
.cloze {
  margin: 10px 0;
}
.cloze-deletion {
  font-weight: bold;
  color: #00f;
}
.extra {
  font-size: 16px;
  color: #666;
  margin-top: 10px;
}'
);
