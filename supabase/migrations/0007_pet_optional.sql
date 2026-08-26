-- A household may exist without a pet: friends who just want to follow along
-- sign up, skip the pet, and can add one later. Loosening only — safe to run
-- before the code deploys.
alter table public.households alter column pet_name drop not null;
