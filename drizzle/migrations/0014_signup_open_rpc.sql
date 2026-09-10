create or replace function public.is_signup_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select allow_signup from public.settings limit 1), false);
$$;

grant execute on function public.is_signup_open() to anon, authenticated, service_role;