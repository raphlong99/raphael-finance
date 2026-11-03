import Nav from "@/components/Nav";
import Dashboard from "@/components/Dashboard";
import { loadUserData, todayISO } from "@/lib/data";
import { bucketStart, latestBalances } from "@/lib/plan";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const d = await loadUserData();
  if (!d) redirect("/login");

  const today = todayISO();
  const [y, m] = today.split("-").map(Number);
  const startMonth = { y, m: m - 1 };
  const buckets = d.buckets.filter((b) => !b.archived);
  const latest = latestBalances(d.balances);
  const start = bucketStart(buckets, latest);
  const asOf = [...latest.values()].reduce<string | null>((a, b) => (!a || b.as_of > a ? b.as_of : a), null);

  // Actual net worth at each logged date, using each account's latest balance on or before that date.
  const dates = [...new Set(d.balances.map((b) => b.as_of))].sort();
  const history = dates.map((dt) => {
    const snap = latestBalances(d.balances, dt);
    const [yy, mm] = dt.split("-").map(Number);
    return { offset: (yy - y) * 12 + (mm - m), net: [...snap.values()].reduce((a, b) => a + b.value, 0) };
  });

  return (
    <>
      <Nav current="/" />
      <main className="wrap">
        <header>
          <div className="eyebrow">{d.profile.display_name ? `${d.profile.display_name}'s plan` : "Your plan"}</div>
          <h1>Where the money goes</h1>
        </header>
        <Dashboard profile={d.profile} buckets={buckets} rules={d.rules} expenses={d.expenses} start={start} startMonth={startMonth} history={history} asOf={asOf} />
      </main>
    </>
  );
}
