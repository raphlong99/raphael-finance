"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/data";
import { GOAL_PRESETS, TEMPLATES, type RuleDraft } from "@/lib/templates";
import type { EarnerType } from "@/lib/types";

export type OnboardingPayload = {
  mode: "full" | "split";
  name: string;
  earner: EarnerType;
  income: number;
  essentials: number;
  dip: number; // % lower income in Nov–Dec, 0 for none
  template: string;
  goals: { preset: string; name: string; target: number | null; target_date: string | null }[];
  savings: number;
  investments: number;
  birth_month: string | null; // yyyy-mm
};

function ruleRow(user_id: string, r: RuleDraft, i: number, investId: string | null) {
  return {
    user_id,
    name: r.name,
    kind: r.kind,
    value: r.value ?? null,
    min_amount: r.min_amount ?? null,
    round_mode: r.round_mode ?? "none",
    round_to: r.round_to ?? 1,
    category: r.category,
    color: r.color ?? null,
    bucket_id: r.to === "invest" ? investId : null,
    sort: r.kind === "remainder" ? 99 : (i + 1) * 10,
  };
}

export async function finishOnboarding(p: OnboardingPayload) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const uid = auth.user.id;
  const tpl = TEMPLATES.find((t) => t.key === p.template) ?? TEMPLATES[0];
  const fail = (m: string) => redirect(`/welcome?error=${encodeURIComponent(m)}`);

  if (p.mode === "split") {
    const { data: inv } = await supabase.from("buckets").select("id").eq("kind", "investment").eq("archived", false).order("fill_order").limit(1);
    let investId = inv?.[0]?.id ?? null;
    if (!investId && tpl.rules.some((r) => r.to === "invest")) {
      const { data } = await supabase.from("buckets").insert({ user_id: uid, name: "Investments", kind: "investment", color: "blue", expected_return: 7, fill_order: 50 }).select("id").single();
      investId = data?.id ?? null;
    }
    await supabase.from("split_rules").delete().eq("user_id", uid);
    const { error } = await supabase.from("split_rules").insert(tpl.rules.map((r, i) => ruleRow(uid, r, i, investId)));
    if (error) fail(error.message);
    await supabase.from("profiles").update({ template: tpl.key }).eq("id", uid);
    revalidatePath("/", "layout");
    redirect("/");
  }

  const seasonal = p.dip > 0 ? { "11": -p.dip, "12": -p.dip } : {};
  const prof = await supabase.from("profiles").update({
    display_name: p.name || null,
    earner_type: p.earner,
    template: tpl.key,
    income_estimate: p.income,
    income_growth: p.earner === "salaried" ? 3 : 5,
    seasonal,
    birth_month: p.birth_month ? p.birth_month + "-01" : null,
    onboarded: true,
    updated_at: new Date().toISOString(),
  }).eq("id", uid);
  if (prof.error) fail(prof.error.message);

  // Start clean so running setup twice doesn't double everything.
  await supabase.from("split_rules").delete().eq("user_id", uid);
  await supabase.from("buckets").delete().eq("user_id", uid);
  await supabase.from("expense_items").delete().eq("user_id", uid);

  await supabase.from("expense_items").insert({ user_id: uid, name: "Essentials", monthly: p.essentials, in_force: true, sort: 1 });

  const today = todayISO();
  const { data: accs } = await supabase.from("accounts").select("id,name");
  const findOrMake = async (name: string, kind: string, sort: number) => {
    const hit = accs?.find((a) => a.name === name);
    if (hit) return hit.id as string;
    const { data } = await supabase.from("accounts").insert({ user_id: uid, name, kind, sort }).select("id").single();
    return data!.id as string;
  };
  const savingsAcc = await findOrMake("Savings", "cash", 1);
  const needsInvest = tpl.rules.some((r) => r.to === "invest") || p.investments > 0;
  const investAcc = needsInvest ? await findOrMake("Investments", "brokerage", 2) : null;

  const goalRows = p.goals.map((g, i) => ({
    user_id: uid,
    name: g.name,
    kind: "savings",
    target: g.target,
    target_date: g.target_date,
    preset: g.preset,
    color: GOAL_PRESETS.find((x) => x.key === g.preset)?.color ?? "teal",
    fill_order: i + 1,
    account_id: savingsAcc,
  }));
  if (!goalRows.length) goalRows.push({ user_id: uid, name: "Savings", kind: "savings", target: null, target_date: null, preset: "custom", color: "teal", fill_order: 1, account_id: savingsAcc });
  const g = await supabase.from("buckets").insert(goalRows);
  if (g.error) fail(g.error.message);

  let investId: string | null = null;
  if (needsInvest) {
    const { data, error } = await supabase.from("buckets").insert({ user_id: uid, name: "Investments", kind: "investment", color: "blue", expected_return: 7, fill_order: 50, account_id: investAcc }).select("id").single();
    if (error) fail(error.message);
    investId = data?.id ?? null;
  }

  const r = await supabase.from("split_rules").insert(tpl.rules.map((x, i) => ruleRow(uid, x, i, investId)));
  if (r.error) fail(r.error.message);

  const bal = [{ account_id: savingsAcc, value: p.savings }, ...(investAcc ? [{ account_id: investAcc, value: p.investments }] : [])]
    .map((b) => ({ ...b, user_id: uid, as_of: today, source: "manual" }));
  await supabase.from("balances").upsert(bal, { onConflict: "account_id,as_of" });

  revalidatePath("/", "layout");
  redirect("/");
}
