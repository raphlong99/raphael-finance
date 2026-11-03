-- Multi-user personal finance schema. Every row belongs to one auth user and RLS limits each user to their own rows.

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  birth_month date,
  currency text not null default 'SGD',
  income_estimate numeric(12,2) not null default 0,
  income_growth numeric(5,2) not null default 3,
  seasonal jsonb not null default '{}'::jsonb,   -- {"11": -15, "12": -15} = % change to income in Nov and Dec
  cost_growth numeric(5,2) not null default 2,
  cash_rate numeric(5,2) not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  kind text not null check (kind in ('cash','brokerage','ilp','cpf','other')),
  currency text not null default 'SGD',
  sort int not null default 0,
  archived boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('savings','investment')),
  target numeric(14,2),
  fill_order int not null default 0,          -- savings buckets fill lowest first
  color text not null default 'teal',
  expected_return numeric(5,2),               -- % a year, investment buckets
  account_id uuid,
  archived boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete set null (account_id)
);

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  monthly numeric(12,2) not null,
  in_force boolean not null default true,
  category text,
  sort int not null default 0
);

create table public.split_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('percent','fixed','percent_min','expenses','remainder')),
  value numeric(12,2),                         -- percent (percent, percent_min) or amount (fixed)
  min_amount numeric(12,2),                    -- floor for percent_min
  round_mode text not null default 'none' check (round_mode in ('up','down','none')),
  round_to numeric(12,2) not null default 1,
  bucket_id uuid,                              -- where the money goes; null = spent or set aside
  category text not null default 'other' check (category in ('tax','needs','invest','fun','save','other')),
  color text,
  sort int not null default 0,
  foreign key (bucket_id, user_id) references public.buckets(id, user_id) on delete set null (bucket_id)
);
create unique index split_rules_one_remainder on public.split_rules (user_id) where kind = 'remainder';

create table public.months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  income numeric(12,2) not null,
  split jsonb not null default '[]'::jsonb,    -- snapshot: [{rule_id,name,category,amount,bucket_id}]
  is_estimate boolean not null default false,
  notes text,
  unique (user_id, month)
);

create table public.balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  as_of date not null,
  value numeric(14,2) not null,                -- in the profile currency
  source text not null default 'manual' check (source in ('manual','api','statement','claude')),
  note text,
  created_at timestamptz not null default now(),
  unique (account_id, as_of),
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete cascade
);

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null,
  symbol text not null,
  name text,
  market text,
  currency text not null,
  qty numeric(18,6) not null,
  avg_cost numeric(14,4),
  last_price numeric(14,4),
  as_of timestamptz not null default now(),
  unique (account_id, symbol),
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete cascade
);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  insurer text not null,
  name text not null,
  kind text not null check (kind in ('life','ci','hospital','pa','ilp','disability','other')),
  premium numeric(12,2) not null,
  frequency text not null check (frequency in ('monthly','quarterly','annual')),
  paid_via text,
  next_due date,
  cover jsonb not null default '[]'::jsonb,    -- [{type,amount,until,note}]
  in_force boolean not null default true,
  notes text,
  sort int not null default 0
);

create index on public.accounts (user_id);
create index on public.buckets (user_id);
create index on public.expense_items (user_id);
create index on public.split_rules (user_id);
create index on public.balances (user_id, as_of);
create index on public.holdings (user_id);
create index on public.policies (user_id);

-- RLS: each user sees and changes only their own rows.
alter table public.profiles enable row level security;
create policy own_profile on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
do $$
declare t text;
begin
  foreach t in array array['accounts','buckets','expense_items','split_rules','months','balances','holdings','policies'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- New users start with a profile, an emergency fund bucket and two rules.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare ef uuid;
begin
  insert into public.profiles (id, display_name) values (new.id, split_part(new.email, '@', 1));
  insert into public.buckets (user_id, name, kind, fill_order, color)
    values (new.id, 'Emergency fund', 'savings', 1, 'teal') returning id into ef;
  insert into public.split_rules (user_id, name, kind, category, sort) values
    (new.id, 'Needs', 'expenses', 'needs', 10),
    (new.id, 'Savings', 'remainder', 'save', 99);
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
