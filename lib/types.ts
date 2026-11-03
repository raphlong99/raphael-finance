export type Profile = {
  id: string;
  display_name: string | null;
  birth_month: string | null;
  currency: string;
  income_estimate: number;
  income_growth: number;
  seasonal: Record<string, number>;
  cost_growth: number;
  cash_rate: number;
  earner_type: EarnerType | null;
  template: string | null;
  onboarded: boolean;
};

export type EarnerType = "salaried" | "freelancer" | "business" | "mixed";

export type Account = {
  id: string;
  name: string;
  institution: string | null;
  kind: "cash" | "brokerage" | "ilp" | "cpf" | "other";
  currency: string;
  sort: number;
  archived: boolean;
  notes: string | null;
};

export type Bucket = {
  id: string;
  name: string;
  kind: "savings" | "investment";
  target: number | null;
  fill_order: number;
  color: string;
  expected_return: number | null;
  account_id: string | null;
  archived: boolean;
  notes: string | null;
  target_date: string | null;
  preset: string | null;
};

export type ExpenseItem = {
  id: string;
  name: string;
  monthly: number;
  in_force: boolean;
  category: string | null;
  sort: number;
};

export type RuleKind = "percent" | "fixed" | "percent_min" | "expenses" | "remainder";
export type Category = "tax" | "needs" | "invest" | "fun" | "save" | "other";

export type SplitRule = {
  id: string;
  name: string;
  kind: RuleKind;
  value: number | null;
  min_amount: number | null;
  round_mode: "up" | "down" | "none";
  round_to: number;
  bucket_id: string | null;
  category: Category;
  color: string | null;
  sort: number;
};

export type Balance = {
  id: string;
  account_id: string;
  as_of: string;
  value: number;
  source: string;
  note: string | null;
};

export type MonthRow = {
  id: string;
  month: string;
  income: number;
  split: SplitLine[];
  is_estimate: boolean;
  notes: string | null;
};

export type Policy = {
  id: string;
  insurer: string;
  name: string;
  kind: "life" | "ci" | "hospital" | "pa" | "ilp" | "disability" | "other";
  premium: number;
  frequency: "monthly" | "quarterly" | "annual";
  paid_via: string | null;
  next_due: string | null;
  cover: { type: string; amount: number | null; until?: string; note?: string }[];
  in_force: boolean;
  notes: string | null;
  sort: number;
};

export type SplitLine = {
  rule_id: string | null;
  name: string;
  category: Category | "unallocated";
  amount: number;
  bucket_id: string | null;
  color?: string | null;
};

export const COLORS = ["teal", "amber", "green", "blue", "rose", "violet", "coral", "slate"] as const;
export const CATEGORY_COLOR: Record<string, string> = {
  tax: "slate",
  needs: "slate2",
  invest: "blue",
  fun: "coral",
  save: "teal",
  other: "violet",
  unallocated: "line",
};

/** Numeric columns arrive from PostgREST as strings or numbers; normalise them. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
