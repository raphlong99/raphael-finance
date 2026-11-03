// What you're covered for, against a rule-of-thumb target.
// Rule of thumb (Life Insurance Association Singapore): death and total permanent disability
// cover of about 9 times yearly income, critical illness about 4 times.
import Link from "next/link";
import type { Policy } from "@/lib/types";

type Row = { key: string; label: string; have: number; planned: number; target: number | null; note: string };

export function coverSummary(policies: Policy[], today: string, yearlyIncome: number) {
  const sum = (test: RegExp, live: boolean) =>
    policies.filter((p) => p.in_force === live).reduce((s, p) => s + p.cover
      .filter((c) => c.amount && test.test(c.type) && !/accident/i.test(c.type) && !(c.until && c.until < today))
      .reduce((a, c) => a + (c.amount ?? 0), 0), 0);
  const accident = policies.filter((p) => p.in_force).flatMap((p) => p.cover).filter((c) => /accident/i.test(c.type) && c.amount && !(c.until && c.until < today));
  const hospital = policies.filter((p) => p.in_force && p.kind === "hospital");
  const rows: Row[] = [
    { key: "death", label: "Death", have: sum(/death/i, true), planned: sum(/death/i, false), target: yearlyIncome * 9, note: "9× yearly income" },
    { key: "tpd", label: "Total permanent disability (TPD)", have: sum(/tpd|disab/i, true), planned: sum(/tpd|disab/i, false), target: yearlyIncome * 9, note: "9× yearly income" },
    { key: "ci", label: "Critical illness", have: sum(/\bci\b|critical/i, true), planned: sum(/\bci\b|critical/i, false), target: yearlyIncome * 4, note: "4× yearly income" },
  ];
  return { rows, accident, hospital };
}

export default function Protection({ policies, today, yearlyIncome, compact }: { policies: Policy[]; today: string; yearlyIncome: number; compact?: boolean }) {
  const { rows, accident, hospital } = coverSummary(policies, today, yearlyIncome);
  const k = (v: number) => (v >= 1e6 ? `S$${+(v / 1e6).toFixed(2)}M` : v >= 1000 ? `S$${Math.round(v / 1000)}k` : `S$${Math.round(v)}`);
  const accDeath = accident.filter((c) => /death/i.test(c.type)).reduce((s, c) => s + (c.amount ?? 0), 0);
  const accTpd = accident.filter((c) => /tpd|disab/i.test(c.type)).reduce((s, c) => s + (c.amount ?? 0), 0);
  const limit = hospital.flatMap((p) => p.cover).find((c) => /hospital/i.test(c.type));

  return (
    <section className="panel protect" aria-label="Your protection">
      <div className="row between">
        <div>
          <span className="eyebrow">Protection</span>
          <h2>What you're covered for</h2>
        </div>
        {compact && <Link href="/insurance" className="btn ghost sm">Insurance</Link>}
      </div>

      <div className="covers">
        {rows.map((r) => {
          const scale = Math.max(r.target ?? 0, r.have + r.planned) || 1;
          const pct = (r.have / scale) * 100;
          const ppct = (r.planned / scale) * 100;
          const gap = r.target ? Math.max(0, r.target - r.have) : 0;
          const tone = !r.target ? "" : r.have >= r.target ? "good" : r.have + r.planned >= r.target * 0.6 ? "warn" : "bad";
          return (
            <div key={r.key} className="cover">
              <div className="row between" style={{ gap: 8 }}>
                <b>{r.label}</b>
                <span className="mono">{k(r.have)}{r.target ? <span className="muted"> of ~{k(r.target)}</span> : null}</span>
              </div>
              <div className="covbar" role="img" aria-label={`${r.label}: ${k(r.have)} covered${r.planned ? `, ${k(r.planned)} planned` : ""}${r.target ? `, suggested ${k(r.target)}` : ""}`}>
                <i className="have" style={{ width: `${pct}%` }} />
                {r.planned > 0 && <i className="planned" style={{ left: `${pct}%`, width: `${ppct}%` }} />}
                {r.target ? <span className="mark" style={{ left: `${Math.min(100, (r.target / scale) * 100)}%` }} /> : null}
              </div>
              <span className={`small status ${tone}`} style={{ marginTop: 0 }}>
                {r.target && gap === 0 ? "Covered to the rule of thumb" : r.target ? `${k(gap)} short of ${r.note}` : ""}
                {r.planned > 0 && <span className="muted" style={{ fontWeight: 500 }}> · {k(r.planned)} planned, not bought yet</span>}
              </span>
            </div>
          );
        })}
      </div>

      <div className="covtiles">
        <div className={`covtile ${hospital.length ? "ok" : "no"}`}>
          <span className="eyebrow">Hospital</span>
          <b>{hospital.length ? "Private hospital plan" : "No hospital plan"}</b>
          <span className="muted small">{limit?.amount ? `${k(limit.amount)} a year limit` : hospital.length ? "Integrated Shield Plan" : "Add your MediShield or Integrated Shield Plan"}{hospital.length > 1 ? " · with rider" : ""}</span>
        </div>
        <div className={`covtile ${accDeath ? "ok" : "no"}`}>
          <span className="eyebrow">Accidents only</span>
          <b>{accDeath || accTpd ? `${k(Math.max(accDeath, accTpd))} payout` : "None"}</b>
          <span className="muted small">{accDeath || accTpd ? `Death ${k(accDeath)} · TPD ${k(accTpd)}. Pays only if an accident causes it` : "Personal accident cover"}</span>
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Targets are the Life Insurance Association of Singapore (LIA) rule of thumb, based on {k(yearlyIncome)} a year of income. Dashed = planned. Line = suggested.</p>
    </section>
  );
}
