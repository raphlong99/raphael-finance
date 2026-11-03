"use client";
// "Where your money is": every real account as a pot, grouped by what the money is for,
// with the goals each pot holds shown inside it.
import Link from "next/link";
import { BalanceEdit, ago, isStale, type AccountRow } from "./Balances";
import { money } from "@/lib/format";

export type PotGroup = "spending" | "goals" | "invest" | "insurance" | "cpf";
export type Pot = AccountRow & {
  group: PotGroup;
  institution: string | null;
  holds: { id: string; name: string; color: string; value: number; target: number | null }[];
  surrender: { value: number; as_of: string | null } | null;
};

export const GROUP_META: Record<PotGroup, { label: string; color: string; note: string }> = {
  spending: { label: "Spending", color: "slate2", note: "Day-to-day money, not tied to a goal" },
  goals: { label: "Savings & goals", color: "teal", note: "Fills your goals in order" },
  invest: { label: "Investments", color: "blue", note: "Long-term, value moves with markets" },
  insurance: { label: "Insurance cash value", color: "violet", note: "What your policies would pay out if cancelled" },
  cpf: { label: "CPF", color: "green", note: "Locked until retirement, except housing and healthcare" },
};
const ORDER: PotGroup[] = ["spending", "goals", "invest", "insurance", "cpf"];

export default function MoneyMap({ pots, currency }: { pots: Pot[]; currency: string }) {
  const fmt = (v: number) => money(v, currency);
  const totals = ORDER.map((g) => ({ g, v: pots.filter((p) => p.group === g).reduce((s, p) => s + Math.max(p.value ?? 0, 0), 0) })).filter((t) => t.v > 0);
  const net = pots.reduce((s, p) => s + (p.value ?? 0), 0);
  const all = totals.reduce((s, t) => s + t.v, 0) || 1;
  const locked = pots.filter((p) => p.surrender && p.value !== null && p.surrender.value < p.value).reduce((s, p) => s + (p.value! - p.surrender!.value), 0);

  return (
    <section className="panel moneymap" aria-label="Where your money is">
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow">Where your money is</span>
          <div className="big">{fmt(net)}</div>
          <span className="muted small">Net worth across {pots.length} accounts{locked > 0 ? ` · ${fmt(locked)} of it is held back by surrender charges` : ""}</span>
        </div>
        <Link href="/setup#accounts" className="btn ghost sm">Add account</Link>
      </div>

      <div className="split mapbar" role="img" aria-label={totals.map((t) => `${GROUP_META[t.g].label} ${fmt(t.v)}`).join(", ")}>
        {totals.map((t) => <div key={t.g} style={{ ["--c" as string]: `var(--c-${GROUP_META[t.g].color})`, flexBasis: `${(t.v / all) * 100}%` }} />)}
      </div>
      <div className="maplegend">
        {totals.map((t) => (
          <div key={t.g}><span className="dot" style={{ ["--c" as string]: `var(--c-${GROUP_META[t.g].color})` }} /><span>{GROUP_META[t.g].label}</span><b>{fmt(t.v)}</b><small>{Math.round((t.v / all) * 100)}%</small></div>
        ))}
      </div>

      {ORDER.map((g) => {
        const list = pots.filter((p) => p.group === g);
        if (!list.length) return null;
        const meta = GROUP_META[g];
        return (
          <div key={g} className="potgroup" style={{ ["--c" as string]: `var(--c-${meta.color})` }}>
            <div className="row between potgroup-head">
              <span className="row" style={{ gap: 8 }}><span className="dot" /><b>{meta.label}</b><span className="muted small hide-sm">{meta.note}</span></span>
              <span className="mono small">{fmt(list.reduce((s, p) => s + (p.value ?? 0), 0))}</span>
            </div>
            <div className="pots">
              {list.map((p) => (
                <article key={p.id} className="pot">
                  <div className="pot-top">
                    <div className="acct-main">
                      <b>{p.name}</b>
                      <span className={`small ${isStale(p.as_of) ? "warn-text" : "muted"}`}>{p.institution ? `${p.institution} · ` : ""}{ago(p.as_of)}</span>
                    </div>
                  </div>
                  <BalanceEdit a={p} currency={currency} big />
                  {p.surrender && (
                    <div className="potnote">
                      <span>If cashed out today</span><b className="mono">{fmt(p.surrender.value)}</b>
                    </div>
                  )}
                  {p.holds.length > 0 && (
                    <ul className="holds">
                      {p.holds.map((h) => {
                        const pct = h.target ? Math.min(100, (h.value / h.target) * 100) : null;
                        return (
                          <li key={h.id} style={{ ["--c" as string]: `var(--c-${h.color})` }}>
                            <Link href={`/goals/${h.id}`}>
                              <span className="row between" style={{ gap: 8, flexWrap: "nowrap" }}>
                                <span className="row" style={{ gap: 6, flexWrap: "nowrap", minWidth: 0 }}><span className="dot" /><span className="holdname">{h.name}</span></span>
                                <span className="mono small">{fmt(h.value)}{h.target ? <span className="muted"> / {fmt(h.target)}</span> : null}</span>
                              </span>
                              {pct !== null && <span className="bar"><i style={{ width: `${pct}%` }} /></span>}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {p.holds.length > 1 && <span className="muted small">{p.holds.length} goals share this account. Give each its own account or pocket to see them apart at the bank too.</span>}
                </article>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
