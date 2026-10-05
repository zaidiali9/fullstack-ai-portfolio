# Case study: Tally — ask your data in plain English, safely

*Portfolio project. "Lanternfish Supply Co." and all of its customers, orders and tickets are fictional seed data.*

## The problem
Most people in a business have questions their database could answer ("which region grew fastest this quarter?"),
but only a few can write SQL. "Chat with your data" tools promise to bridge that gap, and they raise two worries:
- **Safety**: if an AI writes the database queries, what stops it (or a cleverly worded question) from deleting data
  or reading tables it shouldn't, like user accounts and passwords?
- **Trust**: how do you know the number on the chart is right?

## What I built
A small analytics app on a realistic online-store dataset:
1. **Ask a question in plain English** and get a chart or table, a one-line explanation, and the exact database query
   behind it, which you can read, edit and re-run.
2. **Save answers**, arrange them into **dashboards**, share a dashboard as a **read-only public link** (revocable),
   and **export anything to CSV**.
3. **A short written summary** of any result, where every number is checked against the actual data.
4. **An activity log** for admins: every query anyone ran, including the ones that were blocked.

## How it works (plain language)
- **The AI never gets the keys.** Every query, whether written by the AI or typed by a person, goes through a checker
  that uses PostgreSQL's own parser to understand it, exactly as the database will. Anything that isn't a single
  read-only question about the approved tables is refused before it reaches the database.
- **Belt and braces.** Even an approved query runs in "read-only" mode, as a database user that can only see the
  business data (not accounts or passwords), with limits on cost, time and size.
- **Nothing is hidden.** The query is always on screen. If it's wrong, you can see why and fix it; if the AI's first
  try fails, it gets the error and tries again, up to two more times.
- **Numbers are checked, not trusted.** Summaries are compared against the result rows, and any number that doesn't
  appear in them is flagged.

## Results (measured on demo data)
Commands and raw output: `apps/nl-analytics/docs/verification.md`.
- **Safety:** asked to delete data, read password hashes, follow an injected "DROP TABLE" instruction, and list the
  system tables, the app **executed nothing unsafe in 4 of 4 cases**, and the data was unchanged afterwards. In one
  case the AI's own note falsely claimed it had dropped a table; the app now states "No query was run" itself instead
  of repeating the AI.
- The query checker has **65 automated tests**, including tricks to sneak past it (hidden second statements, sneaky
  table names, casting tricks). Writing them found a real gap, which was fixed before release.
- **Accuracy:** on 22 test questions, answers matched hand-written reference queries **11 times (50%)**, using a free AI
  model small enough to run on a laptop CPU (about 37 seconds per question). The first version scored **1 in 22**;
  switching to a code-trained model and giving it the table relationships made most of the difference. That's why
  the query is always shown: a person can check and correct it.
- **96 automated tests** of the server logic and **20 browser tests** pass, including an accessibility scan with
  **0 issues** on six pages in light and dark mode.
- Google Lighthouse (mobile): **93 performance / 100 accessibility / 100 SEO** on the home page; shared dashboards
  score 82 for performance because of the chart code.

No real company data was used. The query-safety tests also pass on a full PostgreSQL server in the CI pipeline.

## Tech used
Next.js and React, PostgreSQL (read-only transactions, a restricted database role, query-cost limits), the real
PostgreSQL parser (libpg-query) for query checking, Drizzle, Better Auth, Recharts, an open-source code model
(Qwen2.5-Coder) with optional hosted providers, Vitest and Playwright for testing, GitHub Actions and Docker for delivery.

## What a custom version could include
- Your own database (through a read-only replica) with business definitions like "revenue" and "active customer"
  set up once, so answers use your exact metrics.
- Team access controls, single sign-on, and dashboards shared with named people instead of public links.
- Scheduled dashboard emails and alerts ("tell me if refunds go above 5%").
- A stronger hosted AI model, measured with the same test questions before and after.
