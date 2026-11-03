-- Policies with a cash or fund value (whole life, ILP) point at an account that holds that value,
-- so it has a balance history and counts in net worth like any other account.
alter table public.accounts drop constraint accounts_kind_check;
alter table public.accounts add constraint accounts_kind_check
  check (kind in ('cash', 'brokerage', 'ilp', 'cpf', 'policy', 'other'));

alter table public.policies add column account_id uuid;
alter table public.policies add constraint policies_account_fk
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id);
create index policies_account_id_idx on public.policies (account_id);

-- What the insurer would pay if the policy were cancelled today. For an ILP this can be far below the fund value in early years.
alter table public.policies add column surrender_value numeric(14,2);
alter table public.policies add column surrender_as_of date;
