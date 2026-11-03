"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createConnectorLink(name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_mcp_token", { p_name: name || "Claude" });
  if (error) return { error: error.message };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  revalidatePath("/setup");
  return { url: `${proto}://${host}/api/mcp/${data}` };
}

export async function revokeConnector(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mcp_tokens").delete().eq("id", id);
  revalidatePath("/setup");
  return error ? { error: error.message } : { ok: true };
}
