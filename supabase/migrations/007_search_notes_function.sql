-- Search notes by text within field_values JSONB
-- Used by /api/notes/search for full-text search across all field values
CREATE OR REPLACE FUNCTION search_notes(
  p_deck_id UUID,
  p_query TEXT DEFAULT '',
  p_note_type_id UUID DEFAULT NULL,
  p_sort_order TEXT DEFAULT 'desc',
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  field_values JSONB,
  note_type_id UUID,
  generated_content JSONB,
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
    AND (p_query = '' OR n.field_values::text ILIKE '%' || p_query || '%');

  -- Return matching rows with total count
  RETURN QUERY
  SELECT
    n.id,
    n.field_values,
    n.note_type_id,
    n.generated_content,
    n.created_at,
    v_total AS total_count
  FROM notes n
  WHERE n.deck_id = p_deck_id
    AND (p_note_type_id IS NULL OR n.note_type_id = p_note_type_id)
    AND (p_query = '' OR n.field_values::text ILIKE '%' || p_query || '%')
  ORDER BY
    CASE WHEN p_sort_order = 'asc' THEN n.created_at END ASC,
    CASE WHEN p_sort_order != 'asc' THEN n.created_at END DESC
  OFFSET p_offset
  LIMIT p_limit;
END;
$$;
