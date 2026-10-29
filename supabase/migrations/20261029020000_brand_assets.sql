-- Public bucket for licensed partner images (e.g. the Drum School host photo). Anyone can view; only admins upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload brand assets" on storage.objects;
create policy "Admins upload brand assets" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets' and public.is_admin());
drop policy if exists "Admins update brand assets" on storage.objects;
create policy "Admins update brand assets" on storage.objects for update to authenticated
  using (bucket_id = 'brand-assets' and public.is_admin()) with check (bucket_id = 'brand-assets' and public.is_admin());
drop policy if exists "Admins delete brand assets" on storage.objects;
create policy "Admins delete brand assets" on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets' and public.is_admin());

insert into public.app_public_config (key, value) values ('drum_corner', '{"enabled":false}')
on conflict (key) do nothing;
