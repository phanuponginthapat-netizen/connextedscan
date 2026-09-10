ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS kiosk_news_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kiosk_news_text text NOT NULL DEFAULT '';