CREATE TABLE public.kiosk_live_frames (
  device_id uuid PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
  device_name text NOT NULL DEFAULT '',
  image text NOT NULL,
  status text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kiosk_live_frames TO authenticated;
GRANT ALL ON public.kiosk_live_frames TO service_role;

ALTER TABLE public.kiosk_live_frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can watch live frames"
ON public.kiosk_live_frames
FOR SELECT
TO authenticated
USING (true);