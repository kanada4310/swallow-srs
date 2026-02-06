-- Fix: Drop the old search_notes function (007 version) that conflicts with the new one (008).
-- PostgreSQL CREATE OR REPLACE only replaces functions with the SAME parameter signature.
-- Since 007 and 008 have different parameter lists, both versions coexist as overloads.
-- PostgREST may resolve to the wrong overload, causing multi-deck search to fail.

-- Drop the old 007 version (6 parameters: p_deck_id, p_query, p_note_type_id, p_sort_order, p_offset, p_limit)
DROP FUNCTION IF EXISTS search_notes(UUID, TEXT, UUID, TEXT, INT, INT);

-- The 008 version (8 parameters) remains:
-- search_notes(UUID, UUID[], TEXT, UUID, TEXT, TEXT, INT, INT)
