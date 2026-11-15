# From Save to Build — Test & Validate module

Reusable product-testing infrastructure: creators publish structured testing rounds, testers apply, get
approved, onboard, complete scenario-based tasks, report issues and submit a verdict; creators get
evidence-linked findings they can turn into improvement tasks and retest on the next release.

**Pocket Budget is seed data, not code.** Its application form, five tasks, cohort and eligibility are rows
in the database. A second seeded product (FocusFlow, a different category, form and task types) proves the
point, and a creator can configure a new product entirely from the app.

> This folder is self-contained. It lives in the Dabur research repository only because no
> From Save to Build repository existed; nothing outside `from-save-to-build/` was touched.

## Lifecycle covered
Discover → Apply → Get approved → Onboard → Test → Report → Review → Validate → Improve → Retest

## Layout
| Path | What |
|---|---|
| `supabase/migrations/` | Schema (27 tables), guards, Row Level Security, workflow functions, read models |
| `supabase/seed.sql` | Demo accounts, Pocket Budget, FocusFlow, task templates (all flagged as demo) |
| `supabase/functions/` | `generate-validation-report` Edge Function + shared report engine |
| `mobile/` | Expo SDK 58 / Expo Router / TypeScript app (35 route files, iOS-first, runs on web) |
| `dev/gateway.ts`, `supabase/dev/` | **Development-only** substitute for Supabase (see below) |
| `tests/` | 40 automated tests: acceptance scenarios A–J on real PostgreSQL, report engine, client logic |
| `e2e/` | Browser run of the whole lifecycle through the real UI (14 steps) |
| `docs/STATUS.md` | What is verified, what is not, assumptions, known gaps |

## Run it locally (PostgreSQL 16 + Node 22, no Docker)
```bash
npm install && (cd mobile && npm install)
npm run db:reset          # shim + migrations + seed into database fstb_dev
npm run gateway           # prints EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
cp mobile/.env.example mobile/.env.local   # paste the two values
(cd mobile && npx expo start)              # press w for web, or open in Expo Go / a simulator
```
Demo sign-ins (password `demo-password-1`): `creator@…`, `tester@…`, `tester2@demo.fromsavetobuild.test`.

```bash
npm test        # rebuilds fstb_test, runs all automated tests
e2e/up.sh       # fresh database + web build + browser run of the full lifecycle
```

## Deploying to a real Supabase project
```bash
supabase link --project-ref <ref>
supabase db push                                   # applies supabase/migrations
supabase functions deploy generate-validation-report
supabase secrets set OPENAI_API_KEY=… OPENAI_MODEL=…   # optional; without it reports are rule-based and say so
```
Then set the project URL and anon key in `mobile/.env.local`. Do **not** run `supabase/dev/*` or the gateway
against a hosted project, and remove or change the demo accounts in `seed.sql` first.

## Development-mode substitutes (clearly not the real thing)
| Real service | Local substitute | Limits |
|---|---|---|
| Supabase Auth, PostgREST, Storage | `dev/gateway.ts` + `supabase/dev/00_supabase_shim.sql` | Email+password only; RPC and single-table eq/in filters; files on local disk. Every query still runs under the caller's role, so the real RLS and functions decide access. |
| OpenAI | Deterministic rule-based engine | Used when `OPENAI_API_KEY` is absent or the call fails. Reports are labelled "Rule-based analysis (no AI model connected)". |

## Integrity rules enforced in the database, not the UI
- An application never becomes an assignment by itself; only an approved application can be assigned.
- Approvals and assignments take a row lock on the round, so a cohort cannot be overbooked.
- Sessions pin the exact release and the exact version of every task; editing a task creates a new version.
- Bug reports, verdicts, feedback, consents and finished reports are immutable. Triage, corrections and
  creator edits are separate rows.
- Evidence is only stored for media types the tester consented to; consent for recordings is never required.
- Report findings must cite rows that exist in that round; supporter counts are recomputed from the evidence.
