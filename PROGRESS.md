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

## App B — Knowledge Base Chat "Cairn" (`apps/kb-chat`) — IN PROGRESS
- [x] Plan + scaffold (reused App A infra; port 3002)
- [x] Schema: workspaces, members, documents, blobs, chunks (pgvector), ingestion jobs, conversations, messages + migration
- [x] Auth + workspace isolation (owner/editor/viewer RBAC; verified in tests)
- [x] Upload PDF/DOCX/MD/TXT (magic-byte validation) + URL (SSRF-safe, robots.txt); background ingestion + live job status
- [x] Chunk + embed + hybrid search (pgvector + FTS, RRF); streamed answers with citations (+ labeled matched citations)
- [x] Conversation history; monthly question / document limits; embeddable widget (/embed/[key], public/widget.js)
- [x] Security: SSRF IP-literal hole found by tests and fixed; untrusted fencing; rate limits
- [x] Seed (5 docs in 4 formats via real pipeline) + demo logins (owner/editor/viewer@cairn.demo)
- [x] RAG eval (22 cases, real local model): hit@5 100%, fact 100%, citations correct 88.2%, refusals 5/5, 0 leaks -> docs/metrics/eval-rag.json
- [x] Fixed job-isolation test (54/54 unit+integration tests pass)
- [x] Action/route authz tests (viewer cannot upload, CSRF, widget origin/rate limit, cron auth); coverage 87.75% lines
- [ ] UI verification in browser (dev server :3002), E2E (Playwright), Lighthouse x2, screenshots
- [ ] .env.example, docker-compose, CI workflow (.github/workflows/kb-chat.yml), audit
- [ ] README, docs/kb-chat/case-study.md + marketing.md, docs/verification.md; commit "feat(kb-chat): complete app, tests, docs"

## App C — E-commerce Storefront (`apps/storefront`)
- [ ] Plan + scaffold
- [ ] Schema: products, variants/images, carts, orders, order items, embeddings
- [ ] Catalog, product pages, cart, Stripe test checkout + webhooks, order history
- [ ] Admin panel (products CRUD, orders) with RBAC
- [ ] AI: semantic search, AI product descriptions (editable before save), similar items
- [ ] SEO: metadata, sitemap, robots, JSON-LD; image optimization
- [ ] Seed + demo logins; UI quality bar
- [ ] Unit, E2E, coverage, Lighthouse x2, eval (>=15)
- [ ] Docker, compose, CI, env table, audit
- [ ] README, case study, marketing, verification; commit

## App D — Real-time Booking & Scheduling (`apps/booking`) — swapped in for Project Manager
- [ ] Plan + scaffold
- [ ] Schema: businesses, staff, services, availability rules, bookings (exclusion constraint vs double booking, version), activity, notifications
- [ ] Public booking flow: pick service/staff/slot, hold, confirm; Stripe test-mode deposit (graceful if not configured)
- [ ] Live availability via SSE; optimistic UI; conflict handling (slot taken -> clear recovery)
- [ ] Owner/staff dashboard: calendar/day view, reschedule/cancel, activity feed, notifications
- [ ] AI: natural-language booking request -> zod-validated slot search; weekly schedule digest; alternative-time suggestions
- [ ] Seed + demo logins; UI quality bar
- [ ] Unit, E2E, coverage, Lighthouse x2, eval (>=15, NL request parsing accuracy)
- [ ] Docker, compose, CI, env table, audit
- [ ] README, case study, marketing, verification; commit

## App E — NL Analytics Dashboard (`apps/nl-analytics`)
- [ ] Plan + scaffold
- [ ] Seeded demo dataset (synthetic, labeled)
- [ ] NL -> SQL generation; read-only allowlist guard (parser-based); statement timeout; read-only tx
- [ ] Charts + tables + explanation; visible generated-SQL panel
- [ ] Saved queries, shareable dashboards, CSV export
- [ ] Seed + demo login; UI quality bar
- [ ] Unit tests incl. SQL guard; E2E; coverage; Lighthouse x2; eval (>=15, SQL validity + safety rejection)
- [ ] Docker, compose, CI, env table, audit
- [ ] README, case study, marketing, verification; commit

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
