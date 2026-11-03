import type { Balance, Bucket, ExpenseItem, Profile, SplitLine, SplitRule } from "./types";

function round(x: number, mode: SplitRule["round_mode"], to: number) {
  const step = to > 0 ? to : 1;
  if (mode === "up") return Math.ceil(x / step - 1e-9) * step;
  if (mode === "down") return Math.floor(x / step + 1e-9) * step;
  return Math.round(x * 100) / 100;
}

export function expensesTotal(items: ExpenseItem[]) {
  return items.filter((e) => e.in_force).reduce((a, e) => a + e.monthly, 0);
}

/** Split one month's income by the user's rules, in sort order. The remainder rule always runs last. */
export function applyRules(income: number, rules: SplitRule[], expenses: number): SplitLine[] {
  const ordered = [...rules].sort((a, b) => (a.kind === "remainder" ? 1 : 0) - (b.kind === "remainder" ? 1 : 0) || a.sort - b.sort);
  const lines: SplitLine[] = [];
  let used = 0;
  for (const r of ordered) {
    let raw = 0;
    const v = r.value ?? 0;
    if (r.kind === "percent") raw = (income * v) / 100;
    else if (r.kind === "fixed") raw = v;
    else if (r.kind === "percent_min") raw = Math.max(r.min_amount ?? 0, (income * v) / 100);
    else if (r.kind === "expenses") raw = expenses;
    else if (r.kind === "remainder") raw = income - used;
    const amount = r.kind === "remainder" && raw < 0 ? raw : round(raw, r.round_mode, r.round_to);
    lines.push({ rule_id: r.id, name: r.name, category: r.category, amount, bucket_id: r.bucket_id, color: r.color });
    used += amount;
  }
  const left = Math.round((income - used) * 100) / 100;
  if (Math.abs(left) >= 0.01) lines.push({ rule_id: null, name: "Unallocated", category: "unallocated", amount: left, bucket_id: null });
  return lines;
}

/** Latest balance per account on or before a date (ISO yyyy-mm-dd). */
export function latestBalances(balances: Balance[], onOrBefore?: string) {
  const out = new Map<string, Balance>();
  for (const b of balances) {
    if (onOrBefore && b.as_of > onOrBefore) continue;
    const cur = out.get(b.account_id);
    if (!cur || b.as_of > cur.as_of) out.set(b.account_id, b);
  }
  return out;
}

/** Spread each account's balance over the buckets linked to it, filling by order and target. */
export function bucketStart(buckets: Bucket[], balances: Map<string, Balance>) {
  const start: Record<string, number> = {};
  buckets.forEach((b) => (start[b.id] = 0));
  const byAccount = new Map<string, Bucket[]>();
  for (const b of buckets) {
    if (!b.account_id) continue;
    byAccount.set(b.account_id, [...(byAccount.get(b.account_id) ?? []), b]);
  }
  for (const [acc, list] of byAccount) {
    let left = balances.get(acc)?.value ?? 0;
    const sorted = [...list].sort((a, b) => a.fill_order - b.fill_order);
    sorted.forEach((b, i) => {
      const last = i === sorted.length - 1;
      const take = last || b.target === null ? left : Math.min(left, b.target);
      start[b.id] = take;
      left -= take;
    });
  }
  return start;
}

export type SimMonth = {
  m: number;
  income: number;
  lines: SplitLine[];
  values: Record<string, number>;
  savings: number;
  invested: number;
  cpf: number;
  net: number;
};

export type SimInput = {
  profile: Profile;
  buckets: Bucket[];
  rules: SplitRule[];
  expenses: ExpenseItem[];
  start: Record<string, number>;
  startMonth: { y: number; m: number }; // m is 0-11
  months: number;
};

export function simulate({ profile, buckets, rules, expenses, start, startMonth, months }: SimInput): SimMonth[] {
  const savings = buckets.filter((b) => b.kind === "savings").sort((a, b) => a.fill_order - b.fill_order);
  const byId = new Map(buckets.map((b) => [b.id, b]));
  const v: Record<string, number> = { ...start };
  const baseExp = expensesTotal(expenses);
  const rc = Math.pow(1 + profile.cash_rate / 100, 1 / 12) - 1;
  const rates: Record<string, number> = {};
  for (const b of buckets) rates[b.id] = b.kind !== "savings" ? Math.pow(1 + (b.expected_return ?? 0) / 100, 1 / 12) - 1 : rc;
  const out: SimMonth[] = [];

  const pour = (amount: number) => {
    let s = amount;
    for (let i = 0; i < savings.length && s > 0; i++) {
      const b = savings[i];
      const last = i === savings.length - 1;
      const room = b.target === null || last ? Infinity : Math.max(0, b.target - v[b.id]);
      const put = Math.min(s, room);
      v[b.id] += put;
      s -= put;
    }
  };
  const drain = (amount: number) => {
    let d = amount;
    for (let i = savings.length - 1; i >= 0 && d > 0; i--) {
      const b = savings[i];
      const take = i === 0 ? d : Math.min(d, Math.max(0, v[b.id]));
      v[b.id] -= take;
      d -= take;
    }
  };

  for (let m = 0; m < months; m++) {
    const year = Math.floor(m / 12);
    const cal = (startMonth.m + m) % 12;
    const seasonal = profile.seasonal?.[String(cal + 1)] ?? 0;
    const income = profile.income_estimate * Math.pow(1 + profile.income_growth / 100, year) * (1 + seasonal / 100);
    const exp = baseExp * Math.pow(1 + profile.cost_growth / 100, year);
    const lines = applyRules(income, rules, exp);

    for (const b of buckets) v[b.id] = (v[b.id] ?? 0) * (1 + rates[b.id]);
    for (const l of lines) {
      if (l.bucket_id && byId.has(l.bucket_id)) {
        if (l.amount >= 0) v[l.bucket_id] += l.amount;
        else drain(-l.amount);
      } else if (l.category === "save" || l.category === "unallocated") {
        if (l.category === "unallocated") continue;
        if (l.amount >= 0) pour(l.amount);
        else drain(-l.amount);
      }
    }
    // Overflow past a target moves to the next savings bucket.
    for (let i = 0; i < savings.length - 1; i++) {
      const b = savings[i];
      if (b.target !== null && v[b.id] > b.target) {
        v[savings[i + 1].id] += v[b.id] - b.target;
        v[b.id] = b.target;
      }
    }
    const sav = savings.reduce((a, b) => a + v[b.id], 0);
    const inv = buckets.filter((b) => b.kind === "investment").reduce((a, b) => a + v[b.id], 0);
    const cpf = buckets.filter((b) => b.kind === "cpf").reduce((a, b) => a + v[b.id], 0);
    out.push({ m, income, lines, values: { ...v }, savings: sav, invested: inv, cpf, net: sav + inv + cpf });
  }
  return out;
}
