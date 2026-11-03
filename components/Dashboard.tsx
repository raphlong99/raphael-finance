"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { simulate } from "@/lib/plan";
import { CATEGORY_COLOR, type Bucket, type ExpenseItem, type Profile, type SplitRule } from "@/lib/types";

type Props = {
  profile: Profile;
  buckets: Bucket[];
  rules: SplitRule[];
  expenses: ExpenseItem[];
  start: Record<string, number>;
  startMonth: { y: number; m: number };
  history: { offset: number; net: number }[];
  asOf: string | null;
};

const HORIZONS = [24, 60, 120, 360];
const STEPS = [10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2000000, 5000000];
const nextStep = (v: number) => STEPS.find((s) => s > v) ?? v * 1.2;

export default function Dashboard(props: Props) {
  const { profile, buckets, rules, expenses, start, startMonth, history, asOf } = props;
  const cur = profile.currency === "SGD" ? "S$" : profile.currency + " ";
  const fmt = (v: number) => (v < 0 ? "−" : "") + cur + Math.round(Math.abs(v)).toLocaleString("en-SG");
  const compact = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e6) return cur + (v / 1e6).toFixed(a >= 1e7 ? 0 : 2).replace(/\.?0+$/, "") + "M";
    if (a >= 1e3) return cur + Math.round(v / 1e3) + "k";
    return cur + Math.round(v);
  };
  const dateOf = (m: number, long = false) =>
    new Date(startMonth.y, startMonth.m + m, 1).toLocaleString("en-SG", { month: long ? "long" : "short", year: "numeric" });
  const birth = profile.birth_month ? new Date(profile.birth_month) : null;
  const ageOf = (m: number) => (birth ? Math.floor((startMonth.y * 12 + startMonth.m + m - (birth.getFullYear() * 12 + birth.getMonth())) / 12) : null);
  const fromNow = (m: number) => {
    if (m === 0) return "this month";
    const y = Math.floor(m / 12), mo = m % 12;
    return [y ? `${y} year${y > 1 ? "s" : ""}` : "", mo ? `${mo} month${mo > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ") + " from now";
  };

  const sim = useMemo(
    () => simulate({ profile, buckets, rules, expenses, start, startMonth, months: 480 }),
    [profile, buckets, rules, expenses, start, startMonth]
  );
  const savings = buckets.filter((b) => b.kind === "savings").sort((a, b) => a.fill_order - b.fill_order);
  const invest = buckets.filter((b) => b.kind === "investment");

  const [horizon, setHorizon] = useState(60);
  const [month, setMonth] = useState(12);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const speed = horizon > 120 ? 40 : horizon > 60 ? 70 : 130;
    const t = setInterval(() => setMonth((m) => (m >= horizon - 1 ? (setPlaying(false), m) : m + 1)), speed);
    return () => clearInterval(t);
  }, [playing, horizon]);
  useEffect(() => { if (month > horizon - 1) setMonth(horizon - 1); }, [horizon, month]);

  const s = sim[Math.min(month, sim.length - 1)];
  const first = (test: (x: (typeof sim)[number]) => boolean) => sim.findIndex(test);

  const miles = [
    ...savings.filter((b) => b.target).map((b) => ({ color: b.color, label: `${b.name} full (${compact(b.target!)})`, m: first((x) => x.values[b.id] >= b.target! - 0.5) })),
    ...(invest.length ? [{ color: "blue", label: `Investments pass ${compact(100000)}`, m: first((x) => x.invested >= 1e5) }] : []),
    { color: "blue", label: `Net worth passes ${compact(250000)}`, m: first((x) => x.net >= 2.5e5) },
    { color: "blue", label: `Net worth passes ${compact(1000000)}`, m: first((x) => x.net >= 1e6) },
  ];

  if (!buckets.length || profile.income_estimate <= 0) {
    return (
      <div className="panel">
        <h2>Set up your plan</h2>
        <p className="muted">Add your typical monthly income, your buckets and how income is split. The tanks fill in once those are in.</p>
        <Link className="btn" href="/setup">Go to Setup</Link>
      </div>
    );
  }

  return (
    <>
      <section className="panel deck" aria-label="Timeline controls">
        <div className="when">
          <span className="eyebrow">Showing end of</span>
          <span className="date">{dateOf(month)}</span>
          <span className="muted small">{ageOf(month) !== null ? `Age ${ageOf(month)} · ` : ""}{fromNow(month)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div className="trackrow">
            <button className="play" onClick={() => { if (!playing && month >= horizon - 1) setMonth(0); setPlaying(!playing); }} aria-label={playing ? "Pause" : "Play the months"}>
              <svg viewBox="0 0 16 16">{playing ? <path d="M3 1.5h3.5v13H3zM9.5 1.5H13v13H9.5z" /> : <path d="M3 1.5v13l11-6.5z" />}</svg>
            </button>
            <input type="range" min={0} max={horizon - 1} value={month} aria-label="Month" onChange={(e) => { setPlaying(false); setMonth(+e.target.value); }} />
          </div>
          <div className="chips">
            {HORIZONS.map((h) => (
              <button key={h} className="chip" aria-pressed={horizon === h} onClick={() => setHorizon(h)}>{h / 12} years</button>
            ))}
            <span style={{ flex: 1 }} />
            <button className="chip" aria-pressed={month === 0} onClick={() => { setPlaying(false); setMonth(0); }}>Jump to now</button>
          </div>
        </div>
      </section>

      <section className="tanks" aria-label="Buckets">
        {savings.map((b, i) => {
          const v = s.values[b.id] ?? 0;
          const scale = b.target ?? nextStep(v);
          const prevFull = savings.slice(0, i).every((p) => p.target === null || (s.values[p.id] ?? 0) >= p.target - 0.5);
          const full = b.target !== null && v >= b.target - 0.5;
          return (
            <Tank key={b.id} color={b.color} name={b.name} value={fmt(v)} frac={v / scale} targetLabel={compact(scale)}
              sub={full ? <>Target reached<span className="pill" style={{ ["--c" as string]: `var(--c-${b.color})` }}>Full</span></>
                : !prevFull ? <>Fills after {savings[i - 1]?.name.toLowerCase()}</>
                : b.target ? <>{Math.round((v / b.target) * 100)}% of {fmt(b.target)} · {fmt(b.target - v)} to go</> : <>No target · next marker {compact(scale)}</>} />
          );
        })}
        {invest.length > 0 && (() => {
          const step = nextStep(s.invested);
          let base = 0;
          return (
            <div className="tankcard" style={{ ["--c" as string]: `var(--c-${invest[0].color})` }}>
              <div className="tank">
                {invest.map((b, i) => {
                  const h = Math.min((s.values[b.id] ?? 0) / step, 1.12) * 85;
                  const el = <div key={b.id} className={`water ${i === invest.length - 1 ? "top" : ""} ${h <= 0.2 ? "empty" : ""}`} style={{ ["--c" as string]: `var(--c-${b.color})`, height: `${h}%`, bottom: `${base}%` }} />;
                  base += h;
                  return el;
                })}
                <div className="target"><span>{compact(step)}</span></div>
              </div>
              <div className="tankname"><span className="dot" />Investments</div>
              <div className="tankval">{fmt(s.invested)}</div>
              <div className="tanksub">
                {invest.map((b, i) => (
                  <span key={b.id} style={{ color: `var(--c-${b.color})` }}>{i ? " · " : ""}{b.name} {compact(s.values[b.id] ?? 0)}</span>
                ))}
                <br />Next marker {compact(step)}
              </div>
            </div>
          );
        })()}
      </section>

      <section className="long">
        <div className="panel">
          <span className="eyebrow">Net worth at this month</span>
          <div className="big">{fmt(s.net)}</div>
          <div className="muted small">{asOf ? `Starting from balances logged ${asOf}` : "No balances logged yet"}</div>
          <ul className="miles">
            {miles.map((it) => {
              const done = it.m >= 0 && it.m <= month;
              const a = it.m >= 0 ? ageOf(it.m) : null;
              return (
                <li key={it.label} className={done ? "done" : ""}>
                  <span className="dot" style={{ ["--c" as string]: `var(--c-${it.color})` }} />
                  <span>{it.label}</span>
                  <span className="dt">{it.m < 0 ? "Beyond 40 years" : dateOf(it.m)}
                    {it.m >= 0 && <small>{a !== null ? `age ${a} · ` : ""}{done ? "reached" : fromNow(it.m)}</small>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="panel">
          <div className="row between"><h2>The long view</h2><span className="muted small">Tap the chart to jump to a month</span></div>
          <Chart sim={sim} buckets={[...invest, ...savings]} horizon={horizon} month={month} history={history} onPick={(m) => { setPlaying(false); setMonth(m); }} compact={compact} startMonth={startMonth} />
          <div className="legend">
            {[...invest, ...savings].map((b) => (<span key={b.id}><i className="dot" style={{ ["--c" as string]: `var(--c-${b.color})` }} />{b.name}</span>))}
            {history.length > 0 && <span><i className="dot" style={{ ["--c" as string]: "var(--ink)" }} />Actual, from check-ins</span>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="row between"><h2>{dateOf(month, true)} split</h2><span className="mono">Income {fmt(s.income)}</span></div>
        {(() => {
          const lines = s.lines.filter((l) => l.amount > 0);
          const total = lines.reduce((a, l) => a + l.amount, 0) || 1;
          const colorOf = (l: (typeof lines)[number]) => l.color ?? (l.bucket_id ? buckets.find((b) => b.id === l.bucket_id)?.color : null) ?? CATEGORY_COLOR[l.category];
          return (
            <>
              <div className="split">{lines.map((l, i) => <div key={i} title={l.name} style={{ ["--c" as string]: `var(--c-${colorOf(l)})`, flexBasis: `${(l.amount / total) * 100}%` }} />)}</div>
              <div className="splitlist">
                {s.lines.map((l, i) => (
                  <div key={i}><span className="dot" style={{ ["--c" as string]: `var(--c-${colorOf(l)})` }} /><span>{l.name}</span><b>{fmt(l.amount)}</b></div>
                ))}
              </div>
            </>
          );
        })()}
      </section>
      <p className="muted small" style={{ maxWidth: "70ch" }}>
        Projections use steady yearly returns and your income estimate. Real markets rise and fall, so treat the dates as a guide.
      </p>
    </>
  );
}

function Tank({ color, name, value, frac, targetLabel, sub }: { color: string; name: string; value: string; frac: number; targetLabel: string; sub: React.ReactNode }) {
  const f = Math.max(0, Math.min(frac, 1.12));
  return (
    <div className="tankcard" style={{ ["--c" as string]: `var(--c-${color})` }}>
      <div className="tank">
        <div className={`water top ${f <= 0.002 ? "empty" : ""}`} style={{ height: `${f * 85}%` }} />
        <div className="target"><span>{targetLabel}</span></div>
      </div>
      <div className="tankname"><span className="dot" />{name}</div>
      <div className="tankval">{value}</div>
      <div className="tanksub">{sub}</div>
    </div>
  );
}

function Chart({ sim, buckets, horizon, month, history, onPick, compact, startMonth }: {
  sim: ReturnType<typeof simulate>; buckets: Bucket[]; horizon: number; month: number;
  history: { offset: number; net: number }[]; onPick: (m: number) => void; compact: (v: number) => string; startMonth: { y: number; m: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const histLen = history.length ? Math.max(0, -Math.min(...history.map((h) => h.offset))) : 0;
  const L = 54, R = 10, T = 10, B = 26;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      const pw = W - L - R, ph = H - T - B;
      const data = sim.slice(0, horizon);
      const span = horizon - 1 + histLen;
      let max = Math.max(...data.map((d) => d.net), ...history.map((h) => h.net), 1) * 1.08;
      const mag = Math.pow(10, Math.floor(Math.log10(max)));
      const stepY = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => max / x <= 5) ?? mag;
      max = Math.ceil(max / stepY) * stepY;
      const X = (i: number) => L + ((i + histLen) / Math.max(span, 1)) * pw;
      const Y = (v: number) => T + ph - (v / max) * ph;
      ctx.strokeStyle = css("--line"); ctx.lineWidth = 1; ctx.fillStyle = css("--muted");
      ctx.font = "11px " + css("--f-mono"); ctx.textAlign = "right"; ctx.textBaseline = "middle";
      for (let v = 0; v <= max + 1; v += stepY) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke(); ctx.fillText(compact(v), L - 6, y); }
      const base = new Array(data.length).fill(0);
      for (const b of buckets) {
        const top = data.map((d, i) => base[i] + Math.max(d.values[b.id] ?? 0, 0));
        ctx.beginPath(); ctx.moveTo(X(0), Y(top[0]));
        for (let i = 1; i < data.length; i++) ctx.lineTo(X(i), Y(top[i]));
        for (let i = data.length - 1; i >= 0; i--) ctx.lineTo(X(i), Y(base[i]));
        ctx.closePath(); ctx.fillStyle = css(`--c-${b.color}`); ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
        for (let i = 0; i < data.length; i++) base[i] = top[i];
      }
      if (history.length) {
        ctx.strokeStyle = css("--ink"); ctx.lineWidth = 2; ctx.beginPath();
        history.forEach((h, i) => (i ? ctx.lineTo(X(h.offset), Y(h.net)) : ctx.moveTo(X(h.offset), Y(h.net))));
        ctx.stroke(); ctx.fillStyle = css("--ink");
        history.forEach((h) => { ctx.beginPath(); ctx.arc(X(h.offset), Y(h.net), 3, 0, Math.PI * 2); ctx.fill(); });
      }
      ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = css("--muted");
      const every = horizon <= 60 ? 1 : horizon <= 120 ? 2 : 5;
      for (let i = -histLen; i < data.length; i++) {
        if ((startMonth.m + i + 1200) % 12 !== 0) continue;
        const yr = startMonth.y + Math.floor((startMonth.m + i) / 12);
        if ((yr - startMonth.y) % every !== 0) continue;
        ctx.fillText(String(yr), X(i), T + ph + 8);
      }
      if (month < horizon) {
        const x = Math.round(X(month)) + 0.5;
        ctx.strokeStyle = css("--ink"); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = css("--ink"); ctx.beginPath(); ctx.arc(x, Y(data[month].net), 4, 0, Math.PI * 2); ctx.fill();
      }
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(cv);
    const mq = window.matchMedia("(prefers-color-scheme: dark)"); mq.addEventListener("change", draw);
    return () => { ro.disconnect(); mq.removeEventListener("change", draw); };
  }, [sim, buckets, horizon, month, history, histLen, compact, startMonth]);

  return (
    <div className="chartwrap">
      <canvas ref={ref} role="img" aria-label="Stacked chart of every bucket over time"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const span = horizon - 1 + histLen;
          const i = Math.round(((e.clientX - r.left - L) / (r.width - L - R)) * span) - histLen;
          onPick(Math.max(0, Math.min(horizon - 1, i)));
        }} />
    </div>
  );
}
