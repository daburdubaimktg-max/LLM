# Status — what works, how it was verified, what remains

## Verified
| Area | How |
|---|---|
| Migrations + seed apply cleanly | PostgreSQL 16, `scripts/dev-db.sh` |
| Acceptance scenarios A–J (data, permissions, workflow) | `tests/scenarios.test.ts` — 28 tests, each call made under the caller's role and JWT claims so RLS is live |
| Cohort overbooking under concurrency | Two simultaneous approvals for one place: exactly one succeeds |
| Immutability (bug reports, verdicts, task versions, finished reports) | Updates rejected even from a superuser connection |
| Report engine: evidence gate, recomputed counts, model fallback | `tests/engine.test.ts` (fake model returning invented references) |
| Dashboard maths and form validation | `tests/client-logic.test.ts` |
| Full lifecycle through the UI | `e2e/up.sh` — 14 browser steps on the web build at phone width, against the dev gateway |
| App typechecks and bundles | `tsc --noEmit`, `expo export -p web` |

## Not verified
- **Hosted Supabase.** No Supabase project or CLI was available (no Docker). Migrations are written for
  Supabase and exercised on plain PostgreSQL through a shim; `supabase db push`, real Auth, real Storage and
  the deployed Edge Function have not been run. The seed's hosted-only branch (`auth.identities`) is untested.
- **OpenAI.** No key was available. The request/response boundary, structured-output schema and evidence
  validation are built and unit-tested with a stand-in model; a live call has not been made. The default
  model name is a placeholder to confirm.
- **Native iOS/Android.** The app was only run as a web build. Document picking and file upload were
  exercised in the browser only.
- **Screens outside the browser flow** were typechecked but not clicked through: marketplace filters,
  profile editing, account deletion, product creation, round creation, application form builder, task
  editor/reorder, template library, assignments list, bug triage actions, verdict corrections, withdraw.
  The database functions behind most of them are covered by the scenario tests.

## Known gaps
- Product images are added by URL; file upload for product assets is not built.
- Account deletion anonymises data and queues a request; the privileged job that deletes the auth user and
  stored files is not built. `purge_expired_evidence()` exists but is not scheduled.
- Notifications are in-app only (no push or email).
- Screen recording and voice notes are file uploads; there is no in-app recorder.
- Reward handling is descriptive only; no payments.
- No realtime: dashboards poll.
- No ESLint config (would have added dependencies).

## Assumptions
- "Could not complete" marks a task blocked; a blocked required task still lets the tester reach the final
  review, so a broken product cannot trap them.
- Remaining places = cohort size − approved applications. Unreviewed applications are shown separately.
- A session past the round's testing deadline without a verdict is counted as abandoned.
- Application step 4 (availability and consent) and the review step are platform-standard; earlier steps are
  defined per round.
- The demo tester's stated answers "I usually check my bank app" and "Something simple that doesn't require
  much effort" are stored as the matching options "Banking application" and "Simple and effortless".
  Step 4 was not supplied, so the demo application is left as an unsubmitted draft.
