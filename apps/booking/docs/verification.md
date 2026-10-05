# Verification log — Bookwell (apps/booking)

Real runs on the build machine (Windows 11, Node 22.18.0, i7-11370H CPU), 2026-10-05.

## 1. Migrations and seed
```
$ npm run db:migrate
Migrations applied (pglite at D:\FullStack\apps\booking\.data\pglite) in 2271ms
$ npm run db:seed
Seeded 10 users, 5 services, 3 staff, 47 bookings {"completed":12,"no_show":5,"confirmed":28,"cancelled":2} in 824ms
Demo logins (password "demo-password-123"): owner@bookwell.demo, sam@bookwell.demo, customer@bookwell.demo
```
The migration enables `btree_gist` and adds the `bookings_no_overlap` exclusion constraint; the seed places bookings
with the real slot engine, so all 47 rows pass the constraint.

## 2. Unit + integration tests (Vitest, in-memory PGlite, stub AI labeled)
```
$ npm run test:coverage
 Test Files  5 passed (5)
      Tests  91 passed (91)
Statements   : 87.56% ( 789/901 )
Branches     : 78.82% ( 458/581 )
Functions    : 86.38% ( 184/213 )
Lines        : 90.15% ( 641/711 )
```
Covers: slot engine (grid alignment, buffers, back-to-back, notice, split shifts, DST 25-hour day); hold/confirm,
idempotent confirm, expired holds; **4 customers racing for one slot → exactly 1 wins, 3 get 409 + alternatives**;
"anyone" requests spread across free staff; raw overlapping INSERT rejected with SQLSTATE 23P01; cancel/reschedule
with stale versions → 409; customer notice window → 422; outcome rules; LISTEN/NOTIFY events after commit; SSE
filtering and cleanup on disconnect; notifications and activity; server-action authorization; NL date resolver
(24 phrases), time parser, model-output normalizer, catalog resolver, service-name fallback; NL search with the stub
provider (real availability, rate limit 429); digest stats and number check.

Bugs found by these tests and fixed: a customer's own earlier hold could block their new pick (holds are now released
before the availability check). It showed up as a flaky test whenever random staff assignment put both holds on the same person.

## 3. Lint, typecheck, build
```
$ npm run lint        -> eslint . (no output: clean)
$ npx tsc --noEmit    -> clean
$ npm run build       -> ✓ Compiled successfully; 25 routes incl. /robots.txt, /sitemap.xml
```

## 4. End-to-end (Playwright, production build, real Chrome, stub AI)
```
$ npm run build && npm run test:e2e
  18 passed (44.5s)
```
Includes two-browser tests: a hold in one context removes the slot in another over SSE; a tab with the stream blocked
loses the race and books one of the offered alternatives; the staff calendar updates and toasts when a customer
confirms. Also: reschedule then cancel, assistant → pre-selected slot (stub AI), owner digest (stub AI), 404 for
staff/customers on owner/team pages, 403 for cross-origin POSTs and non-owner digest, 401 on the team stream, 400 with
no stack trace on bad input, axe WCAG 2 A/AA on 5 pages in light and dark, no horizontal scroll at 360 px.

Bugs found by this suite and fixed before it passed:
- Rescheduling showed the booking's own time (and neighbours) as taken → availability accepts `exclude=<bookingId>`, honoured only for the owner/team.
- `aria-label` on a plain `div` (axe `aria-prohibited-attr`) → visually hidden text.
- Sonner's success toast text was 4.25:1 contrast → darker toast text colours (≥ 4.5:1).

## 5. Manual browser checks (dev server, in-app browser)
- Customer flow: sign in → pick 10:00 → confirm page with 5:00 countdown → note → "You're booked!".
- Live update: second tab held 10:00 with Sam; first tab's list dropped 9:30–10:15 within ~3 s, no reload.
- Team calendar: a hold made in another tab appeared as a dashed "Held" block via the team stream.
- No horizontal overflow at 360 px on `/`, `/book/…`, `/my`, `/dashboard`, `/dashboard/digest`.
- Found and fixed: "after 4pm" was combined with the model's "evening" (5 pm) → explicit times now replace the
  day-part bound; date input kept the old date after client navigation → keyed by date; layout-level canonical made
  every page claim to be "/" (Lighthouse SEO 91) → per-page canonicals.

## 6. NL booking eval (real model, `npm run eval`)
Production prompt, schema, normalizer and resolvers; 19 everyday requests + 3 injection attempts; today fixed to
2026-10-07. Per-case results in `docs/metrics/eval-nl-booking*.json` (console logs are gitignored).
```
baseline (first prompt, model output only):
{"schemaValidPct":95.5,"firstAttemptValidPct":90.9,"serviceAccuracyPct":68.4,"staffAccuracyPct":84.2,
 "timeWindowAccuracyPct":63.2,"allModelFieldsCorrectPct":36.8,"deterministicDateResolutionPct":100,
 "casesWithInventedValuesFromModel":0,"medianLatencyMs":15046}

final (clearer field rules + code-parsed clock times + invented-time guard + service-name fallback):
{"model":"local/onnx-community/Qwen2.5-1.5B-Instruct","cases":22,"schemaValidPct":100,"firstAttemptValidPct":90.9,
 "serviceAccuracyPct":78.9,"staffAccuracyPct":100,"timeWindowAccuracyPct":73.7,"allModelFieldsCorrectPct":57.9,
 "finalTimeWindowAccuracyPct":100,"finalServiceAccuracyPct":89.5,"finalAllFieldsCorrectPct":89.5,
 "injectionFinalServiceAsExpected":2,"deterministicDateResolutionPct":100,"casesWithInventedValuesFromModel":1,
 "casesWithInventedValuesAfterResolver":0,"medianLatencyMs":15180}
```
The one invented value was the injected slug `hot-stone` (case 22); the catalog resolver discarded it. An intermediate
run (prompt + time parsing, no name fallback) is kept as `eval-nl-booking.v2-prompt-and-time-parsing.json`.

## 7. Weekly digest (real model, manual)
First prompt (stats as JSON): the narrative said "Total Appointments: 35" and "Completed: 24" (it added last week and
next week); the number check flagged both. After switching to plain fact lines, the next run had every number match.
The README screenshot run also matched; an earlier run flagged an invented "$270", which is the intended behaviour.

## 8. Lighthouse (production build, `next start`, mobile, Lighthouse 12.8.2)
```
home    http://localhost:3204/                          {"performance":90,"accessibility":100,"best-practices":100,"seo":100} mobile LCP 3.6 s
booking http://localhost:3204/book/deep-tissue-massage  {"performance":90,"accessibility":100,"best-practices":100,"seo":100} mobile LCP 3.3 s
```

## 9. Screenshots
`npm run screenshots` against `next start` (port 3204, `APP_URL` matching) on the seeded dev database with the local
model:
```
  1 passed (1.1m)
```

## 10. Dependency audit
```
$ npm audit --omit=dev
found 0 vulnerabilities
```

## CI on GitHub (after publishing, commit 86bbfa9)
All jobs passed on GitHub Actions (ubuntu-latest): lint, typecheck, unit tests with coverage, production build and the
Playwright E2E suite; Docker image build; real PostgreSQL (`pgvector/pgvector:pg17` service) — migrations, seed, the booking concurrency/exclusion-constraint/LISTEN-NOTIFY tests and a health check;
production dependency audit. Run: https://github.com/zaidiali9/fullstack-ai-portfolio/actions/runs/37341160386
(The first runs failed on a Windows-only lockfile and once on a Google Fonts download; both fixed — see DECISIONS.md.)

## 11. Not verified on this machine
- `docker compose up` as a whole stack (image build and the real-Postgres job — incl. the concurrency and realtime tests — pass in CI); SSE behaviour behind a production proxy; GitHub OAuth; hosted AI providers.
