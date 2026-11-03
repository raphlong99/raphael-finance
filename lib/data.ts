import { createClient } from "./supabase/server";
import { num, numOrNull, type Account, type Balance, type Bucket, type ExpenseItem, type MonthRow, type Policy, type Profile, type SplitRule } from "./types";

export type UserData = {
  email: string | null;
  profile: Profile;
  accounts: Account[];
  buckets: Bucket[];
  rules: SplitRule[];
  expenses: ExpenseItem[];
  balances: Balance[];
  months: MonthRow[];
  policies: Policy[];
};

export async function loadUserData(): Promise<UserData | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [p, a, b, r, e, bal, m, pol] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
    supabase.from("accounts").select("*").order("sort"),
    supabase.from("buckets").select("*").order("fill_order"),
    supabase.from("split_rules").select("*").order("sort"),
    supabase.from("expense_items").select("*").order("sort"),
    supabase.from("balances").select("*").order("as_of"),
    supabase.from("months").select("*").order("month"),
    supabase.from("policies").select("*").order("sort"),
  ]);

  const pr = p.data ?? { id: auth.user.id };
  const profile: Profile = {
    id: pr.id,
    display_name: pr.display_name ?? null,
    birth_month: pr.birth_month ?? null,
    currency: pr.currency ?? "SGD",
    income_estimate: num(pr.income_estimate),
    income_growth: num(pr.income_growth),
    seasonal: pr.seasonal ?? {},
    cost_growth: num(pr.cost_growth),
    cash_rate: num(pr.cash_rate),
    earner_type: pr.earner_type ?? null,
    template: pr.template ?? null,
    onboarded: !!pr.onboarded,
  };

  return {
    email: auth.user.email ?? null,
    profile,
    accounts: (a.data ?? []) as Account[],
    buckets: (b.data ?? []).map((x) => ({ ...x, target: numOrNull(x.target), expected_return: numOrNull(x.expected_return) })) as Bucket[],
    rules: (r.data ?? []).map((x) => ({ ...x, value: numOrNull(x.value), min_amount: numOrNull(x.min_amount), round_to: num(x.round_to) || 1 })) as SplitRule[],
    expenses: (e.data ?? []).map((x) => ({ ...x, monthly: num(x.monthly) })) as ExpenseItem[],
    balances: (bal.data ?? []).map((x) => ({ ...x, value: num(x.value) })) as Balance[],
    months: (m.data ?? []).map((x) => ({ ...x, income: num(x.income) })) as MonthRow[],
    policies: (pol.data ?? []).map((x) => ({ ...x, premium: num(x.premium) })) as Policy[],
  };
}

export function todayISO(tz = "Asia/Singapore") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function monthlyPremium(p: Pick<Policy, "premium" | "frequency">) {
  return p.frequency === "monthly" ? p.premium : p.frequency === "quarterly" ? p.premium / 3 : p.premium / 12;
}
