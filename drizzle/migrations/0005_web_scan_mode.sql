ALTER TABLE public.student_faces
  ADD COLUMN IF NOT EXISTS web_embedding double precision[],
  ADD COLUMN IF NOT EXISTS web_geometry jsonb;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS web_match_threshold double precision NOT NULL DEFAULT 0.42,
  ADD COLUMN IF NOT EXISTS allow_web_scan boolean NOT NULL DEFAULT true;