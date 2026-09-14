ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS door_angle_down integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS door_angle_up integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS door_move_step integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS door_move_delay_ms integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS door_hold_power boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS door_buzzer_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS door_use_relay boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS door_invert_servo boolean NOT NULL DEFAULT false;