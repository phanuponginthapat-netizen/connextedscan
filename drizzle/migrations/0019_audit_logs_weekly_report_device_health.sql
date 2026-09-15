ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS screensaver_mode text NOT NULL DEFAULT 'stats',
  ADD COLUMN IF NOT EXISTS weekly_report_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekly_report_weekday integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS weekly_report_time time without time zone NOT NULL DEFAULT '16:30:00',
  ADD COLUMN IF NOT EXISTS weekly_report_last_at timestamp with time zone;

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS disk_free_mb integer,
  ADD COLUMN IF NOT EXISTS camera_ok boolean,
  ADD COLUMN IF NOT EXISTS door_ok boolean,
  ADD COLUMN IF NOT EXISTS health_note text;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  target text,
  detail text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);