ALTER TABLE public.student_faces ADD COLUMN IF NOT EXISTS geometry jsonb;
ALTER TABLE public.attendance_logs ADD COLUMN IF NOT EXISTS geometry_score double precision;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS save_snapshots boolean NOT NULL DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_enroll boolean NOT NULL DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_enroll_min_confidence double precision NOT NULL DEFAULT 0.62;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_enroll_max_faces integer NOT NULL DEFAULT 12;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS geometry_weight double precision NOT NULL DEFAULT 0.25;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS geometry_min_score double precision NOT NULL DEFAULT 0.5;