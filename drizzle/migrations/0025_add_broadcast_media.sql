CREATE TABLE public.broadcast_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  sort_order integer NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 10 CHECK (duration_seconds BETWEEN 3 AND 300),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_media TO authenticated;
GRANT ALL ON public.broadcast_media TO service_role;
ALTER TABLE public.broadcast_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage broadcast media"
ON public.broadcast_media
FOR ALL
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff can upload broadcast files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'broadcast-media' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff can read broadcast files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'broadcast-media' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff can update broadcast files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'broadcast-media' AND public.is_staff(auth.uid()))
WITH CHECK (bucket_id = 'broadcast-media' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff can delete broadcast files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'broadcast-media' AND public.is_staff(auth.uid()));
CREATE INDEX broadcast_media_order_idx ON public.broadcast_media (is_active DESC, sort_order ASC, created_at ASC);