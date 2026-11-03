"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Kind = "text" | "num" | "numOrNull" | "bool" | "uuidOrNull" | "date" | "int";
const TABLES: Record<string, Record<string, Kind>> = {
  accounts: { name: "text", institution: "text", kind: "text", currency: "text", sort: "int", archived: "bool", notes: "text" },
  buckets: { name: "text", kind: "text", target: "numOrNull", fill_order: "int", color: "text", expected_return: "numOrNull", account_id: "uuidOrNull", archived: "bool", notes: "text", target_date: "date" },
  split_rules: { name: "text", kind: "text", value: "numOrNull", min_amount: "numOrNull", round_mode: "text", round_to: "num", bucket_id: "uuidOrNull", category: "text", sort: "int" },
  expense_items: { name: "text", monthly: "num", in_force: "bool", category: "text", sort: "int" },
  policies: { insurer: "text", name: "text", kind: "text", premium: "num", medisave_amount: "num", frequency: "text", paid_via: "text", next_due: "date", in_force: "bool", notes: "text", sort: "int" },
};

function parse(form: FormData, cols: Record<string, Kind>) {
  const row: Record<string, unknown> = {};
  for (const [k, kind] of Object.entries(cols)) {
    // Checkboxes send nothing when unticked, so forms mark them with a hidden "<name>__cb" field.
    if (kind === "bool") {
      if (form.has(`${k}__cb`)) row[k] = form.has(k);
      continue;
    }
    if (!form.has(k)) continue;
    const raw = form.get(k);
    const s = raw === null ? "" : String(raw).trim();
    if (kind === "num") row[k] = Number.isFinite(parseFloat(s)) ? parseFloat(s) : 0;
    else if (kind === "int") row[k] = Number.isFinite(parseInt(s)) ? parseInt(s) : 0;
    else if (kind === "numOrNull") row[k] = s === "" ? null : Number.isFinite(parseFloat(s)) ? parseFloat(s) : null;
    else if (kind === "date") row[k] = s === "" ? null : /^\d{4}-\d{2}$/.test(s) ? s + "-01" : s;
    else if (kind === "uuidOrNull") row[k] = s === "" ? null : s;
    else row[k] = s === "" ? null : s;
  }
  return row;
}

export async function saveRow(form: FormData) {
  const table = String(form.get("_table"));
  const back = String(form.get("_back") || "/setup");
  const cols = TABLES[table];
  if (!cols) throw new Error("Unknown table");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const id = String(form.get("_id") || "");
  const row = parse(form, cols);
  const res = id
    ? await supabase.from(table).update(row).eq("id", id)
    : await supabase.from(table).insert({ ...row, user_id: auth.user.id });
  if (res.error) redirect(`${back}?error=${encodeURIComponent(res.error.message)}`);
  revalidatePath("/", "layout");
  redirect(back + (back.includes("?") ? "&" : "?") + "saved=1");
}

export async function deleteRow(form: FormData) {
  const table = String(form.get("_table"));
  const back = String(form.get("_back") || "/setup");
  if (!TABLES[table]) throw new Error("Unknown table");
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", String(form.get("_id")));
  const after = String(form.get("_after_delete") || back);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect(after);
}

export async function saveProfile(form: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const n = (k: string) => (Number.isFinite(parseFloat(String(form.get(k)))) ? parseFloat(String(form.get(k))) : 0);
  const seasonal: Record<string, number> = {};
  for (let m = 1; m <= 12; m++) {
    const v = parseFloat(String(form.get(`season_${m}`) ?? ""));
    if (Number.isFinite(v) && v !== 0) seasonal[String(m)] = v;
  }
  const bm = String(form.get("birth_month") || "");
  const { error } = await supabase.from("profiles").update({
    display_name: String(form.get("display_name") || "") || null,
    birth_month: bm ? bm + "-01" : null,
    currency: String(form.get("currency") || "SGD"),
    income_estimate: n("income_estimate"),
    income_growth: n("income_growth"),
    cost_growth: n("cost_growth"),
    cash_rate: n("cash_rate"),
    seasonal,
    updated_at: new Date().toISOString(),
  }).eq("id", auth.user.id);
  if (error) redirect(`/setup?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect("/setup?saved=profile");
}
