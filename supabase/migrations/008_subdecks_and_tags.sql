-- Phase 7.4: Subdecks & Note Tags
-- 1. RPC function to get all descendant deck IDs (recursive)
-- 2. Tags column on notes with GIN index
-- 3. Updated search_notes RPC with tag filter
-- 4. get_deck_tags RPC to get unique tags for a deck
-- 5. bulk_update_tags RPC for batch tag operations

-- ============================================================
-- Part A: Subdecks - RPC for descendant deck IDs
-- ============================================================

-- Index on parent_deck_id for efficient tree traversal
CREATE INDEX IF NOT EXISTS idx_decks_parent_deck_id ON decks (parent_deck_id);

-- Get all descendant deck IDs (children, grandchildren, etc.) using recursive CTE
CREATE OR REPLACE FUNCTION get_descendant_deck_ids(p_deck_id UUID)
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE descendants AS (
    SELECT id FROM decks WHERE parent_deck_id = p_deck_id
    UNION ALL
    SELECT d.id FROM decks d INNER JOIN descendants desc_cte ON d.parent_deck_id = desc_cte.id
  )
  SELECT id FROM descendants;
END;
$$;

-- ============================================================
-- Part B: Note Tags
-- ============================================================

-- Add tags column to notes
ALTER TABLE notes ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Set NULL tags to empty array
UPDATE notes SET tags = '{}' WHERE tags IS NULL;

-- GIN index for array containment queries (@>)
CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes USING GIN (tags);

-- ============================================================
-- Updated search_notes with tag filter and tags in result
-- ============================================================

CREATE OR REPLACE FUNCTION search_notes(
  p_deck_id UUID,
  p_query TEXT DEFAULT '',
  p_note_type_id UUID DEFAULT NULL,
  p_tag TEXT DEFAULT NULL,
  p_sort_order TEXT DEFAULT 'desc',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  field_values JSONB,
  note_type_id UUID,
  generated_content JSONB,
  tags TEXT[],
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Count total matching rows
  SELECT COUNT(*) INTO v_total
  FROM notes n
  WHERE n.deck_id = p_deck_id
    AND (p_note_type_id IS NULL OR n.note_type_id = p_note_type_id)
    AND (p_query = '' OR n.field_values::text ILIKE '%' || p_query || '%')
    AND (p_tag IS NULL OR n.tags @> ARRAY[p_tag]);

  -- Return matching rows with total count
  RETURN QUERY
  SELECT
    n.id,
    n.field_values,
    n.note_type_id,
    n.generated_content,
    n.tags,
    n.created_at,
    v_total AS total_count
  FROM notes n
  WHERE n.deck_id = p_deck_id
    AND (p_note_type_id IS NULL OR n.note_type_id = p_note_type_id)
    AND (p_query = '' OR n.field_values::text ILIKE '%' || p_query || '%')
    AND (p_tag IS NULL OR n.tags @> ARRAY[p_tag])
  ORDER BY
    CASE WHEN p_sort_order = 'asc' THEN n.created_at END ASC,
    CASE WHEN p_sort_order != 'asc' THEN n.created_at END DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;

-- ============================================================
-- Get all unique tags for notes in a deck
-- ============================================================

CREATE OR REPLACE FUNCTION get_deck_tags(p_deck_id UUID)
RETURNS SETOF TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT unnest(n.tags)
  FROM notes n
  WHERE n.deck_id = p_deck_id
    AND array_length(n.tags, 1) > 0
  ORDER BY 1;
END;
$$;

-- ============================================================
-- Bulk update tags (add/remove tags for multiple notes)
-- ============================================================

CREATE OR REPLACE FUNCTION bulk_update_tags(
  p_note_ids UUID[],
  p_add_tags TEXT[] DEFAULT '{}',
  p_remove_tags TEXT[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Add tags (union with existing, remove duplicates)
  IF array_length(p_add_tags, 1) > 0 THEN
    UPDATE notes
    SET tags = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(tags || p_add_tags)
        ORDER BY 1
      )
    ),
    updated_at = NOW()
    WHERE id = ANY(p_note_ids);
  END IF;

  -- Remove tags
  IF array_length(p_remove_tags, 1) > 0 THEN
    UPDATE notes
    SET tags = (
      SELECT ARRAY(
        SELECT unnest(tags) EXCEPT SELECT unnest(p_remove_tags)
        ORDER BY 1
      )
    ),
    updated_at = NOW()
    WHERE id = ANY(p_note_ids);
  END IF;
END;
$$;
