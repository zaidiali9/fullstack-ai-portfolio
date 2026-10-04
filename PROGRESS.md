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
- [ ] Web research on Upwork/Fiverr demand (job posts, gig listings, categories)
- [ ] docs/market-research.md: sources, top 8 gig types, client pain points, why these 5 apps
- [ ] Confirm or swap default apps (log any swap in DECISIONS.md)

## Shared foundations
- [ ] packages/ai: provider-agnostic AI layer (local Transformers.js, Ollama, Groq, Gemini, HF, optional paid), timeouts, retries/backoff, zod structured output, usage logging hook, input/output caps, "AI unavailable" status
- [ ] packages/ai unit tests
- [ ] packages/db-kit (or per-app): Drizzle driver switch PGlite <-> postgres-js, migrator
- [ ] Shared rate limiter + security headers helpers

## App A — AI Helpdesk (`apps/helpdesk`)
- [ ] Plan + scaffold (Next.js, TS, Tailwind, shadcn/ui, Drizzle, Better Auth)
- [ ] DB schema + migrations + indexes (orgs, members, tickets, messages, kb articles, audit log, usage, subscriptions)
- [ ] Auth: email+password + GitHub OAuth, organizations, RBAC admin/agent/customer
- [ ] Ticket flows: customer submit/view; agent dashboard list/filter/paginate, assign, status, reply
- [ ] AI: triage (category/priority/sentiment), KB-grounded reply draft (streamed), thread summary
- [ ] Notifications (email log / Mailpit-compatible SMTP in dev), audit log
- [ ] Stripe test-mode subscription (checkout, portal, webhook) with graceful "not configured"
- [ ] Security: zod, CSRF-safe, rate limits (auth + AI), secure headers, authz on every route/action
- [ ] Seed script (labeled seed data) + demo logins
- [ ] UI: responsive 360px+, a11y, dark mode, skeletons, empty/error states, toasts
- [ ] Unit tests (Vitest) incl. AI output parsing
- [ ] Playwright E2E main journey (stubbed AI labeled)
- [ ] Coverage %, Lighthouse x2 pages, eval script (>=15 cases, triage accuracy) — real runs saved
- [ ] Dockerfile, docker-compose, CI workflow, env var table
- [ ] Dependency audit
- [ ] README (all required sections, real screenshots, Mermaid arch + ER)
- [ ] docs/helpdesk/case-study.md, docs/helpdesk/marketing.md
- [ ] docs/verification.md complete; commit "feat(helpdesk): complete app, tests, docs"

## App B — Knowledge Base Chat (`apps/kb-chat`)
- [ ] Plan + scaffold
- [ ] Schema: workspaces, members, documents, chunks (pgvector), ingestion jobs, conversations, messages, usage
- [ ] Auth + workspace isolation
- [ ] Upload PDF/DOCX/TXT/MD/URL with validation; background ingestion + job status
- [ ] Chunk + embed + vector search; streamed answers with citations
- [ ] Conversation history; usage limits; embeddable widget snippet
- [ ] Security basics + AI safety (prompt-injection mitigation for document content)
- [ ] Seed + demo login
- [ ] UI quality bar
- [ ] Unit tests, E2E, coverage, Lighthouse x2, eval (>=15, citation correctness)
- [ ] Docker, compose, CI, env table, audit
- [ ] README, case study, marketing, verification; commit

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

## App D — Real-time Project Manager (`apps/project-board`)
- [ ] Plan + scaffold
- [ ] Schema: workspaces, boards, columns, cards (fractional ordering, version), comments, activity, notifications
- [ ] Kanban drag-and-drop (keyboard accessible), optimistic UI, conflict handling (versioning)
- [ ] Live collaboration via SSE; activity feed; notifications
- [ ] AI: goal -> tasks, weekly board summary, due-date suggestions
- [ ] Seed + demo logins; UI quality bar
- [ ] Unit, E2E, coverage, Lighthouse x2, eval (>=15)
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
