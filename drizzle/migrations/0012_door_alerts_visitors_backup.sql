ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS door_free_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS door_free_start time without time zone NOT NULL DEFAULT '07:00:00',
  ADD COLUMN IF NOT EXISTS door_free_end time without time zone NOT NULL DEFAULT '08:30:00',
  ADD COLUMN IF NOT EXISTS failed_alert_threshold integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS absent_check_time time without time zone NOT NULL DEFAULT '10:00:00',
  ADD COLUMN IF NOT EXISTS visitor_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS second_camera_index integer NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS second_camera_direction text NOT NULL DEFAULT 'out',
  ADD COLUMN IF NOT EXISTS auto_update_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS backup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS backup_weekday integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS backup_last_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.door_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command text NOT NULL,
  seconds integer NOT NULL DEFAULT 5,
  created_by uuid,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.door_commands TO authenticated;
GRANT ALL ON public.door_commands TO service_role;
ALTER TABLE public.door_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage door commands" ON public.door_commands
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS door_commands_pending_idx ON public.door_commands (created_at DESC) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.visitor_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  note text,
  direction text NOT NULL DEFAULT 'in',
  snapshot_path text,
  device_name text,
  scanned_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_logs TO authenticated;
GRANT ALL ON public.visitor_logs TO service_role;
ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage visitor logs" ON public.visitor_logs
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS visitor_logs_scanned_idx ON public.visitor_logs (scanned_at DESC);

CREATE TABLE IF NOT EXISTS public.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'failed_streak',
  message text NOT NULL,
  device_name text,
  attempts integer NOT NULL DEFAULT 0,
  snapshot_path text,
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_alerts TO authenticated;
GRANT ALL ON public.security_alerts TO service_role;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage security alerts" ON public.security_alerts
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE INDEX IF NOT EXISTS security_alerts_created_idx ON public.security_alerts (created_at DESC);