import Nav from "@/components/Nav";
import { loadUserData, perMonth, todayISO } from "@/lib/data";
import { redirect } from "next/navigation";
import { deleteRow, saveRow } from "../setup/actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { life: "Life", ci: "Critical illness", hospital: "Hospital", pa: "Personal accident", ilp: "Investment-linked", disability: "Disability income", other: "Other" };

export default async function Insurance() {
  const d = await loadUserData();
  if (!d) redirect("/login");
  const today = todayISO();
  const fmt = (v: number) => "S$" + v.toLocaleString("en-SG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const big = (v: number) => "S$" + Math.round(v).toLocaleString("en-SG");
  const daysTo = (dt: string) => Math.round((new Date(dt).getTime() - new Date(today).getTime()) / 86400000);
  const live = d.policies.filter((p) => p.in_force);
  const cashMonthly = live.reduce((a, p) => a + perMonth(p.premium - p.medisave_amount, p.frequency), 0);
  const medisaveYearly = live.reduce((a, p) => a + perMonth(p.medisave_amount, p.frequency) * 12, 0);
  const FREQ: Record<string, string> = { monthly: "a month", quarterly: "a quarter", annual: "a year" };

  // Total cover by type across policies in force, counting only cover still running today.
  const totals = new Map<string, number>();
  for (const p of live) for (const c of p.cover) {
    if (!c.amount || (c.until && c.until < today)) continue;
    const key = c.type.replace(/ booster$/i, "");
    totals.set(key, (totals.get(key) ?? 0) + c.amount);
  }
  const upcoming = live.filter((p) => p.next_due).sort((a, b) => a.next_due!.localeCompare(b.next_due!)).slice(0, 4);

  return (
    <>
      <Nav current="/insurance" />
      <main className="wrap">
        <header>
          <div className="eyebrow">Insurance</div>
          <h1>What you're covered for</h1>
        </header>

        <section className="long">
          <div className="panel">
            <span className="eyebrow">Paid in cash</span>
            <div className="big">{fmt(Math.round(cashMonthly * 100) / 100)}<span className="muted small"> a month</span></div>
            <div className="row" style={{ marginTop: 6 }}><span className="dot" style={{ ["--c" as string]: "var(--c-green)" }} /><span className="small">Plus <b className="mono">{fmt(Math.round(medisaveYearly * 100) / 100)}</b> a year from CPF MediSave</span></div>
            <ul className="miles">
              {upcoming.map((p) => {
                const n = daysTo(p.next_due!);
                return (
                  <li key={p.id}>
                    <span className="dot" style={{ ["--c" as string]: n <= 30 ? "var(--warn)" : "var(--c-slate)" }} />
                    <span>{p.name}</span>
                    <span className="dt">{new Date(p.next_due!).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}<small>{n < 0 ? "overdue" : n === 0 ? "today" : `in ${n} days`} · {p.medisave_amount > 0 ? `${fmt(p.premium - p.medisave_amount)} cash` : fmt(p.premium)}</small></span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="panel">
            <h2>Total cover today</h2>
            <div className="tablewrap" style={{ marginTop: 10 }}>
              <table className="t">
                <tbody>
                  {[...totals.entries()].map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{big(v)}</td></tr>)}
                  {!totals.size && <tr><td className="muted">Add the cover on each policy to see totals.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="cards">
          {d.policies.map((p) => {
            const n = p.next_due ? daysTo(p.next_due) : null;
            return (
              <form key={p.id} action={saveRow} className="card">
                <input type="hidden" name="_table" value="policies" />
                <input type="hidden" name="_back" value="/insurance" />
                <input type="hidden" name="_id" value={p.id} />
                <div className="row between">
                  <div><div className="eyebrow">{p.insurer} · {KIND_LABEL[p.kind]}</div><h3>{p.name}</h3></div>
                  <span className={`state ${!p.in_force ? "off" : n !== null && n <= 30 ? "due" : "on"}`}>{!p.in_force ? "Not in force" : n !== null && n <= 30 ? "Due soon" : "In force"}</span>
                </div>
                <div className="paysplit">
                  <span className="mono">{fmt(p.premium)} <span className="muted small">{FREQ[p.frequency]}</span></span>
                  {p.medisave_amount > 0 && (
                    <>
                      <div className="split" style={{ height: 8, margin: "6px 0" }}>
                        <div style={{ ["--c" as string]: "var(--c-green)", flexBasis: `${(p.medisave_amount / p.premium) * 100}%` }} />
                        <div style={{ ["--c" as string]: "var(--c-slate)", flexBasis: `${((p.premium - p.medisave_amount) / p.premium) * 100}%` }} />
                      </div>
                      <span className="small"><span className="dot" style={{ ["--c" as string]: "var(--c-green)" }} /> MediSave {fmt(p.medisave_amount)} · <span className="dot" style={{ ["--c" as string]: "var(--c-slate)" }} /> Cash {fmt(p.premium - p.medisave_amount)}</span>
                    </>
                  )}
                </div>
                {p.cover.length > 0 && (
                  <table className="t">
                    <tbody>
                      {p.cover.map((c, i) => (
                        <tr key={i}><td>{c.type}{c.note ? <div className="muted small">{c.note}</div> : null}</td><td className="num">{c.amount ? big(c.amount) : "–"}</td><td className="muted small">{c.until ? `to ${c.until.slice(0, 4)}` : ""}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="formgrid">
                  <div className="field"><label htmlFor={`pr-${p.id}`}>Premium ({p.frequency})</label><input id={`pr-${p.id}`} name="premium" type="number" step="0.01" defaultValue={p.premium} className="input mono" /></div>
                  <div className="field"><label htmlFor={`ms-${p.id}`}>Paid from MediSave</label><input id={`ms-${p.id}`} name="medisave_amount" type="number" step="0.01" defaultValue={p.medisave_amount} className="input mono" /></div>
                  <div className="field"><label htmlFor={`nd-${p.id}`}>Next due</label><input id={`nd-${p.id}`} name="next_due" type="date" defaultValue={p.next_due ?? ""} className="input" /></div>
                </div>
                {p.notes && <p className="muted small" style={{ margin: 0 }}>{p.notes}</p>}
                <label className="check"><input type="hidden" name="in_force__cb" value="1" /><input type="checkbox" name="in_force" defaultChecked={p.in_force} /> In force</label>
                <div className="row">
                  <button className="btn sm" type="submit">Save</button>
                  <button className="btn danger sm" type="submit" formAction={deleteRow}>Delete</button>
                </div>
              </form>
            );
          })}
          <form action={saveRow} className="card" style={{ borderStyle: "dashed" }}>
            <input type="hidden" name="_table" value="policies" />
            <input type="hidden" name="_back" value="/insurance" />
            <h3>New policy</h3>
            <div className="formgrid">
              <div className="field"><label htmlFor="np-ins">Insurer</label><input id="np-ins" name="insurer" className="input" /></div>
              <div className="field"><label htmlFor="np-name">Name</label><input id="np-name" name="name" className="input" /></div>
              <div className="field"><label htmlFor="np-kind">Type</label>
                <select id="np-kind" name="kind" className="input" defaultValue="ci">{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div className="field"><label htmlFor="np-pr">Premium</label><input id="np-pr" name="premium" type="number" step="0.01" className="input mono" /></div>
              <div className="field"><label htmlFor="np-fr">Paid</label>
                <select id="np-fr" name="frequency" className="input" defaultValue="monthly"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annually</option></select></div>
              <div className="field"><label htmlFor="np-ms">Paid from MediSave</label><input id="np-ms" name="medisave_amount" type="number" step="0.01" defaultValue={0} className="input mono" /></div>
              <div className="field"><label htmlFor="np-nd">Next due</label><input id="np-nd" name="next_due" type="date" className="input" /></div>
            </div>
            <label className="check"><input type="hidden" name="in_force__cb" value="1" /><input type="checkbox" name="in_force" defaultChecked /> In force</label>
            <div><button className="btn sm" type="submit">Add policy</button></div>
          </form>
        </section>
      </main>
    </>
  );
}
