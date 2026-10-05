# PROGRESS

## Final summary (2026-10-05)

**Status: all steps complete.** Five apps, the shared AI and server packages, a portfolio page and the outreach docs are
built, tested and committed. Nothing is in "Blocked". What could not be verified on this machine (no Docker, no
Postgres server, no remote, no API keys) is listed below and in `docs/HUMAN-TODO.md`.

| App | What it is | Tests | Headline measured result (source) |
|---|---|---|---|
| A · Tidal Desk (`apps/helpdesk`, :3001) | Multi-tenant AI helpdesk: triage, KB-grounded drafts, summaries, RBAC, Stripe billing | 57 unit (81.67% lines) · 14 E2E | Category accuracy 91.7% (22/24); 2 of 3 injection attempts resisted (`docs/metrics/eval-triage.json`) |
| B · Cairn (`apps/kb-chat`, :3002) | RAG over PDFs/DOCX/MD/URLs with passage citations + embeddable widget | 54 unit (87.75%) · 15 E2E | Key fact in 17/17 answers, 0 wrong-document citations, 5/5 out-of-scope refused (`eval-rag.json`) |
| C · Fernwood Supply (`apps/storefront`, :3003) | Store with Stripe Checkout/webhooks, admin, semantic search, AI descriptions | 22 unit (79.12%) · 14 E2E | Top-3 hit 18/18 hybrid vs 16/18 keyword (`eval-search.json`) |
| D · Bookwell (`apps/booking`, :3004) | Real-time booking: SSE availability, holds, exclusion constraint, live calendar, NL assistant, digest | 91 unit (90.15%) · 18 E2E | 4-way race → exactly 1 winner; assistant 17/19 fully correct (`eval-nl-booking.json`) |
| E · Tally (`apps/nl-analytics`, :3005) | NL→SQL analytics with parser-based guard, read-only role, charts, dashboards, CSV | 96 unit (81.17%, 65 guard tests) · 20 E2E | 4/4 unsafe prompts executed nothing; accuracy 50% (11/22) with a local 1.5B model, baseline 4.5% (`eval-nl-sql.json`) |

Shared: `packages/ai` (provider-agnostic AI layer, 44 tests) and `packages/kit` (DB driver switch, rate limits,
headers, errors, 15 tests). Portfolio page: Lighthouse 100/100/100/100 (mobile), axe 0 violations in light and dark.
Every app scores 100 on Lighthouse accessibility for its measured pages and has 0 axe violations (WCAG 2 A/AA) in
light and dark; each README lists its Lighthouse scores.

**Final QA (Step 5)**
- Fresh clone → `npm ci` → each README quickstart (`npm run setup`) with no `.env` and no AI configured: all 5 apps
  migrated and seeded, all unit suites passed (59 + 57 + 54 + 22 + 91 + 96), all 5 production builds succeeded, and
  `/api/health`, `/` and `/sign-in` returned 200 with AI reported as unavailable. The "AI unavailable" / keyword-search
  states were visible on the public pages.
- `npm audit --omit=dev`: 0 vulnerabilities. Full audit: 9 "high" entries, all from one dev-only advisory (`braces`,
  no patched version exists); accepted and recorded in DECISIONS.md.
- Numbers trace: every number in READMEs, case studies, marketing, portfolio and profile docs was matched to
  `docs/verification.md` / `docs/metrics/*.json`; the 11 unmatched were config values, Stripe's test card, the demo
  password or CSS colours, and the config values were checked against the code.
- Sweep: no tracked `.env` files ever; no key-like strings; no TODO/FIXME/lorem (only references to HUMAN-TODO.md).

**Honest limits (details in each README and `docs/improvements.md`)**
- All AI numbers come from free local models on a CPU (13–37 s per call). Hosted models were not measured.
- Published to https://github.com/zaidiali9/fullstack-ai-portfolio; all 5 CI workflows pass there (unit + E2E,
  Docker image builds, real-Postgres jobs incl. booking's concurrency tests and Tally's SQL safety tests). First runs
  failed on a Windows-only lockfile and a Google Fonts download — fixed (lockfile regenerated, fonts self-hosted).
- Deployed 2026-10-05 on Railway's free plan (Postgres + 3 services, AI off): Cairn
  https://kb-chat-production-15ef.up.railway.app, Bookwell https://booking-production-d564.up.railway.app, Tally
  https://nl-analytics-production.up.railway.app. Health (database ok), `/` and `/sign-in` returned 200 on all three;
  Bookwell's live availability connected over SSE. Records in each `docs/verification.md`; recipe in `deploy/README.md`.
  Helpdesk and storefront are not deployed (free-plan limit).
- Still not verified: `docker compose up` as a whole stack, GitHub OAuth, live Stripe, hosted AI providers, signing in
  on the deployed demos.
- Stripe deposit for booking was dropped under the scope rule; Tally's accuracy is about half, so its SQL is always
  shown and editable.

**Next for you:** `docs/HUMAN-TODO.md` (deploy with a free Groq/Gemini key → replace
`[DEMO LINK]`/`[YOUR NAME]` placeholders → profiles and outreach).

Legend: `[x]` done and verified (evidence in the app's `docs/verification.md`), `[ ]` open,
`[~]` partially done / unverified (reason noted inline). Blocked items are listed at the bottom.

Environment flags (see DECISIONS.md):
- **Postgres/Docker unverified** — no Docker or Postgres server on the build machine. Local dev and
  tests use PGlite (real Postgres 18 compiled to WASM, with pgvector) behind Drizzle. Docker files
  are written but `docker compose up` could not be run.
- **No hosted AI key** — real model calls use local open models via Transformers.js.

## Step 0 — Setup
- [x] git init, .gitignore (node, env, .next, dist, uploads, coverage, playwright reports)
- [x] PROGRESS.md with every task; DECISIONS.md
- [x] CLAUDE.md with hard rules, repo structure, "continue" rule
- [x] Environment check recorded in DECISIONS.md (node, npm, docker, disk, internet, ollama)
- [x] Monorepo root (npm workspaces) committed

## Step 1 — Market research
- [x] Web research on Upwork/Fiverr demand (job posts, gig listings, categories)
- [x] docs/market-research.md: sources, top 8 gig types, client pain points, why these 5 apps
- [x] Confirm or swap default apps — swapped D to Real-time Booking & Scheduling (DECISIONS.md)

## Shared foundations
- [x] packages/ai: provider-agnostic AI layer (local Transformers.js, Ollama, Groq, Gemini, HF, optional paid), timeouts, retries/backoff, zod structured output, usage logging hook, input/output caps, "AI unavailable" status
- [x] packages/ai unit tests
- [x] packages/kit: Drizzle driver switch PGlite <-> postgres-js, migrator
- [x] Shared rate limiter + security headers helpers

## App A — AI Helpdesk (`apps/helpdesk`) — DONE (see apps/helpdesk/docs/verification.md)
- [x] Plan + scaffold (Next.js, TS, Tailwind, shadcn/ui, Drizzle, Better Auth)
- [x] DB schema + migrations + indexes (orgs, members, tickets, messages, kb articles, audit log, usage, subscriptions)
- [~] Auth: email+password, organizations, RBAC admin/agent/customer verified; GitHub OAuth wired but unverified (needs OAuth app credentials)
- [x] Ticket flows: customer submit/view; agent dashboard list/filter/paginate, assign, status, reply
- [x] AI: triage (category/priority/sentiment), KB-grounded reply draft (streamed), thread summary
- [x] Notifications (email outbox / Mailpit-compatible SMTP), audit log
- [~] Stripe test-mode subscription: webhook logic + signature verification tested with locally signed events; live checkout unverified (needs Stripe test keys)
- [x] Security: zod, CSRF-safe, rate limits (auth verified 5/min -> 429; AI per-user + per-plan), secure headers, authz on every route/action
- [x] Seed script (labeled seed data) + demo logins; optional real-model triage (--with-ai)
- [x] UI: responsive 360px+ (E2E verified), a11y (axe 0 violations light+dark), dark mode, skeletons, empty/error states, toasts
- [x] Unit tests (Vitest) incl. AI output parsing — 57 passed
- [x] Playwright E2E main journey (stubbed AI labeled) — 14 passed
- [x] Coverage 81.67% lines, Lighthouse x2 (landing 95/100/100/100, tickets 90/100/100/100), triage eval 24 cases (91.7% category)
- [x] Dockerfile, docker-compose, CI workflow, env var table — Docker image build + CI (incl. real Postgres) pass on GitHub Actions; `docker compose up` itself not run
- [x] Dependency audit (prod: 0 vulns; dev-only braces advisory has no fix)
- [x] README (all required sections, real screenshots, Mermaid arch + ER)
- [x] docs/helpdesk/case-study.md, docs/helpdesk/marketing.md
- [x] docs/verification.md complete; commit "feat(helpdesk): complete app, tests, docs"

## App B — Knowledge Base Chat "Cairn" (`apps/kb-chat`) — DONE (see apps/kb-chat/docs/verification.md)
- [x] Plan + scaffold (reused App A infra; port 3002)
- [x] Schema: workspaces, members, documents, blobs, chunks (pgvector), ingestion jobs, conversations, messages + migration
- [x] Auth + workspace isolation (owner/editor/viewer RBAC; verified in tests and eval)
- [x] Upload PDF/DOCX/MD/TXT (magic-byte validation) + URL (SSRF-safe, robots.txt); background ingestion + live job status
- [x] Chunk + embed + hybrid search (pgvector + FTS, RRF); streamed answers with citations (+ labeled matched citations)
- [x] Conversation history; monthly question / document limits; embeddable widget (/embed/[key], public/widget.js)
- [x] Security basics + AI safety; SSRF IP-literal hole found by tests and fixed
- [x] Seed (5 docs in 4 formats via real pipeline) + demo logins
- [x] UI quality bar (axe 0 violations light+dark, 360px verified, skeleton-free streaming states, toasts)
- [x] Unit/integration 54 passed (87.75% lines); E2E 15 passed; Lighthouse landing 95/100/100/100, chat 92/100/100/100; RAG eval 22 cases
- [x] Docker, compose, CI, env table — Docker image build + CI (incl. real Postgres) pass on GitHub Actions; `docker compose up` itself not run
- [x] Dependency audit (prod 0 vulns)
- [x] README, case study, marketing, verification; commit

## App C — E-commerce Storefront "Fernwood Supply" (`apps/storefront`) — DONE (see apps/storefront/docs/verification.md)
- [x] Plan + scaffold (port 3003)
- [x] Schema: products (pgvector), carts, cart items, orders, order items (snapshots), stripe events; CHECK constraints
- [x] Catalog, product pages, cart (guest cookie + merge at sign-in), Stripe test checkout + signed idempotent webhooks, order history
- [~] Live Stripe Checkout unverified (needs Stripe test keys); webhook logic tested with locally signed events
- [x] Admin panel (products CRUD, orders, mark shipped) with role checks
- [x] AI: semantic search (hybrid + fallback), AI product descriptions (schema-enforced rules, human edit), similar items
- [x] SEO: metadata, canonical, sitemap, robots, Product JSON-LD; next/image with generated WebP art
- [x] Seed + demo logins; UI quality bar (axe 0 violations light+dark, 360px)
- [x] Unit 22 passed (79.12% lines), E2E 14 passed, Lighthouse home 91/100/100/100 product 89/100/100/100, search eval 18 cases, description eval 18 cases
- [x] Docker, compose, CI, env table — Docker image build + CI (incl. real Postgres) pass on GitHub Actions; `docker compose up` itself not run
- [x] Dependency audit (prod 0 vulns)
- [x] README, case study, marketing, verification; commit

## App D — Real-time Booking & Scheduling (`apps/booking`, "Bookwell") — swapped in for Project Manager
- [x] Plan + scaffold
- [x] Schema: business, staff, services, availability rules, time off, bookings (btree_gist exclusion constraint vs double booking, version), activity, notifications
- [x] Public booking flow: pick service/staff/slot, hold (5 min), confirm; reschedule/cancel with notice window
- [~] Stripe test-mode deposit — dropped under the scope rule (storefront covers Stripe); listed in README limitations and DECISIONS.md
- [x] Live availability via SSE (Postgres LISTEN/NOTIFY); optimistic hold UI; conflict handling (409 + nearest alternatives)
- [x] Owner/staff dashboard: live day calendar, reschedule/cancel/outcomes, activity feed, notifications
- [x] AI: natural-language booking request -> zod-validated filters -> real slot search; weekly digest with number check; alternative times (algorithmic)
- [x] Seed + demo logins; UI quality bar (360 px, axe light/dark, dark mode, skeletons, empty/error states, toasts)
- [x] Unit (91, 90.15% lines), E2E (18), Lighthouse x2 (90/100/100/100 both), eval (22 cases: 89.5% end-to-end)
- [x] Docker, compose, CI, env table, audit — Docker image build + CI (incl. real Postgres) pass on GitHub Actions; `docker compose up` itself not run
- [x] README, case study, marketing, verification; commit

## App E — NL Analytics Dashboard (`apps/nl-analytics`, "Tally")
- [x] Plan + scaffold
- [x] Seeded demo dataset (synthetic, labeled): fictional retailer in schema `demo`, no personal data
- [x] NL -> SQL generation (JSON plan, repair turns); read-only allowlist guard (libpg-query, real PG 18 parser); statement timeout + EXPLAIN cost ceiling (PGlite ignores timeouts); READ ONLY tx; analytics_reader role
- [x] Charts + tables + explanation; visible, editable generated-SQL panel; number-checked summaries
- [x] Saved queries, shareable dashboards (revocable read-only links), CSV export (formula-injection safe)
- [x] Seed + demo logins; UI quality bar (axe 0 on 6 pages light/dark, 360 px, dark mode, empty/error states, toasts)
- [x] Unit (96, 81.17% lines, 65 guard tests); E2E (20); Lighthouse x2 (landing 93/100/100/100, shared 82/100/100/63 noindex); eval 26 cases (50% exec accuracy, 4/4 safety, dataset unchanged)
- [x] Docker, compose, CI, env table, audit — Docker image build + CI (incl. real Postgres) pass on GitHub Actions; `docker compose up` itself not run
- [x] README, case study, marketing, verification; commit

## Step 3 — Portfolio site
- [x] /portfolio-site static page: intro, app cards (pitch, tags, real metric, screenshot, Demo/Repo placeholders), how I work, contact placeholders
- [x] Lighthouse run recorded (100/100/100/100 mobile; axe 0 light/dark) — portfolio-site/README.md

## Step 4 — Profile and outreach docs
- [x] docs/upwork-profile.md
- [x] docs/cold-emails.md
- [x] docs/fiverr-gigs.md
- [x] docs/improvements.md
- [x] docs/HUMAN-TODO.md

## Step 5 — Final QA
- [x] Fresh-clone test following each README quickstart (setup, unit tests, build, start, health — all 5 apps)
- [x] Dependency audits recorded; high-severity fixed where possible (prod 0; dev-only braces advisory has no patched release — DECISIONS.md)
- [x] Numbers-in-docs trace check
- [x] Grep for secrets, TODOs, lorem ipsum
- [x] Final summary at top of PROGRESS.md

## Blocked
_(none — nothing failed three different ways. Items that need credentials or infrastructure are marked `[~]` above and listed in docs/HUMAN-TODO.md.)_
