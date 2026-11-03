export const money = (v: number, cur = "SGD") => {
  const sym = cur === "SGD" ? "S$" : cur + " ";
  return (v < 0 ? "−" : "") + sym + Math.round(Math.abs(v)).toLocaleString("en-SG");
};

export const compactMoney = (v: number, cur = "SGD") => {
  const sym = cur === "SGD" ? "S$" : cur + " ";
  const a = Math.abs(v);
  if (a >= 1e6) return sym + (v / 1e6).toFixed(a >= 1e7 ? 0 : 2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e3) return sym + Math.round(v / 1e3) + "k";
  return sym + Math.round(v);
};

export const monthLabel = (start: { y: number; m: number }, offset: number, long = false) =>
  new Date(start.y, start.m + offset, 1).toLocaleString("en-SG", { month: long ? "long" : "short", year: "numeric" });

/** Whole months from the start month to the month of an ISO date. */
export const monthsUntil = (start: { y: number; m: number }, iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return (y - start.y) * 12 + (m - 1 - start.m);
};

export const spanText = (months: number) => {
  if (months <= 0) return "this month";
  const y = Math.floor(months / 12), mo = months % 12;
  return [y ? `${y} year${y > 1 ? "s" : ""}` : "", mo ? `${mo} month${mo > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ");
};

export type GoalStatus = { tone: "good" | "warn" | "bad" | "muted"; text: string };

export function goalStatus(opts: {
  eta: number; // first month index reaching target, -1 if never within the projection
  due: number | null; // month index of target date
  start: { y: number; m: number };
  hasTarget: boolean;
  waiting: boolean; // an earlier goal is still filling
}): GoalStatus {
  const { eta, due, start, hasTarget, waiting } = opts;
  if (!hasTarget) return { tone: "muted", text: "No target set" };
  if (eta === 0) return { tone: "good", text: "Reached" };
  if (eta < 0) return { tone: "bad", text: "Not reached within 40 years" };
  const when = monthLabel(start, eta);
  if (due === null) return { tone: waiting ? "muted" : "good", text: `${waiting ? "Starts after earlier goals · " : ""}Reached by ${when}` };
  if (eta <= due) return { tone: "good", text: `On track · reached by ${when}` };
  return { tone: "warn", text: `${spanText(eta - due)} behind · reached ${when}` };
}
