import Nav from "@/components/Nav";
import Dashboard from "@/components/Dashboard";
import MoneyMap, { type Pot } from "@/components/MoneyMap";
import Protection from "@/components/Protection";
import { loadUserData, todayISO } from "@/lib/data";
import { applyRules, bucketStart, expensesTotal, latestBalances } from "@/lib/plan";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function greeting(hour: number) {
  return hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function Home() {
  const d = await loadUserData();
  if (!d) redirect("/login");
  if (!d.profile.onboarded) redirect("/welcome");

  const today = todayISO();
  const [y, m] = today.split("-").map(Number);
  const startMonth = { y, m: m - 1 };
  const buckets = d.buckets.filter((b) => !b.archived);
  const latest = latestBalances(d.balances);
  const start = bucketStart(buckets, latest);

  // Only accounts still in use count; archived ones (like money set aside for something else) are left out.
  const liveAcc = new Set(d.accounts.filter((a) => !a.archived).map((a) => a.id));
  const liveBal = d.balances.filter((b) => liveAcc.has(b.account_id));
  const dates = [...new Set(liveBal.map((b) => b.as_of))].sort();
  const history = dates.map((dt) => {
    const snap = latestBalances(liveBal, dt);
    const [yy, mm] = dt.split("-").map(Number);
    return { offset: (yy - y) * 12 + (mm - m), net: [...snap.values()].reduce((a, b) => a + b.value, 0) };
  });

  const logged = d.months.find((x) => x.month.startsWith(today.slice(0, 7)) && !x.is_estimate);
  const thisMonth = logged
    ? { income: logged.income, lines: logged.split, logged: true }
    : { income: d.profile.income_estimate, lines: applyRules(d.profile.income_estimate, d.rules, expensesTotal(d.expenses)), logged: false };
  const pots: Pot[] = d.accounts.filter((a) => !a.archived).map((a) => {
    const holds = buckets.filter((b) => b.account_id === a.id && b.kind === "savings").sort((x, z) => x.fill_order - z.fill_order)
      .map((b) => ({ id: b.id, name: b.name, color: b.color, value: start[b.id] ?? 0, target: b.target }));
    const pol = d.policies.find((p) => p.account_id === a.id && p.surrender_value !== null);
    const group: Pot["group"] = a.kind === "cpf" ? "cpf" : a.kind === "policy" ? "insurance" : a.kind === "brokerage" || a.kind === "ilp" ? "invest" : holds.length ? "goals" : "spending";
    return { id: a.id, name: a.name, kind: a.kind, institution: a.institution, value: latest.get(a.id)?.value ?? null, as_of: latest.get(a.id)?.as_of ?? null, group, holds,
      surrender: pol && a.kind !== "policy" ? { value: pol.surrender_value!, as_of: pol.surrender_as_of } : null };
  });
  // Money in accounts that no bucket projects (spending, policy cash values) is held flat in the projection.
  const linked = new Set(buckets.map((b) => b.account_id).filter(Boolean));
  const unprojected = pots.filter((p) => !linked.has(p.id)).reduce((s, p) => s + (p.value ?? 0), 0);
  const hour = Number(new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", hourCycle: "h23" }).format(new Date()));

  return (
    <>
      <Nav current="/" />
      <main className="wrap">
        <header>
          <h1>{greeting(hour)}{d.profile.display_name ? `, ${d.profile.display_name}` : ""}</h1>
        </header>
        <Dashboard profile={d.profile} buckets={buckets} rules={d.rules} expenses={d.expenses} start={start} startMonth={startMonth} history={history} thisMonth={thisMonth} unprojected={unprojected}
          money={<MoneyMap pots={pots} currency={d.profile.currency} />}
          protection={d.policies.length ? <Protection policies={d.policies} today={today} yearlyIncome={d.profile.income_estimate * 12} compact /> : null} />
      </main>
    </>
  );
}
