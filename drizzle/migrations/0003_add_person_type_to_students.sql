ALTER TABLE public.students ADD COLUMN person_type text NOT NULL DEFAULT 'student';
ALTER TABLE public.students ADD COLUMN department text;
ALTER TABLE public.students ADD COLUMN position text;
CREATE INDEX idx_students_person_type ON public.students (person_type);
