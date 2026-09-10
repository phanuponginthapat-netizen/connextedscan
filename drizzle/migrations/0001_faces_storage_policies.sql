create policy "staff read faces bucket" on storage.objects for select to authenticated
  using (bucket_id = 'faces' and public.is_staff(auth.uid()));
create policy "staff upload faces bucket" on storage.objects for insert to authenticated
  with check (bucket_id = 'faces' and public.is_staff(auth.uid()));
create policy "staff update faces bucket" on storage.objects for update to authenticated
  using (bucket_id = 'faces' and public.is_staff(auth.uid()));
create policy "staff delete faces bucket" on storage.objects for delete to authenticated
  using (bucket_id = 'faces' and public.is_staff(auth.uid()));
