"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { GOAL_PRESETS } from "@/lib/templates";

export async function createGoal(form: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const preset = String(form.get("preset") || "custom");
  const kind = String(form.get("kind") || "savings") === "investment" ? "investment" : "savings";
  const p = GOAL_PRESETS.find((x) => x.key === preset);
  const name = String(form.get("name") || "").trim() || p?.name || "New goal";
  const t = parseFloat(String(form.get("target") ?? ""));
  const date = String(form.get("target_date") || "");

  const { data: existing } = await supabase.from("buckets").select("fill_order,account_id,kind").eq("archived", false);
  const sameKind = (existing ?? []).filter((b) => b.kind === kind);
  const fill_order = kind === "investment" ? 50 + sameKind.length : Math.max(0, ...sameKind.map((b) => b.fill_order)) + 1;
  const account_id = sameKind.find((b) => b.account_id)?.account_id ?? null;

  const { data, error } = await supabase.from("buckets").insert({
    user_id: auth.user.id, name, kind, preset, fill_order, account_id,
    color: kind === "investment" ? "violet" : p?.color ?? "coral",
    target: Number.isFinite(t) && t > 0 ? t : null,
    target_date: date ? date + "-01" : null,
    expected_return: kind === "investment" ? 7 : null,
  }).select("id").single();
  if (error) redirect(`/goals/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect(`/goals/${data!.id}`);
}
