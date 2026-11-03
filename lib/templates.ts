import type { Category, EarnerType, RuleKind } from "./types";

export type RuleDraft = {
  name: string;
  kind: RuleKind;
  value?: number;
  min_amount?: number;
  round_mode?: "up" | "down" | "none";
  round_to?: number;
  category: Category;
  /** "invest" sends the money to the investments bucket; omitted means spent, or poured into goals for the save category. */
  to?: "invest";
  color?: string;
  hint: string;
};

export type Template = {
  key: string;
  name: string;
  origin: string;
  blurb: string;
  fits: EarnerType[];
  rules: RuleDraft[];
};

export const EARNER_TYPES: { key: EarnerType; name: string; blurb: string }[] = [
  { key: "salaried", name: "Salaried", blurb: "A steady monthly pay cheque. CPF is taken off before it reaches you." },
  { key: "freelancer", name: "Freelancer or self-employed", blurb: "Income moves month to month, and you set aside your own tax and MediSave." },
  { key: "business", name: "Business owner", blurb: "Money comes into the business first, and you pay yourself from it." },
  { key: "mixed", name: "A mix", blurb: "A job plus side income, or several sources at once." },
];

export const TEMPLATES: Template[] = [
  {
    key: "freelancer",
    name: "Freelancer split",
    origin: "Tax first, then costs",
    blurb: "Set aside tax and MediSave before anything else, cover your essentials, invest a fixed slice, keep some for fun, and send the rest to your goals.",
    fits: ["freelancer", "mixed"],
    rules: [
      { name: "Tax + MediSave", kind: "percent", value: 12, round_mode: "up", round_to: 10, category: "tax", hint: "Kept aside for IRAS and MediSave" },
      { name: "Essentials", kind: "expenses", round_mode: "up", round_to: 50, category: "needs", hint: "Your monthly essentials" },
      { name: "Investing", kind: "percent_min", value: 15, min_amount: 500, round_mode: "down", round_to: 50, category: "invest", to: "invest", hint: "15%, never below S$500" },
      { name: "Fun", kind: "percent", value: 8, round_mode: "down", round_to: 10, category: "fun", hint: "Guilt-free spending" },
      { name: "Goals", kind: "remainder", round_mode: "down", round_to: 50, category: "save", hint: "Everything left fills your goals in order" },
    ],
  },
  {
    key: "50-30-20",
    name: "50 / 30 / 20",
    origin: "Popularised by Elizabeth Warren",
    blurb: "Half for needs, 30% for wants, 20% for savings and goals. Simple and easy to stick to on a steady salary.",
    fits: ["salaried", "mixed"],
    rules: [
      { name: "Needs", kind: "percent", value: 50, category: "needs", hint: "Rent, bills, food, transport" },
      { name: "Wants", kind: "percent", value: 30, category: "fun", hint: "Dining out, hobbies, shopping" },
      { name: "Savings", kind: "remainder", round_mode: "down", round_to: 10, category: "save", hint: "20% to your goals" },
    ],
  },
  {
    key: "pay-yourself-first",
    name: "Pay yourself first",
    origin: "A classic savings habit",
    blurb: "Savings and investing come off the top the day you're paid. Whatever is left is yours to spend, with no tracking needed.",
    fits: ["salaried", "freelancer", "mixed"],
    rules: [
      { name: "Investing", kind: "percent", value: 10, round_mode: "down", round_to: 50, category: "invest", to: "invest", hint: "Off the top" },
      { name: "Goals", kind: "percent", value: 20, round_mode: "down", round_to: 50, category: "save", hint: "Off the top, into your goals" },
      { name: "Spend freely", kind: "remainder", category: "other", hint: "The rest, no tracking" },
    ],
  },
  {
    key: "profit-first",
    name: "Profit First",
    origin: "From Mike Michalowicz's book",
    blurb: "Take profit, your pay and tax out of every dollar the business earns, and run the business on what's left.",
    fits: ["business"],
    rules: [
      { name: "Profit", kind: "percent", value: 5, round_mode: "down", round_to: 10, category: "save", hint: "Into your goals" },
      { name: "Owner's pay", kind: "percent", value: 50, round_mode: "down", round_to: 10, category: "needs", hint: "What you pay yourself" },
      { name: "Tax", kind: "percent", value: 15, round_mode: "up", round_to: 10, category: "tax", hint: "Set aside for IRAS" },
      { name: "Running costs", kind: "remainder", category: "other", hint: "Rent, tools, staff, ads" },
    ],
  },
  {
    key: "six-jars",
    name: "6 Jars",
    origin: "From T. Harv Eker",
    blurb: "Six jars, each with a job: necessities, financial freedom, long-term savings, learning, play and giving.",
    fits: ["salaried", "freelancer", "business", "mixed"],
    rules: [
      { name: "Necessities", kind: "percent", value: 55, category: "needs", hint: "55%" },
      { name: "Financial freedom", kind: "percent", value: 10, category: "invest", to: "invest", hint: "10%, invested" },
      { name: "Long-term savings", kind: "percent", value: 10, category: "save", hint: "10%, into your goals" },
      { name: "Learning", kind: "percent", value: 10, category: "other", color: "violet", hint: "10%, courses and books" },
      { name: "Play", kind: "percent", value: 10, category: "fun", hint: "10%" },
      { name: "Giving", kind: "remainder", category: "other", color: "amber", hint: "5%, gifts and charity" },
    ],
  },
];

export type GoalPreset = { key: string; name: string; blurb: string; color: string; target?: (essentials: number, earner: EarnerType | null) => number };

export const GOAL_PRESETS: GoalPreset[] = [
  {
    key: "emergency", name: "Emergency fund", color: "teal",
    blurb: "Months of essentials kept in cash, in case income stops.",
    target: (e, t) => Math.ceil((e * (t === "salaried" ? 6 : 9)) / 500) * 500,
  },
  { key: "home", name: "Home", color: "green", blurb: "Down payment, renovation, furniture." },
  { key: "wedding", name: "Wedding", color: "rose", blurb: "Banquet, rings, photos." },
  { key: "travel", name: "Travel", color: "blue", blurb: "The next big trip." },
  { key: "business", name: "Start a business", color: "amber", blurb: "Set-up costs plus months of runway." },
  { key: "car", name: "Car", color: "slate", blurb: "Down payment, or buying outright." },
  { key: "parents", name: "Support family", color: "violet", blurb: "Money set aside for parents or siblings." },
  { key: "custom", name: "Something else", color: "coral", blurb: "Name it yourself." },
];

export function templatesFor(t: EarnerType | null) {
  if (!t) return TEMPLATES;
  return [...TEMPLATES].sort((a, b) => Number(b.fits.includes(t)) - Number(a.fits.includes(t)));
}
