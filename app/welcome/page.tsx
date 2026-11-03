import { redirect } from "next/navigation";
import Welcome from "@/components/Welcome";
import { loadUserData } from "@/lib/data";
import { expensesTotal } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ redo?: string; error?: string }> }) {
  const d = await loadUserData();
  if (!d) redirect("/login");
  const sp = await searchParams;
  const mode = d.profile.onboarded ? "split" : "full";
  if (d.profile.onboarded && sp.redo !== "split") redirect("/");

  return (
    <main className="wrap" style={{ maxWidth: 860, paddingTop: 32 }}>
      <header>
        <div className="eyebrow">{mode === "split" ? "Change your split" : "Set up your plan"}</div>
        <h1>{mode === "split" ? "Pick a new way to split income" : "Let's build your plan"}</h1>
        {mode === "full" && <p className="muted" style={{ margin: 0 }}>Five quick steps. About two minutes.</p>}
      </header>
      {sp.error && <div className="notice" style={{ color: "var(--bad)" }}>Couldn't save: {sp.error}</div>}
      <Welcome
        mode={mode}
        initial={{
          name: d.profile.display_name ?? "",
          earner: d.profile.earner_type,
          income: d.profile.income_estimate,
          essentials: expensesTotal(d.expenses),
          template: d.profile.template,
        }}
      />
    </main>
  );
}
