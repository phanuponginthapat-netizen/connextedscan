-- Roles
create type public.app_role as enum ('admin','staff');

create table public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','staff'))
$$;

create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- new user -> profile + role (first user becomes admin)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  first_user boolean;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  select count(*) = 0 into first_user from public.user_roles;
  insert into public.user_roles (user_id, role)
  values (new.id, case when first_user then 'admin'::public.app_role else 'staff'::public.app_role end);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Students
create table public.students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique,
  full_name text not null,
  nickname text,
  class_room text,
  guardian_phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.students to authenticated;
grant all on public.students to service_role;
alter table public.students enable row level security;
create policy "staff manage students" on public.students for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- Face samples
create table public.student_faces (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  image_path text not null,
  source text not null default 'upload',
  embedding double precision[],
  quality double precision,
  status text not null default 'pending',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index student_faces_student_idx on public.student_faces(student_id);
create index student_faces_status_idx on public.student_faces(status);
grant select, insert, update, delete on public.student_faces to authenticated;
grant all on public.student_faces to service_role;
alter table public.student_faces enable row level security;
create policy "staff manage faces" on public.student_faces for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- Attendance
create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete set null,
  direction text not null,
  status text not null default 'ok',
  confidence double precision,
  device_name text,
  snapshot_path text,
  scanned_at timestamptz not null default now()
);
create index attendance_scanned_idx on public.attendance_logs(scanned_at desc);
create index attendance_student_idx on public.attendance_logs(student_id, scanned_at desc);
grant select, insert, update, delete on public.attendance_logs to authenticated;
grant all on public.attendance_logs to service_role;
alter table public.attendance_logs enable row level security;
create policy "staff read attendance" on public.attendance_logs for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- Settings (singleton)
create table public.settings (
  id boolean primary key default true,
  checkin_start time not null default '06:00',
  checkin_end time not null default '10:00',
  checkout_start time not null default '14:00',
  checkout_end time not null default '19:00',
  late_after time not null default '08:00',
  duplicate_cooldown_minutes integer not null default 300,
  next_person_delay_seconds integer not null default 3,
  match_threshold double precision not null default 0.42,
  require_liveness boolean not null default true,
  school_name text not null default 'โรงเรียนของเรา',
  voice_template text not null default 'สแกนสำเร็จ {name} {direction}',
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id)
);
grant select, insert, update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "staff read settings" on public.settings for select to authenticated using (public.is_staff(auth.uid()));
create policy "admin update settings" on public.settings for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
insert into public.settings (id) values (true);

-- Kiosk devices
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  api_key text not null unique,
  location text,
  default_direction text not null default 'auto',
  last_seen_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.devices to authenticated;
grant all on public.devices to service_role;
alter table public.devices enable row level security;
create policy "staff manage devices" on public.devices for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
