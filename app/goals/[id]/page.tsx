import Nav from "@/components/Nav";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadUserData, todayISO } from "@/lib/data";
import { bucketStart, latestBalances, simulate } from "@/lib/plan";
import { goalStatus, money, monthLabel, monthsUntil, spanText } from "@/lib/format";
import { COLORS } from "@/lib/types";
import { deleteRow, saveRow } from "@/app/setup/actions";
import Balances from "@/components/Balances";

export const dynamic = "force-dynamic";

export default async function GoalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const d = await loadUserData();
  if (!d) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const b = d.buckets.find((x) => x.id === id);
  if (!b) notFound();

  const today = todayISO();
  const [y, m] = today.split("-").map(Number);
  const startMonth = { y, m: m - 1 };
  const live = d.buckets.filter((x) => !x.archived);
  const start = bucketStart(live, latestBalances(d.balances));
  const run = simulate({ profile: d.profile, buckets: live, rules: d.rules, expenses: d.expenses, start, startMonth, months: 480 });
  const sim = [{ values: { ...start } }, ...run]; // index 0 is today
  const now = start[b.id] ?? 0;
  const savingsGoals = live.filter((x) => x.kind === "savings").sort((a, c) => a.fill_order - c.fill_order);
  const pos = savingsGoals.findIndex((x) => x.id === b.id);

  const eta = b.target ? sim.findIndex((x) => (x.values[b.id] ?? 0) >= b.target! - 0.5) : -1;
  const due = b.target_date ? monthsUntil(startMonth, b.target_date) : null;
  const waiting = savingsGoals.slice(0, Math.max(pos, 0)).some((p) => p.target !== null && (sim[0].values[p.id] ?? 0) < p.target - 0.5);
  const st = goalStatus({ eta, due, start: startMonth, hasTarget: !!b.target, waiting });
  const avgIn = ((sim[12]?.values[b.id] ?? now) - now) / 12;
  const needPerMonth = b.target && due !== null && due > 0 ? Math.max(0, (b.target - now) / due) : null;
  const pct = b.target ? Math.min(100, Math.round((now / b.target) * 100)) : null;
  const frac = b.target ? Math.min(now / b.target, 1.1) : 0.5;
  const accounts = d.accounts.filter((a) => !a.archived);
  const fmt = (v: number) => money(v, d.profile.currency);

  return (
    <>
      <Nav current="/" />
      <main className="wrap" style={{ maxWidth: 900 }}>
        <header>
          <Link href="/" className="muted small">← Back to plan</Link>
          <div className="eyebrow" style={{ marginTop: 8 }}>{b.kind === "investment" ? "Investment" : b.kind === "cpf" ? "CPF" : pos >= 0 ? `Goal ${pos + 1} of ${savingsGoals.length}` : "Goal"}</div>
          <h1>{b.name}</h1>
        </header>
        {sp.saved && <div className="notice">Saved.</div>}
        {sp.error && <div className="notice" style={{ color: "var(--bad)" }}>Couldn't save: {sp.error}</div>}

        <section className="goalhero" style={{ ["--c" as string]: `var(--c-${b.color})` }}>
          <div className="tank" style={{ height: 240 }}>
            <div className={`water top ${frac <= 0.002 ? "empty" : ""}`} style={{ height: `${Math.max(0, frac) * 85}%` }} />
            {b.target && <div className="target"><span>{fmt(b.target)}</span></div>}
          </div>
          <div className="herostats">
            <div><span className="eyebrow">Saved now</span><div className="big">{fmt(now)}</div>{pct !== null && <div className="bar"><i style={{ width: `${pct}%` }} /></div>}<span className="muted small">{pct !== null ? `${pct}% of ${fmt(b.target!)}` : "No target yet"}</span></div>
            {b.kind === "savings" && <div className={`status ${st.tone}`} style={{ fontSize: 15 }}>{st.text}</div>}
            <dl className="facts">
              <div><dt>Going in each month</dt><dd className="mono">{fmt(avgIn)}</dd><span className="muted small">average over the next 12 months</span></div>
              {needPerMonth !== null && <div><dt>Needed to hit {monthLabel(startMonth, due!)}</dt><dd className="mono">{fmt(needPerMonth)}</dd><span className="muted small">{avgIn >= needPerMonth ? "You're putting in enough" : `${fmt(needPerMonth - avgIn)} a month short`}</span></div>}
              {b.target && eta > 0 && <div><dt>Time to reach target</dt><dd>{spanText(eta)}</dd></div>}
              {waiting && <div><dt>Queue</dt><dd className="small">Starts filling once the goals above it are full. Move it up to fund it sooner.</dd></div>}
            </dl>
          </div>
        </section>

        {b.account_id && (() => {
          const acc = d.accounts.find((a) => a.id === b.account_id);
          const lb = latestBalances(d.balances).get(b.account_id!);
          return acc ? <Balances accounts={[{ id: acc.id, name: acc.name, kind: acc.kind, value: lb?.value ?? null, as_of: lb?.as_of ?? null }]} currency={d.profile.currency} /> : null;
        })()}

        <form action={saveRow} className="panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input type="hidden" name="_table" value="buckets" />
          <input type="hidden" name="_id" value={b.id} />
          <input type="hidden" name="_back" value={`/goals/${b.id}`} />
          <input type="hidden" name="_after_delete" value="/" />
          <h2>Edit</h2>
          <div className="formgrid">
            <div className="field"><label htmlFor="g-name">Name</label><input id="g-name" name="name" className="input" defaultValue={b.name} /></div>
            {b.kind === "savings" ? <>
              <div className="field"><label htmlFor="g-target">Target (S$)</label><input id="g-target" name="target" type="number" step="100" className="input mono" defaultValue={b.target ?? ""} placeholder="No target" /></div>
              <div className="field"><label htmlFor="g-date">By when</label><input id="g-date" name="target_date" type="month" className="input" defaultValue={b.target_date?.slice(0, 7) ?? ""} /></div>
              <div className="field"><label htmlFor="g-order">Position in queue</label><input id="g-order" name="fill_order" type="number" min="1" className="input mono" defaultValue={b.fill_order} /></div>
            </> : <>
              <div className="field"><label htmlFor="g-ret">Expected return per year (%)</label><input id="g-ret" name="expected_return" type="number" step="0.5" className="input mono" defaultValue={b.expected_return ?? ""} /></div>
              <input type="hidden" name="fill_order" value={b.fill_order} />
            </>}
            <div className="field"><label htmlFor="g-color">Colour</label>
              <select id="g-color" name="color" className="input" defaultValue={b.color}>{COLORS.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select></div>
            <div className="field"><label htmlFor="g-acc">Money sits in</label>
              <select id="g-acc" name="account_id" className="input" defaultValue={b.account_id ?? ""}><option value="">Not linked</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          </div>
          <div className="field"><label htmlFor="g-notes">Notes</label><input id="g-notes" name="notes" className="input" defaultValue={b.notes ?? ""} /></div>
          <label className="check"><input type="hidden" name="archived__cb" value="1" /><input type="checkbox" name="archived" defaultChecked={b.archived} /> Archive this goal (hide it and stop filling it)</label>
          <div className="row">
            <button className="btn" type="submit">Save changes</button>
            <button className="btn danger" type="submit" formAction={deleteRow}>Delete goal</button>
          </div>
        </form>
      </main>
    </>
  );
}
