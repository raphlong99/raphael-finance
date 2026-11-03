alter table public.buckets drop constraint buckets_kind_check;
alter table public.buckets add constraint buckets_kind_check check (kind in ('savings','investment','cpf'));
alter table public.policies add column medisave_amount numeric(12,2) not null default 0;
comment on column public.policies.medisave_amount is 'Part of each premium paid from CPF MediSave rather than cash';
