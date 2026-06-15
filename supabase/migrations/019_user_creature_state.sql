-- 019: 記憶のいきもの育成（Phase 10.4）— 品種インプリント
-- 生徒×ノートのコスメ用テーブル。育成ゲームで唯一の新規データモデル。
-- card_states（生死・成長の導出元）はそのまま。これは「見た目の刻印」だけを持つ。
-- 仕様: docs/memory-creatures-design.md

CREATE TABLE public.user_creature_state (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  imprint JSONB NOT NULL DEFAULT '{}',  -- 選んだ品種(果樹/花き)・色違い等のバリアント {"variety": "apple"}
  nickname TEXT,                         -- 任意のニックネーム
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, note_id)
);

ALTER TABLE public.user_creature_state ENABLE ROW LEVEL SECURITY;

-- 生徒ごとの刻印。自分のものだけ読み書き可。
CREATE POLICY "Users can manage own creature state"
  ON public.user_creature_state FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_user_creature_state_updated_at
  BEFORE UPDATE ON public.user_creature_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
