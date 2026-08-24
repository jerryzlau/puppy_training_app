-- Households can now be about a dog or a cat.
-- Existing rows default to 'dog' (Biru's household stays correct), and the
-- pet columns get honest names now that they aren't always about a dog.

alter table public.households
  add column species text not null default 'dog'
    check (species in ('dog', 'cat'));

alter table public.households rename column dog_name to pet_name;
alter table public.households rename column dog_breed to pet_breed;
alter table public.households rename column dog_birthday to pet_birthday;
alter table public.households rename column dog_photo_path to pet_photo_path;

-- Breed is optional going forward; the old defaults assumed one specific dog.
alter table public.households alter column pet_name drop default;
alter table public.households alter column pet_breed drop default;
alter table public.households alter column pet_breed drop not null;
alter table public.households alter column name drop default;
