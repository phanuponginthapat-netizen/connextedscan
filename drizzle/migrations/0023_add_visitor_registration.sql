ALTER TABLE public.students ADD COLUMN IF NOT EXISTS visit_reason text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS visit_date date;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS visitor_register_enabled boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS students_person_type_visit_date_idx ON public.students (person_type, visit_date);