import Nav from "@/components/Nav";
import { loadUserData, todayISO } from "@/lib/data";
import { applyRules, expensesTotal, latestBalances } from "@/lib/plan";
import { redirect } from "next/navigation";
import { saveCheckIn } from "./actions";

export const dynamic = "force-dynamic";

export default async function CheckIn({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const d = await loadUserData();
  if (!d) redirect("/login");
  const sp = await searchParams;
  const today = todayISO();
  const latest = latestBalances(d.balances);
  const accounts = d.accounts.filter((a) => !a.archived);
  const fmt = (v: number) => (v < 0 ? "−" : "") + "S$" + Math.round(Math.abs(v)).toLocaleString("en-SG");
  const preview = applyRules(d.profile.income_estimate, d.rules, expensesTotal(d.expenses));
  const recent = [...d.months].reverse().slice(0, 12);

  return (
    <>
      <Nav current="/check-in" />
      <main className="wrap">
        <header>
          <div className="eyebrow">Monthly check-in</div>
          <h1>Log this month</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "62ch" }}>Enter what came in and what each account holds today. The split is worked out from your rules and saved with the month.</p>
        </header>
        {sp.saved && <div className="notice">Saved. Your plan now starts from these numbers.</div>}

        <form action={saveCheckIn} className="panel" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="formgrid">
            <div className="field"><label htmlFor="month">Month</label><input id="month" name="month" type="month" className="input" defaultValue={today.slice(0, 7)} /></div>
            <div className="field"><label htmlFor="income">Income this month (S$)</label><input id="income" name="income" type="number" step="0.01" className="input mono" placeholder={String(d.profile.income_estimate)} /></div>
            <label className="check" style={{ alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" name="estimate" /> This is an estimate</label>
          </div>
          <div>
            <h3>Balances</h3>
            <div className="formgrid" style={{ marginTop: 10 }}>
              <div className="field"><label htmlFor="as_of">As of</label><input id="as_of" name="as_of" type="date" className="input" defaultValue={today} /></div>
              {accounts.map((a) => (
                <div className="field" key={a.id}>
                  <label htmlFor={`bal_${a.id}`}>{a.name}{latest.get(a.id) ? ` · last ${fmt(latest.get(a.id)!.value)}` : ""}</label>
                  <input id={`bal_${a.id}`} name={`bal_${a.id}`} type="number" step="0.01" className="input mono" placeholder="Leave blank to skip" />
                </div>
              ))}
            </div>
            {!accounts.length && <p className="muted small">Add accounts in Setup to log balances.</p>}
          </div>
          <div className="field"><label htmlFor="notes">Notes</label><input id="notes" name="notes" className="input" placeholder="Optional" /></div>
          <div><button className="btn" type="submit">Save check-in</button></div>
        </form>

        <section className="panel">
          <h2>Split at your usual income ({fmt(d.profile.income_estimate)})</h2>
          <div className="splitlist" style={{ marginTop: 12 }}>
            {preview.map((l, i) => <div key={i}><span>{l.name}</span><b>{fmt(l.amount)}</b></div>)}
          </div>
        </section>

        <section className="panel">
          <h2>Past months</h2>
          <div className="tablewrap" style={{ marginTop: 10 }}>
            <table className="t">
              <thead><tr><th>Month</th><th className="num">Income</th>{d.rules.map((r) => <th key={r.id} className="num">{r.name}</th>)}</tr></thead>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.month).toLocaleString("en-SG", { month: "short", year: "numeric" })}{m.is_estimate ? <span className="muted small"> · est.</span> : null}</td>
                    <td className="num">{fmt(m.income)}</td>
                    {d.rules.map((r) => { const l = m.split.find((x) => x.rule_id === r.id); return <td key={r.id} className="num">{l ? fmt(l.amount) : "–"}</td>; })}
                  </tr>
                ))}
                {!recent.length && <tr><td colSpan={2 + d.rules.length} className="muted">No months logged yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
