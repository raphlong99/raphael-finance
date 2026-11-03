alter table public.profiles
  add column earner_type text check (earner_type in ('salaried','freelancer','business','mixed')),
  add column template text,
  add column onboarded boolean not null default false;
alter table public.buckets
  add column target_date date,
  add column preset text;

-- New users get only a profile; the guided setup creates their buckets and rules.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name) values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;
