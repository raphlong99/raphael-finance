import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyRules, bucketStart, expensesTotal, simulate } from "@/lib/plan";
import { money, monthLabel, monthsUntil } from "@/lib/format";
import { num, numOrNull, type Balance, type Bucket, type ExpenseItem, type Profile, type SplitRule } from "@/lib/types";

type Overview = {
  profile: Profile;
  accounts: { id: string; name: string; institution: string | null; kind: string; value: number | null; as_of: string | null }[];
  buckets: Bucket[];
  rules: SplitRule[];
  expenses: ExpenseItem[];
  months: { month: string; income: number; is_estimate: boolean; split: unknown[] }[];
  policies: { name: string; insurer: string; premium: number; medisave_amount: number; frequency: string; next_due: string | null; in_force: boolean }[];
};

export class ToolError extends Error {}

function db(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new ToolError(error.message.includes("Invalid connector link") ? "This connector link is no longer valid. Make a new one in Settings." : error.message);
  return data as T;
}

export async function verifyToken(token: string) {
  await rpc("mcp_overview", { p_token: token });
}

async function overview(token: string): Promise<Overview> {
  const raw = await rpc<any>("mcp_overview", { p_token: token });
  const p = raw.profile ?? {};
  return {
    profile: { ...p, id: "", income_estimate: num(p.income_estimate), income_growth: num(p.income_growth), cost_growth: num(p.cost_growth), cash_rate: num(p.cash_rate), seasonal: p.seasonal ?? {} },
    accounts: (raw.accounts ?? []).map((a: any) => ({ ...a, value: numOrNull(a.value) })),
    buckets: (raw.buckets ?? []).map((b: any) => ({ ...b, target: numOrNull(b.target), expected_return: numOrNull(b.expected_return) })),
    rules: (raw.rules ?? []).map((r: any) => ({ ...r, value: numOrNull(r.value), min_amount: numOrNull(r.min_amount), round_to: num(r.round_to) || 1 })),
    expenses: (raw.expenses ?? []).map((e: any) => ({ ...e, monthly: num(e.monthly) })),
    months: (raw.months ?? []).map((m: any) => ({ ...m, income: num(m.income) })),
    policies: (raw.policies ?? []).map((x: any) => ({ ...x, premium: num(x.premium), medisave_amount: num(x.medisave_amount) })),
  };
}

const sgToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function findOne<T extends { id: string; name: string }>(list: T[], q: string, what: string, extra?: (x: T) => string): T {
  const s = q.trim().toLowerCase();
  const exact = list.filter((x) => x.id === q || x.name.toLowerCase() === s);
  if (exact.length === 1) return exact[0];
  const words = s.split(/\s+/).filter(Boolean);
  const hits = list.filter((x) => {
    const hay = (x.name + " " + (extra?.(x) ?? "")).toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  if (hits.length === 1) return hits[0];
  const names = list.map((x) => x.name).join(", ");
  throw new ToolError(hits.length ? `"${q}" matches more than one ${what}: ${hits.map((h) => h.name).join(", ")}. Use the exact name.` : `No ${what} called "${q}". Choose one of: ${names}.`);
}

function project(o: Overview) {
  const today = sgToday();
  const [y, m] = today.split("-").map(Number);
  const startMonth = { y, m: m - 1 };
  const balances = new Map<string, Balance>(o.accounts.filter((a) => a.value !== null).map((a) => [a.id, { id: a.id, account_id: a.id, as_of: a.as_of!, value: a.value!, source: "", note: null }]));
  const start = bucketStart(o.buckets, balances);
  const run = simulate({ profile: o.profile, buckets: o.buckets, rules: o.rules, expenses: o.expenses, start, startMonth, months: 480 });
  return { startMonth, start, sim: [{ values: start }, ...run], today };
}

export const TOOLS = [
  {
    name: "get_overview",
    title: "Get money overview",
    description: "Read the user's current money picture from their Buckets app: every account's latest balance and when it was last updated, savings goals with progress and projected finish dates, investments, CPF, net worth, this month's income split, and insurance premiums due soon. Call this first when the user asks about their money, goals or balances, and before updating anything so you use the exact account and goal names.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "update_balances",
    title: "Update account balances",
    description: "Record new balances for one or more accounts, such as \"UOB is 5,200 now\" or \"Tiger is worth S$1,450 and CPF OA is 18k\". Each account is matched by name (partial names work if unambiguous). Values are in the user's currency (SGD). The balance is dated today unless as_of is given. Goals linked to the account fill from the new balance.",
    inputSchema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              account: { type: "string", description: "Account name, e.g. \"UOB savings\", \"Tiger\", \"CPF Ordinary\"" },
              value: { type: "number", description: "New balance in SGD" },
              as_of: { type: "string", description: "Date of the balance, YYYY-MM-DD. Defaults to today in Singapore." },
              note: { type: "string", description: "Optional note" },
            },
            required: ["account", "value"],
            additionalProperties: false,
          },
        },
      },
      required: ["updates"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "log_month",
    title: "Log a month's income",
    description: "Save how much income came in for a month. The app splits it with the user's own rules (tax, needs, investing, fun, savings) and stores that split with the month. Logging the same month again replaces it. Returns the split.",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "Month in YYYY-MM form, e.g. 2026-11" },
        income: { type: "number", description: "Total income for the month in SGD" },
        estimate: { type: "boolean", description: "True if the figure is a guess rather than the final number" },
        notes: { type: "string" },
      },
      required: ["month", "income"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "preview_split",
    title: "Preview an income split",
    description: "Show how a given monthly income would be split by the user's rules, without saving anything. Useful for \"what if I earn 7k this month?\"",
    inputSchema: { type: "object", properties: { income: { type: "number", description: "Monthly income in SGD" } }, required: ["income"], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "update_goal",
    title: "Update a goal",
    description: "Change a savings goal's target amount, target date, name or position in the fill queue. Set target to null to remove a target, or target_date to null to remove the date.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Goal name, e.g. \"Emergency fund\"" },
        target: { type: ["number", "null"], description: "Target amount in SGD" },
        target_date: { type: ["string", "null"], description: "Target month, YYYY-MM" },
        name: { type: "string", description: "New name" },
        position: { type: "integer", minimum: 1, description: "Position in the savings queue; 1 fills first" },
      },
      required: ["goal"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as const;

function daysAgo(iso: string | null, today: string) {
  if (!iso) return null;
  return Math.round((new Date(today).getTime() - new Date(iso).getTime()) / 86400000);
}

export async function callTool(token: string, name: string, args: any): Promise<{ text: string; data: unknown }> {
  if (name === "get_overview") {
    const o = await overview(token);
    const { sim, start, startMonth, today } = project(o);
    const cur = o.profile.currency || "SGD";
    const f = (v: number) => money(v, cur);
    const goals = o.buckets.filter((b) => b.kind === "savings").sort((a, b) => a.fill_order - b.fill_order).map((b, i) => {
      const saved = start[b.id] ?? 0;
      const eta = b.target ? sim.findIndex((s) => (s.values[b.id] ?? 0) >= b.target! - 0.5) : -1;
      const due = b.target_date ? monthsUntil(startMonth, b.target_date) : null;
      return {
        position: i + 1, name: b.name, saved, target: b.target, target_date: b.target_date?.slice(0, 7) ?? null,
        percent: b.target ? Math.round((saved / b.target) * 100) : null,
        projected_full: b.target ? (eta === 0 ? "already reached" : eta > 0 ? monthLabel(startMonth, eta) : "not within 40 years") : null,
        on_track: b.target && due !== null && eta >= 0 ? eta <= due : null,
      };
    });
    const pots = (kind: string) => o.buckets.filter((b) => b.kind === kind).map((b) => ({ name: b.name, value: start[b.id] ?? 0, yearly_return_pct: b.expected_return }));
    const accounts = o.accounts.map((a) => ({ name: a.name, kind: a.kind, balance: a.value, last_updated: a.as_of, days_since_update: daysAgo(a.as_of, today) }));
    const thisMonth = o.months.find((m) => m.month.startsWith(today.slice(0, 7)) && !m.is_estimate);
    const split = thisMonth ? { income: thisMonth.income, logged: true, lines: thisMonth.split } : { income: o.profile.income_estimate, logged: false, lines: applyRules(o.profile.income_estimate, o.rules, expensesTotal(o.expenses)) };
    const soon = o.policies.filter((p) => p.in_force && p.next_due && daysAgo(p.next_due, today)! >= -45 && daysAgo(p.next_due, today)! <= 0)
      .map((p) => ({ name: p.name, due: p.next_due, premium: p.premium, from_medisave: p.medisave_amount, cash: Math.round((p.premium - p.medisave_amount) * 100) / 100 }));
    const net = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
    const data = { today, currency: cur, net_worth: net, accounts, goals, investments: pots("investment"), cpf: pots("cpf"), this_month: { ...split, lines: (split.lines as any[]).map((l) => ({ name: l.name, amount: l.amount })) }, premiums_due_soon: soon };

    const lines = [
      `Net worth ${f(net)} (as of ${today}).`,
      "Accounts: " + accounts.map((a) => `${a.name} ${a.balance === null ? "no balance yet" : f(a.balance)}${a.days_since_update !== null && a.days_since_update > 30 ? ` (updated ${a.days_since_update} days ago)` : ""}`).join("; ") + ".",
      "Goals: " + goals.map((g) => `${g.position}. ${g.name} ${f(g.saved)}${g.target ? ` of ${f(g.target)} (${g.percent}%), full ${g.projected_full}${g.on_track === false ? ", behind its target date" : g.on_track ? ", on track" : ""}` : ""}`).join("; ") + ".",
      `This month (${split.logged ? "logged" : "expected"}): income ${f(split.income)} → ` + (split.lines as any[]).filter((l) => l.amount).map((l) => `${l.name} ${f(l.amount)}`).join(", ") + ".",
      soon.length ? "Premiums due soon: " + soon.map((p) => `${p.name} ${p.due} (${f(p.cash)} cash${p.from_medisave ? ` + ${f(p.from_medisave)} MediSave` : ""})`).join("; ") + "." : "",
    ].filter(Boolean);
    return { text: lines.join("\n"), data };
  }

  if (name === "update_balances") {
    const o = await overview(token);
    const updates: { account: string; value: number; as_of?: string; note?: string }[] = args?.updates ?? [];
    if (!updates.length) throw new ToolError("Give at least one account and value.");
    const resolved = updates.map((u) => {
      if (typeof u.value !== "number" || !Number.isFinite(u.value)) throw new ToolError(`Value for "${u.account}" must be a number.`);
      if (u.as_of && !/^\d{4}-\d{2}-\d{2}$/.test(u.as_of)) throw new ToolError(`as_of must be YYYY-MM-DD.`);
      const a = findOne(o.accounts, u.account, "account", (x) => `${x.institution ?? ""} ${x.kind}`);
      return { a, u };
    });
    await rpc("mcp_set_balances", { p_token: token, p_items: resolved.map(({ a, u }) => ({ account_id: a.id, value: u.value, as_of: u.as_of ?? null, note: u.note ?? null })) });
    const cur = o.profile.currency || "SGD";
    const changes = resolved.map(({ a, u }) => ({ account: a.name, before: a.value, after: u.value, change: a.value === null ? null : Math.round((u.value - a.value) * 100) / 100 }));
    return {
      text: "Updated: " + changes.map((c) => `${c.account} ${c.before === null ? "" : `${money(c.before, cur)} → `}${money(c.after, cur)}${c.change ? ` (${c.change > 0 ? "+" : ""}${money(c.change, cur)})` : ""}`).join("; ") + ".",
      data: { updated: changes },
    };
  }

  if (name === "log_month" || name === "preview_split") {
    const o = await overview(token);
    const income = Number(args?.income);
    if (!Number.isFinite(income) || income < 0) throw new ToolError("income must be a positive number.");
    const split = applyRules(income, o.rules, expensesTotal(o.expenses));
    const cur = o.profile.currency || "SGD";
    const text = split.map((l) => `${l.name} ${money(l.amount, cur)}`).join(", ");
    if (name === "preview_split") return { text: `On ${money(income, cur)}: ${text}.`, data: { income, split } };
    const month = String(args?.month ?? "");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ToolError("month must be YYYY-MM.");
    await rpc("mcp_upsert_month", { p_token: token, p_month: month + "-01", p_income: income, p_split: split, p_estimate: !!args?.estimate, p_notes: args?.notes ?? null });
    return { text: `Logged ${month}: ${money(income, cur)} → ${text}.`, data: { month, income, split } };
  }

  if (name === "update_goal") {
    const o = await overview(token);
    const goals = o.buckets.filter((b) => b.kind === "savings").sort((a, b) => a.fill_order - b.fill_order);
    const g = findOne(goals, String(args?.goal ?? ""), "goal");
    const patch: Record<string, unknown> = {};
    if ("target" in (args ?? {})) patch.target = args.target === null ? null : Number(args.target);
    if ("target_date" in (args ?? {})) {
      if (args.target_date !== null && !/^\d{4}-\d{2}$/.test(args.target_date)) throw new ToolError("target_date must be YYYY-MM.");
      patch.target_date = args.target_date === null ? null : args.target_date + "-01";
    }
    if (args?.name) patch.name = String(args.name);
    if (args?.position) {
      // Re-number the queue so the goal lands at the requested position.
      const order = goals.filter((x) => x.id !== g.id);
      order.splice(Math.min(Math.max(1, args.position), order.length + 1) - 1, 0, g);
      for (let i = 0; i < order.length; i++) {
        if (order[i].fill_order !== i + 1 && order[i].id !== g.id) await rpc("mcp_update_bucket", { p_token: token, p_bucket: order[i].id, p_patch: { fill_order: i + 1 } });
      }
      patch.fill_order = order.findIndex((x) => x.id === g.id) + 1;
    }
    if (!Object.keys(patch).length) throw new ToolError("Nothing to change. Give target, target_date, name or position.");
    const r = await rpc<any>("mcp_update_bucket", { p_token: token, p_bucket: g.id, p_patch: patch });
    const cur = o.profile.currency || "SGD";
    return { text: `Updated ${r.name}: target ${r.target ? money(num(r.target), cur) : "none"}, date ${r.target_date ? r.target_date.slice(0, 7) : "none"}, position ${r.fill_order}.`, data: r };
  }

  throw new ToolError(`Unknown tool ${name}`);
}
