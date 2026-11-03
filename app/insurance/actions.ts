"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/data";

/**
 * Save what a policy would pay if cancelled today. For a whole life policy this is its cash value,
 * so it is also written as the balance of the policy's own account (created on first save) and counts in net worth.
 * For an ILP, the linked account holds the fund value instead, so only the policy is updated.
 */
export async function savePolicyValue(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const id = String(formData.get("_id") ?? "");
  const raw = String(formData.get("surrender_value") ?? "").trim();
  const asOf = String(formData.get("surrender_as_of") ?? "") || todayISO();
  const value = raw === "" ? null : Number(raw);
  if (value !== null && !Number.isFinite(value)) redirect("/insurance?error=" + encodeURIComponent("Enter a number"));

  const { data: p, error: e1 } = await supabase.from("policies").select("id,name,insurer,kind,account_id").eq("id", id).single();
  if (e1 || !p) redirect("/insurance?error=" + encodeURIComponent(e1?.message ?? "Policy not found"));

  let accountId: string | null = p.account_id;
  if (value !== null && p.kind !== "ilp" && !accountId) {
    const { data: acc, error } = await supabase.from("accounts")
      .insert({ user_id: auth.user.id, name: p.name, institution: p.insurer, kind: "policy", currency: "SGD", sort: 90, notes: "Cash value if cancelled" })
      .select("id").single();
    if (error) redirect("/insurance?error=" + encodeURIComponent(error.message));
    accountId = acc.id;
  }

  const { error: e2 } = await supabase.from("policies")
    .update({ surrender_value: value, surrender_as_of: value === null ? null : asOf, account_id: accountId }).eq("id", id);
  if (e2) redirect("/insurance?error=" + encodeURIComponent(e2.message));

  if (value !== null && accountId && p.kind !== "ilp") {
    const { data: acc } = await supabase.from("accounts").select("kind").eq("id", accountId).single();
    if (acc?.kind === "policy") {
      await supabase.from("balances").upsert({ user_id: auth.user.id, account_id: accountId, as_of: asOf, value, source: "manual" }, { onConflict: "account_id,as_of" });
    }
  }
  revalidatePath("/", "layout");
  redirect("/insurance?saved=1");
}
