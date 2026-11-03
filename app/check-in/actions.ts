"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadUserData, todayISO } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { applyRules, expensesTotal } from "@/lib/plan";

export async function saveCheckIn(form: FormData) {
  const d = await loadUserData();
  if (!d) redirect("/login");
  const supabase = await createClient();

  const month = String(form.get("month") || todayISO().slice(0, 7)) + "-01";
  const incomeRaw = String(form.get("income") ?? "").trim();
  if (incomeRaw !== "") {
    const income = parseFloat(incomeRaw);
    if (Number.isFinite(income)) {
      const split = applyRules(income, d.rules, expensesTotal(d.expenses));
      const { error } = await supabase.from("months").upsert(
        { user_id: d.profile.id, month, income, split, is_estimate: form.get("estimate") === "on", notes: String(form.get("notes") || "") || null },
        { onConflict: "user_id,month" }
      );
      if (error) throw new Error(error.message);
    }
  }

  const asOf = String(form.get("as_of") || todayISO());
  const rows = d.accounts
    .filter((a) => !a.archived)
    .map((a) => ({ a, raw: String(form.get(`bal_${a.id}`) ?? "").trim() }))
    .filter((x) => x.raw !== "" && Number.isFinite(parseFloat(x.raw)))
    .map((x) => ({ user_id: d.profile.id, account_id: x.a.id, as_of: asOf, value: parseFloat(x.raw), source: "manual" }));
  if (rows.length) {
    const { error } = await supabase.from("balances").upsert(rows, { onConflict: "account_id,as_of" });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/");
  redirect("/check-in?saved=1");
}
