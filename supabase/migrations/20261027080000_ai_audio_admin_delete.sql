drop policy if exists "Admins delete ai generations" on public.ai_generations;
create policy "Admins delete ai generations" on public.ai_generations for delete to authenticated using (public.is_admin());
drop policy if exists "Admins read ai audio files" on storage.objects;
create policy "Admins read ai audio files" on storage.objects for select to authenticated using (bucket_id = 'ai-audio' and public.is_admin());
drop policy if exists "Admins delete ai audio files" on storage.objects;
create policy "Admins delete ai audio files" on storage.objects for delete to authenticated using (bucket_id = 'ai-audio' and public.is_admin());
