drop policy if exists "Player admins can replace avatar candidates" on storage.objects;
create policy "Player admins can replace avatar candidates" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'proposals'
    and public.current_user_is_player_admin(
          ((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'proposals'
    and public.current_user_is_player_admin(
          ((storage.foldername(name))[2])::uuid)
  );
