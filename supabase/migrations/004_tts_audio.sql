-- Migration: TTS Audio Support
-- Add audio_urls column to notes and create user TTS settings table

-- Add audio_urls column to notes table
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS audio_urls JSONB DEFAULT '{}';

-- Create user TTS settings table
CREATE TABLE IF NOT EXISTS public.user_tts_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled_fields JSONB DEFAULT '["Front"]',
  voice TEXT DEFAULT 'alloy' CHECK (voice IN ('alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer')),
  speed REAL DEFAULT 1.0 CHECK (speed >= 0.25 AND speed <= 4.0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on user_tts_settings
ALTER TABLE public.user_tts_settings ENABLE ROW LEVEL SECURITY;

-- RLS policy for user_tts_settings
CREATE POLICY "Users can manage their own TTS settings"
  ON public.user_tts_settings FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add trigger for updated_at
CREATE TRIGGER update_user_tts_settings_updated_at
  BEFORE UPDATE ON public.user_tts_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Comment for documentation
COMMENT ON TABLE public.user_tts_settings IS 'User preferences for text-to-speech feature';
COMMENT ON COLUMN public.notes.audio_urls IS 'JSON object mapping field names to audio URLs: {"Front": "https://...", "Back": "https://..."}';
