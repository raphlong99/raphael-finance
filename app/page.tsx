import Nav from "@/components/Nav";
import Dashboard from "@/components/Dashboard";
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

  const dates = [...new Set(d.balances.map((b) => b.as_of))].sort();
  const history = dates.map((dt) => {
    const snap = latestBalances(d.balances, dt);
    const [yy, mm] = dt.split("-").map(Number);
    return { offset: (yy - y) * 12 + (mm - m), net: [...snap.values()].reduce((a, b) => a + b.value, 0) };
  });

  const logged = d.months.find((x) => x.month.startsWith(today.slice(0, 7)) && !x.is_estimate);
  const thisMonth = logged
    ? { income: logged.income, lines: logged.split, logged: true }
    : { income: d.profile.income_estimate, lines: applyRules(d.profile.income_estimate, d.rules, expensesTotal(d.expenses)), logged: false };
  const accounts = d.accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name, kind: a.kind, value: latest.get(a.id)?.value ?? null, as_of: latest.get(a.id)?.as_of ?? null }));
  const hour = Number(new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", hourCycle: "h23" }).format(new Date()));

  return (
    <>
      <Nav current="/" />
      <main className="wrap">
        <header>
          <h1>{greeting(hour)}{d.profile.display_name ? `, ${d.profile.display_name}` : ""}</h1>
        </header>
        <Dashboard profile={d.profile} buckets={buckets} rules={d.rules} expenses={d.expenses} start={start} startMonth={startMonth} history={history} thisMonth={thisMonth} accounts={accounts} />
      </main>
    </>
  );
}
