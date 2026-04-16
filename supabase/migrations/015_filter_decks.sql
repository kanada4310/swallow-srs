-- 015: Filter Decks - タグベースフィルタデッキ
-- フィルタデッキ: サブデッキにタグを設定し、新規カード導入をタグで絞り込む

-- filter_tags カラム追加
ALTER TABLE decks ADD COLUMN IF NOT EXISTS filter_tags TEXT[] DEFAULT '{}';
UPDATE decks SET filter_tags = '{}' WHERE filter_tags IS NULL;

-- GINインデックス（タグ検索用）
CREATE INDEX IF NOT EXISTS idx_decks_filter_tags ON decks USING GIN (filter_tags);

-- ルートデッキID取得関数（parent_deck_idを辿ってルートまで遡る）
CREATE OR REPLACE FUNCTION get_root_deck_id(p_deck_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_id UUID := p_deck_id;
  v_parent_id UUID;
BEGIN
  LOOP
    SELECT parent_deck_id INTO v_parent_id FROM decks WHERE id = v_current_id;
    IF v_parent_id IS NULL THEN
      RETURN v_current_id;
    END IF;
    v_current_id := v_parent_id;
  END LOOP;
END;
$$;
