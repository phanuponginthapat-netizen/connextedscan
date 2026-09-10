CREATE INDEX IF NOT EXISTS attendance_status_scanned_idx ON public.attendance_logs (status, scanned_at DESC);
CREATE INDEX IF NOT EXISTS student_faces_needs_embedding_idx ON public.student_faces (status) WHERE embedding IS NULL;
CREATE INDEX IF NOT EXISTS students_active_type_idx ON public.students (is_active, person_type);