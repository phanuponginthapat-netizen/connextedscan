-- Settings for cleanup, notifications and device health
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS cleanup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cleanup_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_offline_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS notify_email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_line_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_absent boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_late boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_early_leave boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_failed_streak boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_device_offline boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_last_at timestamptz;

-- Kiosk program version / platform, shown on the system health page
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS agent_version text,
  ADD COLUMN IF NOT EXISTS platform text;

-- Who receives notifications
CREATE TABLE IF NOT EXISTS public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  line_user_id text,
  events text NOT NULL DEFAULT 'absent,late,early_leave,failed_streak,device_offline',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_recipients TO authenticated;
GRANT ALL ON public.notification_recipients TO service_role;
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage notification recipients" ON public.notification_recipients
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Delivery history
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  event text NOT NULL,
  target text,
  subject text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read notification logs" ON public.notification_logs
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "staff delete notification logs" ON public.notification_logs
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- Indexes for growing data volumes
CREATE INDEX IF NOT EXISTS attendance_logs_status_scanned_idx
  ON public.attendance_logs (status, scanned_at DESC);
CREATE INDEX IF NOT EXISTS attendance_logs_student_scanned_idx
  ON public.attendance_logs (student_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS attendance_logs_snapshot_idx
  ON public.attendance_logs (scanned_at)
  WHERE snapshot_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS student_faces_status_idx
  ON public.student_faces (status);
CREATE INDEX IF NOT EXISTS student_faces_student_idx
  ON public.student_faces (student_id);
CREATE INDEX IF NOT EXISTS students_type_active_idx
  ON public.students (person_type, is_active);
CREATE INDEX IF NOT EXISTS students_code_idx
  ON public.students (student_code);
CREATE INDEX IF NOT EXISTS security_alerts_created_idx
  ON public.security_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS security_alerts_open_idx
  ON public.security_alerts (created_at DESC)
  WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS visitor_logs_scanned_idx
  ON public.visitor_logs (scanned_at DESC);
CREATE INDEX IF NOT EXISTS notification_logs_created_idx
  ON public.notification_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS door_commands_pending_idx
  ON public.door_commands (created_at DESC)
  WHERE consumed_at IS NULL;