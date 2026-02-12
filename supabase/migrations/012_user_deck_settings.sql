-- 012: User-specific deck settings override
-- Allows students to customize learning settings for distributed decks
-- without modifying the original deck settings

CREATE TABLE public.user_deck_settings (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, deck_id)
);

ALTER TABLE public.user_deck_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own deck settings"
  ON public.user_deck_settings FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_user_deck_settings_updated_at
  BEFORE UPDATE ON public.user_deck_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
