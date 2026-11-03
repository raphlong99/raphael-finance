"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/data";

export async function updateBalance(accountId: string, value: number) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Signed out. Sign in again." };
  if (!Number.isFinite(value)) return { error: "Enter a number." };
  const { error } = await supabase.from("balances").upsert(
    { user_id: auth.user.id, account_id: accountId, as_of: todayISO(), value, source: "manual" },
    { onConflict: "account_id,as_of" }
  );
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
