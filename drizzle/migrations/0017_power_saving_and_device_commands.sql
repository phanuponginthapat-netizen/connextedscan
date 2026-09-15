ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS power_saving_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS screen_idle_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS screen_off_start time without time zone NOT NULL DEFAULT '18:00:00',
  ADD COLUMN IF NOT EXISTS screen_off_end time without time zone NOT NULL DEFAULT '06:00:00',
  ADD COLUMN IF NOT EXISTS auto_power_off_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_power_off_time time without time zone NOT NULL DEFAULT '18:30:00',
  ADD COLUMN IF NOT EXISTS auto_power_off_action text NOT NULL DEFAULT 'shutdown',
  ADD COLUMN IF NOT EXISTS power_off_workdays_only boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.device_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
  command text NOT NULL,
  created_by uuid,
  result text,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_commands TO authenticated;
GRANT ALL ON public.device_commands TO service_role;

ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage device commands" ON public.device_commands
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS device_commands_pending_idx
  ON public.device_commands (created_at)
  WHERE consumed_at IS NULL;