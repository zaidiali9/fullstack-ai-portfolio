# PROGRESS

<!-- FINAL SUMMARY goes here in Step 5 -->

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
- [~] Dockerfile, docker-compose, CI workflow, env var table — written; Docker/compose unverified locally (no Docker), CI not yet run (no remote)
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
- [~] Docker, compose, CI, env table — written; Docker/compose unverified locally (no Docker); CI not yet run (no remote)
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
- [~] Docker, compose, CI, env table — written; Docker/compose unverified locally; CI not yet run
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
- [~] Docker, compose, CI, env table, audit — written; audit 0 vulnerabilities; Docker/compose/CI not run (no Docker, no remote)
- [x] README, case study, marketing, verification; commit

## App E — NL Analytics Dashboard (`apps/nl-analytics`, "Tally")
- [x] Plan + scaffold
- [x] Seeded demo dataset (synthetic, labeled): fictional retailer in schema `demo`, no personal data
- [x] NL -> SQL generation (JSON plan, repair turns); read-only allowlist guard (libpg-query, real PG 18 parser); statement timeout + EXPLAIN cost ceiling (PGlite ignores timeouts); READ ONLY tx; analytics_reader role
- [x] Charts + tables + explanation; visible, editable generated-SQL panel; number-checked summaries
- [x] Saved queries, shareable dashboards (revocable read-only links), CSV export (formula-injection safe)
- [x] Seed + demo logins; UI quality bar (axe 0 on 6 pages light/dark, 360 px, dark mode, empty/error states, toasts)
- [x] Unit (96, 81.17% lines, 65 guard tests); E2E (20); Lighthouse x2 (landing 93/100/100/100, shared 82/100/100/63 noindex); eval 26 cases (50% exec accuracy, 4/4 safety, dataset unchanged)
- [~] Docker, compose, CI, env table, audit — written; audit 0 vulnerabilities; Docker/compose/CI not run (no Docker, no remote)
- [x] README, case study, marketing, verification; commit

## Step 3 — Portfolio site
- [ ] /portfolio-site static page: intro, app cards (pitch, tags, real metric, screenshot, Demo/Repo placeholders), how I work, contact placeholders
- [ ] Lighthouse run recorded

## Step 4 — Profile and outreach docs
- [ ] docs/upwork-profile.md
- [ ] docs/cold-emails.md
- [ ] docs/fiverr-gigs.md
- [ ] docs/improvements.md
- [ ] docs/HUMAN-TODO.md

## Step 5 — Final QA
- [ ] Fresh-clone test following each README quickstart
- [ ] Dependency audits recorded; high-severity fixed where possible
- [ ] Numbers-in-docs trace check
- [ ] Grep for secrets, TODOs, lorem ipsum
- [ ] Final summary at top of PROGRESS.md

## Blocked
_(none yet)_
