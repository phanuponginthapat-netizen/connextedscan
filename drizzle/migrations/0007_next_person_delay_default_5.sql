ALTER TABLE public.settings ALTER COLUMN next_person_delay_seconds SET DEFAULT 5;
UPDATE public.settings SET next_person_delay_seconds = 5 WHERE next_person_delay_seconds <= 3;