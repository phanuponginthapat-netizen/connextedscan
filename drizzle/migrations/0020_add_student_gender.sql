ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.students
ADD CONSTRAINT students_gender_check
CHECK (gender IS NULL OR gender IN ('male', 'female', 'unspecified')) NOT VALID;