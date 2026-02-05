-- Add generation_rules column to note_types table
-- This stores AI generation rules that define how fields are auto-generated
-- Each rule specifies source fields, a custom instruction, and a target field

ALTER TABLE public.note_types
ADD COLUMN IF NOT EXISTS generation_rules JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.note_types.generation_rules IS 'Array of GenerationRule objects: [{id, name, source_fields, instruction, target_field}]';
