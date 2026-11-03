import Nav from "@/components/Nav";
import { loadUserData } from "@/lib/data";
import { expensesTotal } from "@/lib/plan";
import { COLORS } from "@/lib/types";
import { redirect } from "next/navigation";
import { deleteRow, saveProfile, saveRow } from "./actions";
import ConnectAI from "@/components/ConnectAI";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Meta({ table, id }: { table: string; id?: string }) {
  return (
    <>
      <input type="hidden" name="_table" value={table} />
      <input type="hidden" name="_back" value="/setup" />
      {id && <input type="hidden" name="_id" value={id} />}
    </>
  );
}
function Actions({ isNew }: { isNew?: boolean }) {
  return (
    <div className="row">
      <button className="btn sm" type="submit">{isNew ? "Add" : "Save"}</button>
      {!isNew && <button className="btn danger sm" type="submit" formAction={deleteRow}>Delete</button>}
    </div>
  );
}
function F({ label, name, type = "text", value, step, ph }: { label: string; name: string; type?: string; value?: string | number | null; step?: string; ph?: string }) {
  const id = `${name}-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} step={step} placeholder={ph} defaultValue={value ?? ""} className={`input ${type === "number" ? "mono" : ""}`} />
    </div>
  );
}
function S({ label, name, value, options }: { label: string; name: string; value?: string | null; options: [string, string][] }) {
  const id = `${name}-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={value ?? ""} className="input">{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </div>
  );
}
function C({ label, name, checked }: { label: string; name: string; checked: boolean }) {
  return (
    <label className="check"><input type="hidden" name={`${name}__cb`} value="1" /><input type="checkbox" name={name} defaultChecked={checked} /> {label}</label>
  );
}

const RULE_KINDS: [string, string][] = [["percent", "% of income"], ["fixed", "Fixed amount"], ["percent_min", "% with a minimum"], ["expenses", "Sum of expenses"], ["remainder", "Whatever is left"]];
const CATS: [string, string][] = [["tax", "Tax"], ["needs", "Needs"], ["invest", "Invest"], ["fun", "Fun"], ["save", "Save"], ["other", "Other"]];
const ROUND: [string, string][] = [["none", "No rounding"], ["up", "Round up"], ["down", "Round down"]];
const ACC_KINDS: [string, string][] = [["cash", "Cash / bank"], ["brokerage", "Brokerage"], ["ilp", "Insurance-linked"], ["cpf", "CPF"], ["other", "Other"]];

export default async function Setup({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const d = await loadUserData();
  if (!d) redirect("/login");
  const sp = await searchParams;
  const p = d.profile;
  const { data: links } = await (await createClient()).from("mcp_tokens").select("id,name,created_at,last_used_at").order("created_at", { ascending: false });
  const accOpts: [string, string][] = [["", "Not linked"], ...d.accounts.map((a) => [a.id, a.name] as [string, string])];
  const bucketOpts: [string, string][] = [["", "Spent or set aside"], ...d.buckets.map((b) => [b.id, b.name] as [string, string])];
  const colorOpts: [string, string][] = COLORS.map((c) => [c, c[0].toUpperCase() + c.slice(1)]);

  return (
    <>
      <Nav current="/setup" />
      <main className="wrap">
        <header>
          <div className="eyebrow">Settings</div>
          <h1>Fine-tune your plan</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "64ch" }}>Accounts are where money sits. Buckets are what it's for. Rules decide how each month's income is split. Savings left over fills your savings buckets in order.</p>
        </header>
        {sp.error && <div className="notice" style={{ color: "var(--bad)" }}>Couldn't save: {sp.error}</div>}
        {sp.saved && <div className="notice">Saved.</div>}

        <section className="panel row between">
          <div><h2>Your split</h2><p className="muted small" style={{ margin: 0 }}>Switch to 50/30/20, Pay yourself first, Profit First, 6 Jars or the freelancer split. Your goals stay as they are.</p></div>
          <a className="btn" href="/welcome?redo=split">Change split</a>
        </section>

        <ConnectAI links={links ?? []} />

        <section className="panel">
          <h2>Projection</h2>
          <form action={saveProfile} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
            <div className="formgrid">
              <F label="Your name" name="display_name" value={p.display_name} />
              <F label="Birth month" name="birth_month" type="month" value={p.birth_month?.slice(0, 7)} />
              <F label="Currency" name="currency" value={p.currency} />
              <F label="Typical monthly income" name="income_estimate" type="number" step="50" value={p.income_estimate} />
              <F label="Income growth per year (%)" name="income_growth" type="number" step="0.5" value={p.income_growth} />
              <F label="Costs rise per year (%)" name="cost_growth" type="number" step="0.5" value={p.cost_growth} />
              <F label="Interest on savings (%)" name="cash_rate" type="number" step="0.25" value={p.cash_rate} />
            </div>
            <div>
              <div className="lbl" style={{ marginBottom: 6 }}>Seasonal income change by month (%), for example −15 in Nov and Dec</div>
              <div className="formgrid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))" }}>
                {MONTHS.map((m, i) => <F key={m} label={m} name={`season_${i + 1}`} type="number" step="1" value={p.seasonal?.[String(i + 1)] ?? ""} ph="0" />)}
              </div>
            </div>
            <div><button className="btn sm" type="submit">Save projection</button></div>
          </form>
        </section>

        <section className="panel" id="accounts">
          <h2>Accounts</h2>
          <div className="cards" style={{ marginTop: 12 }}>
            {d.accounts.map((a) => (
              <form key={a.id} action={saveRow} className="card">
                <Meta table="accounts" id={a.id} />
                <div className="formgrid">
                  <F label="Name" name="name" value={a.name} />
                  <F label="Institution" name="institution" value={a.institution} />
                  <S label="Type" name="kind" value={a.kind} options={ACC_KINDS} />
                  <F label="Order" name="sort" type="number" value={a.sort} />
                </div>
                <F label="Notes" name="notes" value={a.notes} />
                <C label="Archived" name="archived" checked={a.archived} />
                <Actions />
              </form>
            ))}
            <form action={saveRow} className="card" style={{ borderStyle: "dashed" }}>
              <Meta table="accounts" />
              <h3>New account</h3>
              <div className="formgrid">
                <F label="Name" name="name" ph="UOB savings" />
                <F label="Institution" name="institution" />
                <S label="Type" name="kind" value="cash" options={ACC_KINDS} />
                <F label="Order" name="sort" type="number" value={d.accounts.length + 1} />
              </div>
              <Actions isNew />
            </form>
          </div>
        </section>

        <section className="panel">
          <h2>Buckets</h2>
          <p className="muted small">Savings buckets fill in order, lowest number first. Link a bucket to the account holding its money so your balances can fill it.</p>
          <div className="cards" style={{ marginTop: 12 }}>
            {d.buckets.map((b) => (
              <form key={b.id} action={saveRow} className="card" style={{ ["--c" as string]: `var(--c-${b.color})` }}>
                <Meta table="buckets" id={b.id} />
                <div className="row"><span className="dot" /><b>{b.name}</b><span className="muted small">{b.kind}</span></div>
                <div className="formgrid">
                  <F label="Name" name="name" value={b.name} />
                  <S label="Type" name="kind" value={b.kind} options={[["savings", "Savings goal"], ["investment", "Investment"], ["cpf", "CPF"]]} />
                  <F label="Target" name="target" type="number" step="100" value={b.target} ph="No target" />
                  <F label="Fill order" name="fill_order" type="number" value={b.fill_order} />
                  <F label="Return per year (%)" name="expected_return" type="number" step="0.5" value={b.expected_return} ph="Investments" />
                  <S label="Colour" name="color" value={b.color} options={colorOpts} />
                  <S label="Money sits in" name="account_id" value={b.account_id} options={accOpts} />
                </div>
                <C label="Archived" name="archived" checked={b.archived} />
                <Actions />
              </form>
            ))}
            <form action={saveRow} className="card" style={{ borderStyle: "dashed" }}>
              <Meta table="buckets" />
              <h3>New bucket</h3>
              <div className="formgrid">
                <F label="Name" name="name" ph="Holiday fund" />
                <S label="Type" name="kind" value="savings" options={[["savings", "Savings goal"], ["investment", "Investment"], ["cpf", "CPF"]]} />
                <F label="Target" name="target" type="number" step="100" />
                <F label="Fill order" name="fill_order" type="number" value={d.buckets.length + 1} />
                <S label="Colour" name="color" value={COLORS[d.buckets.length % COLORS.length]} options={colorOpts} />
                <S label="Money sits in" name="account_id" value="" options={accOpts} />
              </div>
              <Actions isNew />
            </form>
          </div>
        </section>

        <section className="panel">
          <h2>Split rules</h2>
          <p className="muted small">Rules run in order. "Whatever is left" always runs last; with no bucket it fills your savings buckets in order.</p>
          <div className="cards" style={{ marginTop: 12 }}>
            {d.rules.map((r) => (
              <form key={r.id} action={saveRow} className="card">
                <Meta table="split_rules" id={r.id} />
                <div className="formgrid">
                  <F label="Name" name="name" value={r.name} />
                  <S label="How" name="kind" value={r.kind} options={RULE_KINDS} />
                  <F label="% or amount" name="value" type="number" step="0.5" value={r.value} />
                  <F label="Minimum" name="min_amount" type="number" step="50" value={r.min_amount} />
                  <S label="Rounding" name="round_mode" value={r.round_mode} options={ROUND} />
                  <F label="Round to" name="round_to" type="number" value={r.round_to} />
                  <S label="Goes to" name="bucket_id" value={r.bucket_id} options={bucketOpts} />
                  <S label="Category" name="category" value={r.category} options={CATS} />
                  <F label="Order" name="sort" type="number" value={r.sort} />
                </div>
                <Actions />
              </form>
            ))}
            <form action={saveRow} className="card" style={{ borderStyle: "dashed" }}>
              <Meta table="split_rules" />
              <h3>New rule</h3>
              <div className="formgrid">
                <F label="Name" name="name" ph="Fun" />
                <S label="How" name="kind" value="percent" options={RULE_KINDS} />
                <F label="% or amount" name="value" type="number" step="0.5" />
                <S label="Rounding" name="round_mode" value="none" options={ROUND} />
                <F label="Round to" name="round_to" type="number" value={10} />
                <S label="Goes to" name="bucket_id" value="" options={bucketOpts} />
                <S label="Category" name="category" value="other" options={CATS} />
                <F label="Order" name="sort" type="number" value={(d.rules.length + 1) * 10} />
              </div>
              <Actions isNew />
            </form>
          </div>
        </section>

        <section className="panel">
          <div className="row between"><h2>Monthly expenses</h2><span className="mono">In force: S${Math.round(expensesTotal(d.expenses)).toLocaleString("en-SG")}</span></div>
          <p className="muted small">The "Sum of expenses" rule uses everything ticked as in force.</p>
          <div style={{ marginTop: 10 }}>
            <div className="exp exp-head"><span>Expense</span><span>Monthly (S$)</span><span style={{ textAlign: "center" }}>In force</span><span /></div>
            {d.expenses.map((e) => (
              <form key={e.id} action={saveRow} className="exp exp-row">
                <Meta table="expense_items" id={e.id} />
                <input type="hidden" name="sort" value={e.sort} />
                <input name="name" defaultValue={e.name} className="input" aria-label="Expense name" />
                <input name="monthly" type="number" step="0.01" defaultValue={e.monthly} className="input mono" aria-label={`Monthly amount for ${e.name}`} />
                <span className="center"><input type="hidden" name="in_force__cb" value="1" /><input type="checkbox" name="in_force" defaultChecked={e.in_force} aria-label={`${e.name} in force`} /></span>
                <span className="acts"><button className="btn sm" type="submit">Save</button><button className="btn danger sm" type="submit" formAction={deleteRow}>Delete</button></span>
              </form>
            ))}
            <form action={saveRow} className="exp exp-row">
              <Meta table="expense_items" />
              <input type="hidden" name="sort" value={d.expenses.length + 1} />
              <input name="name" placeholder="New expense" className="input" aria-label="New expense name" required />
              <input name="monthly" type="number" step="0.01" placeholder="0" className="input mono" aria-label="Monthly amount" />
              <span className="center"><input type="hidden" name="in_force__cb" value="1" /><input type="checkbox" name="in_force" defaultChecked aria-label="In force" /></span>
              <span className="acts"><button className="btn sm" type="submit">Add</button></span>
            </form>
          </div>
        </section>
      </main>
    </>
  );
}
