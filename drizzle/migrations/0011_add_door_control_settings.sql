ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS door_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS door_open_seconds integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS door_deny_alarm boolean NOT NULL DEFAULT true;