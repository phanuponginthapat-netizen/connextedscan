ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS checkin_only_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS idle_stats_minutes integer NOT NULL DEFAULT 0;