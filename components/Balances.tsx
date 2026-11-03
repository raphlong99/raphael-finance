"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateBalance } from "@/app/balances/actions";
import { money } from "@/lib/format";

export type AccountRow = { id: string; name: string; kind: string; value: number | null; as_of: string | null };

const GROUPS: { key: string; label: string; kinds: string[] }[] = [
  { key: "cash", label: "Cash", kinds: ["cash", "other"] },
  { key: "invest", label: "Investments", kinds: ["brokerage", "ilp"] },
  { key: "cpf", label: "CPF", kinds: ["cpf"] },
];

function ago(iso: string | null) {
  if (!iso) return "No balance yet";
  const days = Math.round((Date.now() - new Date(iso + "T00:00:00+08:00").getTime()) / 86400000);
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 45) return `Updated ${days} days ago`;
  return `Updated ${Math.round(days / 30)} months ago`;
}

function Row({ a, currency }: { a: AccountRow; currency: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(a.value !== null ? String(a.value) : "");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const stale = a.as_of ? Date.now() - new Date(a.as_of).getTime() > 40 * 86400000 : true;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await updateBalance(a.id, parseFloat(val));
      if (r && "error" in r && r.error) setErr(r.error);
      else { setErr(""); setEditing(false); router.refresh(); }
    });
  };

  return (
    <li className="acct">
      <div className="acct-main">
        <b>{a.name}</b>
        <span className={`small ${stale ? "warn-text" : "muted"}`}>{ago(a.as_of)}</span>
      </div>
      {editing ? (
        <form onSubmit={save} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
          <label className="sr" htmlFor={`bal-${a.id}`}>New balance for {a.name}</label>
          <input id={`bal-${a.id}`} className="input mono" type="number" step="0.01" inputMode="decimal" autoFocus value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 130 }} />
          <button className="btn sm" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          <button className="btn ghost sm" type="button" onClick={() => { setEditing(false); setVal(a.value !== null ? String(a.value) : ""); }}>Cancel</button>
        </form>
      ) : (
        <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
          <span className="mono">{a.value !== null ? money(a.value, currency) : "–"}</span>
          <button className="btn ghost sm" type="button" onClick={() => setEditing(true)}>{a.value !== null ? "Update" : "Add"}</button>
        </div>
      )}
      {err && <span className="small" style={{ color: "var(--bad)", gridColumn: "1 / -1" }}>{err}</span>}
    </li>
  );
}

export default function Balances({ accounts, currency }: { accounts: AccountRow[]; currency: string }) {
  return (
    <section className="panel">
      <div className="row between">
        <div><h2>Your money</h2><span className="muted small">Tap Update when a balance changes. Goals fill from these.</span></div>
        <Link href="/setup#accounts" className="btn ghost sm">Add account</Link>
      </div>
      <div className="acctgroups">
        {GROUPS.map((g) => {
          const list = accounts.filter((a) => g.kinds.includes(a.kind));
          if (!list.length) return null;
          const total = list.reduce((s, a) => s + (a.value ?? 0), 0);
          return (
            <div key={g.key}>
              <div className="row between acct-head"><span className="eyebrow">{g.label}</span><span className="mono small">{money(total, currency)}</span></div>
              <ul className="accts">{list.map((a) => <Row key={a.id} a={a} currency={currency} />)}</ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
