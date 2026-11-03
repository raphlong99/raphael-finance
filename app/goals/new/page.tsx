import Nav from "@/components/Nav";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadUserData } from "@/lib/data";
import { expensesTotal } from "@/lib/plan";
import { GOAL_PRESETS } from "@/lib/templates";
import { createGoal } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewGoal({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const d = await loadUserData();
  if (!d) redirect("/login");
  const sp = await searchParams;
  const ess = expensesTotal(d.expenses);
  const have = new Set(d.buckets.filter((b) => !b.archived).map((b) => b.preset));

  return (
    <>
      <Nav current="/" />
      <main className="wrap" style={{ maxWidth: 900 }}>
        <header>
          <Link href="/" className="muted small">← Back to plan</Link>
          <h1>Add a goal</h1>
          <p className="muted" style={{ margin: 0 }}>Pick one to start from. New goals join the end of the queue; you can reorder them on each goal's page.</p>
        </header>
        {sp.error && <div className="notice" style={{ color: "var(--bad)" }}>Couldn't add the goal: {sp.error}</div>}
        <div className="cards">
          {GOAL_PRESETS.map((p) => {
            const suggested = p.target ? p.target(ess, d.profile.earner_type) : null;
            return (
              <form key={p.key} action={createGoal} className="card presetcard" style={{ ["--c" as string]: `var(--c-${p.color})` }}>
                <input type="hidden" name="preset" value={p.key} />
                <div className="row" style={{ gap: 8 }}><span className="dot" /><h3>{p.key === "custom" ? "Something else" : p.name}</h3>{have.has(p.key) && p.key !== "custom" && <span className="tag">You have one</span>}</div>
                <span className="muted small">{p.blurb}</span>
                <div className="formgrid">
                  {p.key === "custom" && <div className="field"><label htmlFor={`n-${p.key}`}>Name</label><input id={`n-${p.key}`} name="name" className="input" required /></div>}
                  <div className="field"><label htmlFor={`t-${p.key}`}>Target (S$)</label><input id={`t-${p.key}`} name="target" type="number" className="input mono" defaultValue={suggested ?? ""} placeholder="Optional" /></div>
                  <div className="field"><label htmlFor={`d-${p.key}`}>By when</label><input id={`d-${p.key}`} name="target_date" type="month" className="input" /></div>
                </div>
                <div><button className="btn sm" type="submit">Add {p.key === "custom" ? "goal" : p.name.toLowerCase()}</button></div>
              </form>
            );
          })}
          <form action={createGoal} className="card presetcard" style={{ ["--c" as string]: "var(--c-violet)" }}>
            <input type="hidden" name="preset" value="invest" />
            <input type="hidden" name="kind" value="investment" />
            <div className="row" style={{ gap: 8 }}><span className="dot" /><h3>Another investment</h3></div>
            <span className="muted small">A separate investment pot, such as a retirement account or an insurance-linked plan. It grows at the return you set.</span>
            <div className="field"><label htmlFor="n-inv">Name</label><input id="n-inv" name="name" className="input" placeholder="Retirement" required /></div>
            <div><button className="btn sm" type="submit">Add investment</button></div>
          </form>
        </div>
      </main>
    </>
  );
}
