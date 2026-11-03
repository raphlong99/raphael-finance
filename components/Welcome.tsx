"use client";
import { useMemo, useState, useTransition } from "react";
import { applyRules } from "@/lib/plan";
import { EARNER_TYPES, GOAL_PRESETS, templatesFor, type Template } from "@/lib/templates";
import { CATEGORY_COLOR, type EarnerType, type SplitRule } from "@/lib/types";
import { finishOnboarding, type OnboardingPayload } from "@/app/welcome/actions";

const fmt = (v: number) => "S$" + Math.round(v).toLocaleString("en-SG");

function toRules(t: Template): SplitRule[] {
  return t.rules.map((r, i) => ({
    id: `t${i}`, name: r.name, kind: r.kind, value: r.value ?? null, min_amount: r.min_amount ?? null,
    round_mode: r.round_mode ?? "none", round_to: r.round_to ?? 1, bucket_id: r.to === "invest" ? "invest" : null,
    category: r.category, color: r.color ?? null, sort: r.kind === "remainder" ? 99 : (i + 1) * 10,
  }));
}
const colorOf = (l: { color?: string | null; category: string; bucket_id: string | null }) =>
  l.color ?? (l.bucket_id === "invest" ? "blue" : CATEGORY_COLOR[l.category] ?? "slate");

export function SplitBar({ income, template, essentials }: { income: number; template: Template; essentials: number }) {
  const lines = applyRules(income, toRules(template), essentials).filter((l) => l.category !== "unallocated");
  const total = lines.reduce((a, l) => a + Math.max(l.amount, 0), 0) || 1;
  return (
    <div>
      <div className="split" aria-hidden="true">
        {lines.map((l, i) => <div key={i} style={{ ["--c" as string]: `var(--c-${colorOf(l)})`, flexBasis: `${(Math.max(l.amount, 0) / total) * 100}%` }} />)}
      </div>
      <div className="splitlist">
        {lines.map((l, i) => (
          <div key={i}><span className="dot" style={{ ["--c" as string]: `var(--c-${colorOf(l)})` }} /><span>{l.name}</span><b>{fmt(l.amount)}</b></div>
        ))}
      </div>
    </div>
  );
}

type Goal = { preset: string; name: string; target: string; date: string };

export default function Welcome({ mode, initial }: { mode: "full" | "split"; initial: { name: string; earner: EarnerType | null; income: number; essentials: number; template: string | null } }) {
  const steps = mode === "split" ? ["Split"] : ["You", "Income", "Split", "Goals", "Starting point"];
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial.name);
  const [earner, setEarner] = useState<EarnerType | null>(initial.earner);
  const [income, setIncome] = useState(initial.income ? String(initial.income) : "");
  const [essentials, setEssentials] = useState(initial.essentials ? String(initial.essentials) : "");
  const [dip, setDip] = useState("0");
  const ordered = useMemo(() => templatesFor(earner), [earner]);
  const [tplKey, setTplKey] = useState<string>(initial.template ?? "");
  const tpl = ordered.find((t) => t.key === tplKey) ?? ordered[0];
  const [goals, setGoals] = useState<Goal[]>([]);
  const [savings, setSavings] = useState("");
  const [investments, setInvestments] = useState("");
  const [birth, setBirth] = useState("");
  const [pending, start] = useTransition();

  const inc = parseFloat(income) || 0;
  const ess = parseFloat(essentials) || 0;
  const current = steps[step];

  const toggleGoal = (key: string) => {
    if (goals.some((g) => g.preset === key) && key !== "custom") { setGoals(goals.filter((g) => g.preset !== key)); return; }
    const p = GOAL_PRESETS.find((x) => x.key === key)!;
    const t = p.target ? p.target(ess, earner) : 0;
    setGoals([...goals, { preset: key, name: key === "custom" ? "" : p.name, target: t ? String(t) : "", date: "" }]);
  };
  const setGoal = (i: number, patch: Partial<Goal>) => setGoals(goals.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= goals.length) return;
    const next = [...goals]; [next[i], next[j]] = [next[j], next[i]]; setGoals(next);
  };

  const canNext =
    current === "You" ? !!earner :
    current === "Income" ? inc > 0 && ess >= 0 && essentials !== "" :
    current === "Split" ? !!tpl :
    current === "Goals" ? goals.every((g) => g.name.trim()) : true;

  const submit = () => {
    const payload: OnboardingPayload = {
      mode, name: name.trim(), earner: earner ?? "salaried", income: inc, essentials: ess, dip: parseFloat(dip) || 0, template: tpl.key,
      goals: goals.map((g) => ({ preset: g.preset, name: g.name.trim(), target: parseFloat(g.target) || null, target_date: g.date ? g.date + "-01" : null })),
      savings: parseFloat(savings) || 0, investments: parseFloat(investments) || 0, birth_month: birth || null,
    };
    start(() => finishOnboarding(payload));
  };

  return (
    <div className="wizard">
      {steps.length > 1 && (
        <ol className="steps" aria-label="Setup steps">
          {steps.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} className={i < step ? "done" : ""}><span>{i + 1}</span>{s}</li>)}
        </ol>
      )}

      {current === "You" && (
        <section className="wstep">
          <h2>How do you earn?</h2>
          <p className="muted">This decides which splits and goals we suggest. You can change everything later.</p>
          <div className="choices">
            {EARNER_TYPES.map((t) => (
              <button key={t.key} type="button" className="choice" aria-pressed={earner === t.key} onClick={() => setEarner(t.key)}>
                <b>{t.name}</b><span className="muted small">{t.blurb}</span>
              </button>
            ))}
          </div>
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="w-name">What should we call you?</label>
            <input id="w-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" />
          </div>
        </section>
      )}

      {current === "Income" && (
        <section className="wstep">
          <h2>{earner === "salaried" ? "Your take-home pay" : earner === "business" ? "What the business brings in" : "What comes in each month"}</h2>
          <p className="muted">{earner === "salaried" ? "Use the amount that lands in your bank after CPF." : "A typical month is fine. Use an average of the last few months if it moves around."}</p>
          <div className="formgrid" style={{ maxWidth: 640 }}>
            <div className="field"><label htmlFor="w-inc">{earner === "business" ? "Monthly revenue (S$)" : "Typical monthly income (S$)"}</label>
              <input id="w-inc" className="input mono big-input" inputMode="decimal" type="number" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="6000" /></div>
            <div className="field"><label htmlFor="w-ess">Monthly essentials (S$)</label>
              <input id="w-ess" className="input mono big-input" inputMode="decimal" type="number" value={essentials} onChange={(e) => setEssentials(e.target.value)} placeholder="1600" />
              <span className="muted small">Rent or household share, bills, food, transport, insurance, subscriptions.</span></div>
          </div>
          {earner !== "salaried" && (
            <div className="field" style={{ maxWidth: 320 }}>
              <label htmlFor="w-dip">Income dips in November and December by (%)</label>
              <input id="w-dip" className="input mono" type="number" value={dip} onChange={(e) => setDip(e.target.value)} />
              <span className="muted small">Leave at 0 if your income doesn't drop at year end.</span>
            </div>
          )}
        </section>
      )}

      {current === "Split" && (
        <section className="wstep">
          <h2>How should each month split?</h2>
          <p className="muted">Each option is a well-known approach. The top ones suit {earner ? EARNER_TYPES.find((t) => t.key === earner)!.name.toLowerCase() : "most people"}. The bar shows your own {fmt(inc || 5000)}.</p>
          <div className="choices">
            {ordered.map((t) => {
              const fit = earner ? t.fits.includes(earner) : false;
              return (
                <button key={t.key} type="button" className="choice" aria-pressed={tpl.key === t.key} onClick={() => setTplKey(t.key)}>
                  <span className="row between" style={{ width: "100%" }}><b>{t.name}</b>{fit && <span className="tag">Suits you</span>}</span>
                  <span className="muted small">{t.origin}</span>
                  <span className="small">{t.blurb}</span>
                </button>
              );
            })}
          </div>
          <div className="panel">
            <div className="row between"><h3>{tpl.name} on {fmt(inc || 5000)}</h3></div>
            <SplitBar income={inc || 5000} template={tpl} essentials={ess} />
            <ul className="hints">{tpl.rules.map((r) => <li key={r.name}><b>{r.name}</b> · <span className="muted">{r.hint}</span></li>)}</ul>
          </div>
        </section>
      )}

      {current === "Goals" && (
        <section className="wstep">
          <h2>What are you saving for?</h2>
          <p className="muted">Pick as many as you like. Savings fill them in the order below, so put the most urgent first.</p>
          <div className="chips" style={{ gap: 8 }}>
            {GOAL_PRESETS.map((g) => (
              <button key={g.key} type="button" className="chip goalchip" style={{ ["--c" as string]: `var(--c-${g.color})` }}
                aria-pressed={g.key !== "custom" && goals.some((x) => x.preset === g.key)} onClick={() => toggleGoal(g.key)}>
                <span className="dot" />{g.key === "custom" ? "+ Something else" : g.name}
              </button>
            ))}
          </div>
          <div className="goallist">
            {goals.map((g, i) => {
              const p = GOAL_PRESETS.find((x) => x.key === g.preset)!;
              return (
                <div key={i} className="card" style={{ ["--c" as string]: `var(--c-${p.color})` }}>
                  <div className="row between">
                    <span className="row" style={{ gap: 8 }}><span className="order">{i + 1}</span><span className="dot" /><b>{g.name || "New goal"}</b></span>
                    <span className="row" style={{ gap: 4 }}>
                      <button type="button" className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button type="button" className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === goals.length - 1} aria-label="Move down">↓</button>
                      <button type="button" className="btn danger sm" onClick={() => setGoals(goals.filter((_, j) => j !== i))}>Remove</button>
                    </span>
                  </div>
                  <span className="muted small">{p.blurb}{g.preset === "emergency" && ess ? ` Suggested: ${earner === "salaried" ? 6 : 9} months of essentials.` : ""}</span>
                  <div className="formgrid">
                    <div className="field"><label htmlFor={`g-n-${i}`}>Name</label><input id={`g-n-${i}`} className="input" value={g.name} onChange={(e) => setGoal(i, { name: e.target.value })} /></div>
                    <div className="field"><label htmlFor={`g-t-${i}`}>Target (S$)</label><input id={`g-t-${i}`} className="input mono" type="number" value={g.target} onChange={(e) => setGoal(i, { target: e.target.value })} placeholder="Optional" /></div>
                    <div className="field"><label htmlFor={`g-d-${i}`}>By when</label><input id={`g-d-${i}`} className="input" type="month" value={g.date} onChange={(e) => setGoal(i, { date: e.target.value })} /></div>
                  </div>
                </div>
              );
            })}
            {!goals.length && <div className="notice">No goals yet. Leftover savings will go into one general savings pot.</div>}
          </div>
        </section>
      )}

      {current === "Starting point" && (
        <section className="wstep">
          <h2>Where are you starting from?</h2>
          <p className="muted">Rough numbers are fine. You can add each account separately later.</p>
          <div className="formgrid" style={{ maxWidth: 640 }}>
            <div className="field"><label htmlFor="w-sav">Cash savings today (S$)</label><input id="w-sav" className="input mono big-input" type="number" value={savings} onChange={(e) => setSavings(e.target.value)} placeholder="0" /></div>
            <div className="field"><label htmlFor="w-inv">Investments today (S$)</label><input id="w-inv" className="input mono big-input" type="number" value={investments} onChange={(e) => setInvestments(e.target.value)} placeholder="0" /></div>
            <div className="field"><label htmlFor="w-birth">Birth month (optional, shows your age on the timeline)</label><input id="w-birth" className="input" type="month" value={birth} onChange={(e) => setBirth(e.target.value)} /></div>
          </div>
        </section>
      )}

      <div className="row between wnav">
        {step > 0 ? <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>Back</button> : <span />}
        {step < steps.length - 1
          ? <button type="button" className="btn" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
          : <button type="button" className="btn" disabled={!canNext || pending} onClick={submit}>{pending ? "Setting up…" : mode === "split" ? "Use this split" : "Build my plan"}</button>}
      </div>
    </div>
  );
}
