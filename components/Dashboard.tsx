"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Chart from "./Chart";
import Balances, { type AccountRow } from "./Balances";
import { simulate } from "@/lib/plan";
import { compactMoney, goalStatus, money, monthLabel, monthsUntil, spanText } from "@/lib/format";
import { CATEGORY_COLOR, type Bucket, type ExpenseItem, type Profile, type SplitLine, type SplitRule } from "@/lib/types";

type Props = {
  profile: Profile;
  buckets: Bucket[];
  rules: SplitRule[];
  expenses: ExpenseItem[];
  start: Record<string, number>;
  startMonth: { y: number; m: number };
  history: { offset: number; net: number }[];
  thisMonth: { income: number; lines: SplitLine[]; logged: boolean };
  accounts: AccountRow[];
};

const HORIZONS = [12, 60, 120, 360];
const STEPS = [10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2000000, 5000000];
const nextStep = (v: number) => STEPS.find((s) => s > v) ?? v * 1.2;

export default function Dashboard({ profile, buckets, rules, expenses, start, startMonth, history, thisMonth, accounts }: Props) {
  const cur = profile.currency;
  const fmt = (v: number) => money(v, cur);
  const compact = (v: number) => compactMoney(v, cur);
  const birth = profile.birth_month ? new Date(profile.birth_month) : null;
  const ageOf = (m: number) => (birth ? Math.floor((startMonth.y * 12 + startMonth.m + m - (birth.getFullYear() * 12 + birth.getMonth())) / 12) : null);

  // Index 0 is today's balances; index k is the projection after k months.
  const sim = useMemo(() => {
    const run = simulate({ profile, buckets, rules, expenses, start, startMonth, months: 480 });
    const sav = buckets.filter((b) => b.kind === "savings").reduce((a, b) => a + (start[b.id] ?? 0), 0);
    const inv = buckets.filter((b) => b.kind === "investment").reduce((a, b) => a + (start[b.id] ?? 0), 0);
    const cpf = buckets.filter((b) => b.kind === "cpf").reduce((a, b) => a + (start[b.id] ?? 0), 0);
    return [{ m: 0, income: 0, lines: [], values: { ...start }, savings: sav, invested: inv, cpf, net: sav + inv + cpf }, ...run];
  }, [profile, buckets, rules, expenses, start, startMonth]);
  const goals = buckets.filter((b) => b.kind === "savings").sort((a, b) => a.fill_order - b.fill_order);
  const invest = buckets.filter((b) => b.kind === "investment");
  const cpfs = buckets.filter((b) => b.kind === "cpf");

  const [horizon, setHorizon] = useState(60);
  const [month, setMonth] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const speed = horizon > 120 ? 40 : horizon > 60 ? 70 : 120;
    const t = setInterval(() => setMonth((m) => {
      if (m >= horizon - 1) { setPlaying(false); return m; }
      return m + 1;
    }), speed);
    return () => clearInterval(t);
  }, [playing, horizon]);
  useEffect(() => { if (month > horizon - 1) setMonth(horizon - 1); }, [horizon, month]);

  const s = sim[month];
  const first = (test: (x: (typeof sim)[number]) => boolean) => sim.findIndex(test);
  const colorOfLine = (l: SplitLine) => l.color ?? (l.bucket_id ? buckets.find((b) => b.id === l.bucket_id)?.color : null) ?? CATEGORY_COLOR[l.category];
  const shown = thisMonth.lines.filter((l) => l.category !== "unallocated");
  const total = shown.reduce((a, l) => a + Math.max(l.amount, 0), 0) || 1;

  const miles = [
    ...(invest.length ? [{ label: `Investments pass ${compact(100000)}`, m: first((x) => x.invested >= 1e5) }] : []),
    { label: `Net worth passes ${compact(250000)}`, m: first((x) => x.net >= 2.5e5) },
    { label: `Net worth passes ${compact(1000000)}`, m: first((x) => x.net >= 1e6) },
  ];

  return (
    <>
      <section className="panel">
        <div className="row between">
          <div>
            <span className="eyebrow">{monthLabel(startMonth, 0, true)}</span>
            <h2>{thisMonth.logged ? "This month's split" : "Expected split this month"}</h2>
          </div>
          <div className="row">
            <span className="mono">{fmt(thisMonth.income)}</span>
            <Link href="/check-in" className={`btn sm ${thisMonth.logged ? "ghost" : ""}`}>{thisMonth.logged ? "Update" : "Log this month"}</Link>
          </div>
        </div>
        <div className="split">{shown.map((l, i) => <div key={i} title={l.name} style={{ ["--c" as string]: `var(--c-${colorOfLine(l)})`, flexBasis: `${(Math.max(l.amount, 0) / total) * 100}%` }} />)}</div>
        <div className="splitlist">
          {shown.map((l, i) => <div key={i}><span className="dot" style={{ ["--c" as string]: `var(--c-${colorOfLine(l)})` }} /><span>{l.name}</span><b>{fmt(l.amount)}</b></div>)}
        </div>
      </section>

      <Balances accounts={accounts} currency={cur} />

      <section className="panel future" aria-label="See your future">
        <div className="row between" style={{ alignItems: "baseline" }}>
          <div>
            <span className="eyebrow">See your future</span>
            <div className="future-date">{month === 0 ? "Today" : monthLabel(startMonth, month)}</div>
            <span className="muted small">{month === 0 ? "Drag or press play to fast-forward" : `${spanText(month)} from now${ageOf(month) !== null ? ` · age ${ageOf(month)}` : ""}`}</span>
          </div>
          <div className="chips">
            {HORIZONS.map((h) => <button key={h} className="chip" aria-pressed={horizon === h} onClick={() => setHorizon(h)}>{h === 12 ? "1 year" : `${h / 12} years`}</button>)}
          </div>
        </div>
        <div className="trackrow" style={{ marginTop: 10 }}>
          <button className="play" onClick={() => { if (!playing && month >= horizon - 1) setMonth(0); setPlaying(!playing); }} aria-label={playing ? "Pause" : "Play the months"}>
            <svg viewBox="0 0 16 16">{playing ? <path d="M3 1.5h3.5v13H3zM9.5 1.5H13v13H9.5z" /> : <path d="M3 1.5v13l11-6.5z" />}</svg>
          </button>
          <input type="range" min={0} max={horizon - 1} value={month} aria-label="Month" onChange={(e) => { setPlaying(false); setMonth(+e.target.value); }} />
          <button className="btn ghost sm" onClick={() => { setPlaying(false); setMonth(0); }} disabled={month === 0}>Today</button>
        </div>
      </section>

      <section>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>Goals</h2>
          <span className="muted small">Savings fill these in order</span>
        </div>
        <div className="goalgrid">
          {goals.map((b, i) => {
            const v = s.values[b.id] ?? 0;
            const scale = b.target ?? nextStep(v);
            const pct = b.target ? Math.min(100, Math.round((v / b.target) * 100)) : null;
            const eta = b.target ? first((x) => (x.values[b.id] ?? 0) >= b.target! - 0.5) : -1;
            const waiting = goals.slice(0, i).some((p) => p.target !== null && (sim[0].values[p.id] ?? 0) < p.target - 0.5);
            const st = goalStatus({ eta, due: b.target_date ? monthsUntil(startMonth, b.target_date) : null, start: startMonth, hasTarget: !!b.target, waiting });
            const frac = Math.max(0, Math.min(v / scale, 1.1));
            return (
              <Link key={b.id} href={`/goals/${b.id}`} className="goalcard" style={{ ["--c" as string]: `var(--c-${b.color})` }}>
                <div className="minitank"><div className={`water top ${frac <= 0.002 ? "empty" : ""}`} style={{ height: `${frac * 85}%` }} />{b.target && <div className="target" />}</div>
                <div className="goalbody">
                  <div className="row between"><b className="goalname">{b.name}</b><span className="order">{i + 1}</span></div>
                  <div className="tankval">{fmt(v)}</div>
                  <div className="muted small">{b.target ? `of ${fmt(b.target)}${b.target_date ? ` by ${monthLabel(startMonth, monthsUntil(startMonth, b.target_date))}` : ""}` : "No target"}</div>
                  {pct !== null && <div className="bar" aria-label={`${pct}% of target`}><i style={{ width: `${pct}%` }} /></div>}
                  <div className={`status ${st.tone}`}>{st.text}</div>
                </div>
              </Link>
            );
          })}
          <Link href="/goals/new" className="goalcard add">
            <span className="plus" aria-hidden="true">+</span>
            <b>Add a goal</b>
            <span className="muted small">Home, wedding, travel, a business…</span>
          </Link>
        </div>
      </section>

      {[{ title: "Investments", list: invest, total: s.invested, note: "" }, { title: "CPF", list: cpfs, total: s.cpf, note: "Locked until retirement, except housing and healthcare" }]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <section className="panel" key={g.title}>
            <div className="row between"><div><h2>{g.title}</h2>{g.note && <span className="muted small">{g.note}</span>}</div><span className="tankval">{fmt(g.total)}</span></div>
            <div className="investrow">
              {g.list.map((b) => {
                const v = s.values[b.id] ?? 0;
                const step = nextStep(v);
                return (
                  <Link key={b.id} href={`/goals/${b.id}`} className="investitem" style={{ ["--c" as string]: `var(--c-${b.color})` }}>
                    <div className="row between"><span className="row" style={{ gap: 8 }}><span className="dot" /><b>{b.name}</b></span><span className="mono">{fmt(v)}</span></div>
                    <div className="bar"><i style={{ width: `${Math.min(100, (v / step) * 100)}%` }} /></div>
                    <span className="muted small">{b.expected_return ?? 0}% a year {b.kind === "cpf" ? "interest" : "assumed"} · next marker {compact(step)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

      <section className="long">
        <div className="panel">
          <span className="eyebrow">Net worth {month === 0 ? "today" : `in ${monthLabel(startMonth, month)}`}</span>
          <div className="big">{fmt(s.net)}</div>
          <ul className="miles">
            {miles.map((it) => {
              const done = it.m >= 0 && it.m <= month;
              return (
                <li key={it.label} className={done ? "done" : ""}>
                  <span className="dot" style={{ ["--c" as string]: "var(--c-blue)" }} />
                  <span>{it.label}</span>
                  <span className="dt">{it.m < 0 ? "Beyond 40 years" : monthLabel(startMonth, it.m)}
                    {it.m >= 0 && <small>{ageOf(it.m) !== null ? `age ${ageOf(it.m)} · ` : ""}{done ? "reached" : `in ${spanText(it.m)}`}</small>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="panel">
          <div className="row between"><h2>The long view</h2><span className="muted small">Tap to jump to a month</span></div>
          <Chart sim={sim} buckets={[...cpfs, ...invest, ...goals]} horizon={horizon} month={month} history={history} onPick={(m) => { setPlaying(false); setMonth(m); }} compact={compact} startMonth={startMonth} />
          <div className="legend">
            {[...cpfs, ...invest, ...goals].map((b) => <span key={b.id}><i className="dot" style={{ ["--c" as string]: `var(--c-${b.color})` }} />{b.name}</span>)}
            {history.length > 0 && <span><i className="dot" style={{ ["--c" as string]: "var(--ink)" }} />Actual</span>}
          </div>
        </div>
      </section>
      <p className="muted small" style={{ maxWidth: "70ch" }}>Projections assume steady returns and your usual income. Markets rise and fall, so treat dates as a guide.</p>
    </>
  );
}
