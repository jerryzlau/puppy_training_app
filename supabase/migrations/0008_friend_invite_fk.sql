-- Deleting a household that ever ACCEPTED a friend invite failed with a
-- foreign-key conflict: friend_invites.accepted_household_id had no ON DELETE
-- behavior. The invite record is history worth keeping; just forget who
-- accepted it when that household goes away.
alter table public.friend_invites
  drop constraint friend_invites_accepted_household_id_fkey,
  add constraint friend_invites_accepted_household_id_fkey
    foreign key (accepted_household_id) references public.households
    on delete set null;
