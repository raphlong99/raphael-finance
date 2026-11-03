-- Personal connector links. Each token is shown once; only its SHA-256 hash is stored.
create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Claude',
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index on public.mcp_tokens (user_id);
alter table public.mcp_tokens enable row level security;
create policy own_tokens_read on public.mcp_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy own_tokens_delete on public.mcp_tokens for delete to authenticated using (user_id = (select auth.uid()));

-- Signed-in users create a token for themselves. Returns the plain token once.
create or replace function public.create_mcp_token(p_name text default 'Claude') returns text
language plpgsql security definer set search_path = ''
as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.mcp_tokens (user_id, name, token_hash)
  values (auth.uid(), coalesce(nullif(p_name, ''), 'Claude'), encode(extensions.digest(t, 'sha256'), 'hex'));
  return t;
end $$;
revoke all on function public.create_mcp_token(text) from public, anon;
grant execute on function public.create_mcp_token(text) to authenticated;

-- Resolve a token to its user, or fail.
create or replace function private.mcp_user(p_token text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare uid uuid;
begin
  update public.mcp_tokens set last_used_at = now()
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  returning user_id into uid;
  if uid is null then raise exception 'Invalid connector link' using errcode = '28000'; end if;
  return uid;
end $$;
revoke all on function private.mcp_user(text) from public, anon, authenticated;

-- Everything the connector needs to answer questions, for the token's user only.
create or replace function public.mcp_overview(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.mcp_user(p_token);
begin
  return jsonb_build_object(
    'profile', (select to_jsonb(p) - 'id' from public.profiles p where p.id = uid),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'institution', a.institution, 'kind', a.kind,
        'value', lb.value, 'as_of', lb.as_of) order by a.sort)
      from public.accounts a
      left join lateral (select b.value, b.as_of from public.balances b where b.account_id = a.id order by b.as_of desc limit 1) lb on true
      where a.user_id = uid and not a.archived), '[]'::jsonb),
    'buckets', coalesce((select jsonb_agg(to_jsonb(b) - 'user_id' order by b.fill_order) from public.buckets b where b.user_id = uid and not b.archived), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' order by r.sort) from public.split_rules r where r.user_id = uid), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' order by e.sort) from public.expense_items e where e.user_id = uid), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by m.month desc) from (select * from public.months where user_id = uid order by month desc limit 6) m), '[]'::jsonb),
    'policies', coalesce((select jsonb_agg(to_jsonb(p) - 'user_id' order by p.sort) from public.policies p where p.user_id = uid), '[]'::jsonb)
  );
end $$;

-- [{account_id, value, as_of?, note?}]
create or replace function public.mcp_set_balances(p_token text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.mcp_user(p_token); it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.accounts where id = (it->>'account_id')::uuid and user_id = uid) then
      raise exception 'Unknown account %', it->>'account_id';
    end if;
    insert into public.balances (user_id, account_id, as_of, value, source, note)
    values (uid, (it->>'account_id')::uuid, coalesce((it->>'as_of')::date, (now() at time zone 'Asia/Singapore')::date),
            (it->>'value')::numeric, 'claude', it->>'note')
    on conflict (account_id, as_of) do update set value = excluded.value, source = 'claude', note = coalesce(excluded.note, public.balances.note);
    n := n + 1;
  end loop;
  return jsonb_build_object('updated', n);
end $$;

create or replace function public.mcp_upsert_month(p_token text, p_month date, p_income numeric, p_split jsonb, p_estimate boolean, p_notes text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.mcp_user(p_token);
begin
  insert into public.months (user_id, month, income, split, is_estimate, notes)
  values (uid, date_trunc('month', p_month)::date, p_income, coalesce(p_split, '[]'::jsonb), coalesce(p_estimate, false), p_notes)
  on conflict (user_id, month) do update set income = excluded.income, split = excluded.split, is_estimate = excluded.is_estimate,
    notes = coalesce(excluded.notes, public.months.notes);
  return jsonb_build_object('month', date_trunc('month', p_month)::date);
end $$;

-- p_patch may contain name, target (number or null), target_date (yyyy-mm-dd or null), fill_order.
create or replace function public.mcp_update_bucket(p_token text, p_bucket uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := private.mcp_user(p_token); r public.buckets;
begin
  update public.buckets set
    name = coalesce(p_patch->>'name', name),
    target = case when p_patch ? 'target' then (p_patch->>'target')::numeric else target end,
    target_date = case when p_patch ? 'target_date' then (p_patch->>'target_date')::date else target_date end,
    fill_order = coalesce((p_patch->>'fill_order')::int, fill_order)
  where id = p_bucket and user_id = uid returning * into r;
  if r.id is null then raise exception 'Unknown goal'; end if;
  return to_jsonb(r) - 'user_id';
end $$;

revoke all on function public.mcp_overview(text) from public;
revoke all on function public.mcp_set_balances(text, jsonb) from public;
revoke all on function public.mcp_upsert_month(text, date, numeric, jsonb, boolean, text) from public;
revoke all on function public.mcp_update_bucket(text, uuid, jsonb) from public;
grant execute on function public.mcp_overview(text) to anon;
grant execute on function public.mcp_set_balances(text, jsonb) to anon;
grant execute on function public.mcp_upsert_month(text, date, numeric, jsonb, boolean, text) to anon;
grant execute on function public.mcp_update_bucket(text, uuid, jsonb) to anon;
-- These are called only by the /api/mcp route with the publishable key. Each one rejects
-- requests without a valid token, so exposing them to anon is intentional.
