# Buckets

A personal finance planner. Each month's income is split by your own rules, and the money left over fills your savings buckets in order while investment buckets grow. Any number of people can sign up; each person only ever sees their own data.

## How it's built

- **Next.js 15** (App Router, server actions) on Vercel
- **Supabase** for Postgres, email sign-in and row level security

### Data model

| Table | What it holds |
|---|---|
| `profiles` | Name, birth month, currency, projection assumptions (income estimate, growth, seasonal changes, cash interest) |
| `accounts` | Where money sits: banks, brokerages, insurance-linked plans, CPF |
| `buckets` | What money is for. Savings buckets fill by `fill_order` up to `target`; investment buckets grow at `expected_return`. A bucket can be linked to the account that holds it. |
| `split_rules` | How income is divided: `percent`, `fixed`, `percent_min`, `expenses` (sum of in-force expenses) or `remainder`. Each rule can send money to a bucket. |
| `expense_items` | Monthly costs, each with an in-force toggle |
| `months` | Logged income per month, with the split saved as it was at the time |
| `balances` | Balance snapshots per account and date |
| `holdings` | Positions inside a brokerage account |
| `policies` | Insurance policies, premiums, due dates and cover |

Every table has `user_id` and an RLS policy limiting rows to `auth.uid()`. New users get a profile, an "Emergency fund" bucket and two starter rules (Needs, Savings) from the `on_auth_user_created` trigger.

The projection engine is in `lib/plan.ts` (`applyRules`, `bucketStart`, `simulate`).

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Deploy

1. Import the repo in Vercel and add the two variables from `.env.example`.
2. In Supabase → Authentication → URL Configuration, set **Site URL** to the Vercel URL and add `https://<your-vercel-domain>/auth/callback` (and `http://localhost:3000/auth/callback`) to **Redirect URLs**.

## Database

Migrations live in `supabase/migrations`. `supabase/seed/raphael.sql` is a one-off import of Raphael's own numbers, run after his first sign-in.
