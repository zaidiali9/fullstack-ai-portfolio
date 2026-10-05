# Marketing copy — Tally (natural-language analytics)

Numbers come from `apps/nl-analytics/docs/verification.md`. Replace `[DEMO LINK]` after deploying.

## Upwork portfolio blurb (≤150 words)
**Natural-language analytics dashboard (Next.js + Postgres) with a parser-based SQL safety guard**

Ask questions in plain English and get charts, tables and the exact SQL behind them, always visible and editable.
Model-generated SQL is checked by the real PostgreSQL parser against an allowlist (one SELECT, approved tables,
functions and types), then runs in a READ ONLY transaction as a role that can't see app tables, with cost, time and
row limits. Every attempt is audited. In tests, prompts to delete data, read password hashes or DROP tables executed
nothing unsafe (4/4), and the guard has 65 adversarial tests. Saved queries, dashboards shared as revocable read-only
links, CSV export with formula-injection protection, and number-checked summaries. Accuracy with a free local model:
50% on 22 questions (baseline 4.5%), reported honestly. 96 unit + 20 browser tests. Demo: [DEMO LINK]

## Fiverr gig description
**I will build an AI analytics dashboard that answers questions about your data in plain English**

Let your team ask "which products sold best last month?" and get a chart in seconds, without writing SQL and without
risking your database.

What you get:
- A question box that turns plain English into charts and tables from your data
- The query behind every answer, visible and editable, so numbers can be checked
- Strict safety: read-only access, approved tables only, limits on heavy queries, every query logged
- Saved queries and dashboards you can share as read-only links
- CSV export and short written summaries with automatic number checks
- Works with free or paid AI providers; no vendor lock-in

Packages (scope, not price):
- **Basic** — connect one database (read-only), question box with charts/tables and visible SQL, CSV export.
- **Standard** — Basic + saved queries, dashboards, share links, audit log, user accounts.
- **Premium** — Standard + business metric definitions ("revenue", "active customer"), team permissions/SSO, scheduled reports and an accuracy test set for your data.

See the working demo: [DEMO LINK]

## Cold-email snippet (5 lines)
Hi [NAME] — does your team still wait on an analyst every time someone needs a number from [PRODUCT]'s data?
I build "ask your data" dashboards where questions in plain English become charts, with the SQL always shown.
Safety comes first: in my demo, 4 of 4 attempts to delete data or read passwords executed nothing.
Every query is read-only, logged and checked by the real PostgreSQL parser before it runs.
Here's the demo: [DEMO LINK]. Worth a 15-minute call?
