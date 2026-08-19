-- Storage bucket for diary photos.
-- Path convention: {household_id}/{entry_id}/{uuid}.jpg
insert into storage.buckets (id, name, public)
values ('diary-photos', 'diary-photos', false)
on conflict (id) do nothing;

-- Members of a household can read/write objects under their household's prefix.
create policy "household members read photos"
  on storage.objects for select
  using (
    bucket_id = 'diary-photos'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "household members upload photos"
  on storage.objects for insert
  with check (
    bucket_id = 'diary-photos'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "household members delete photos"
  on storage.objects for delete
  using (
    bucket_id = 'diary-photos'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );
