# DECISIONS

One line per decision with the reason. Newest sections at the bottom.

## Environment check (2026-10-04, Step 0)
Commands run: `node -v`, `npm -v`, `pnpm -v`, `docker --version`, `ollama --version`, `df -h /d`,
`curl -sI https://registry.npmjs.org`, PowerShell `Get-CimInstance` for RAM/CPU/GPU.

| Item | Result |
|---|---|
| OS | Windows 11 Pro 10.0.26200 |
| Node | v22.18.0 |
| npm | 10.9.3 |
| pnpm | not installed (corepack 0.33.0 present) |
| Docker | **not installed** |
| PostgreSQL server | **not installed** |
| Ollama | **not installed** |
| Git | 2.51.0 |
| Disk (D:) | 690 GB free of 932 GB |
| RAM / CPU / GPU | 39.8 GB / i7-11370H (8 threads) / RTX 3050 Laptop + Iris Xe |
| Internet | npm registry HTTP 200; Hugging Face reachable; api.groq.com reachable |
| Hosted AI keys in env | none |
| Chrome | installed (used for Lighthouse) |

## Platform decisions
- **npm workspaces instead of pnpm** — pnpm is not installed; npm workspaces need no global install and work identically in CI.
- **PGlite for local dev/tests instead of SQLite** — no Docker/Postgres available; PGlite is real Postgres (18.3) in WASM with the pgvector extension (`@electric-sql/pglite-pgvector`), so the same Drizzle schema, SQL and migrations run locally and on Neon/Supabase. Probe verified: vector `<=>` query, read-only transaction rejection of INSERT.
- **PGlite does not enforce `statement_timeout`** (probe: `SELECT pg_sleep(2)` with 200ms timeout completed) — apps also enforce an application-level timeout; real Postgres enforces both.
- **Driver switch** — `DATABASE_URL` set => `postgres-js` driver (Neon/Supabase/compose); unset => PGlite file DB under `.data/`. Same Drizzle schema and migrations for both.
- **Postgres/Docker unverified** — Dockerfiles and docker-compose files are written but cannot be run on this machine; flagged in PROGRESS.md and HUMAN-TODO.md.
- **Drizzle over Prisma** — native PGlite driver, no binary query engine (smaller serverless bundles), SQL-first migrations committed as files.
- **Better Auth over Auth.js** — built-in email+password with scrypt hashing, organization plugin (multi-tenant + roles), built-in auth rate limiting, origin-check CSRF protection, Drizzle adapter.
- **CI location** — GitHub Actions only runs workflows in the repo-root `.github/workflows/`, so each app's CI lives at `.github/workflows/<slug>.yml` with a path filter instead of `apps/<slug>/.github/workflows/ci.yml`.
- **Shared packages** — `packages/ai` (AI layer) and `packages/kit` (db driver switch, rate limiter, errors, headers) are shared to avoid five divergent copies; each app re-exports through `src/lib/ai`.

## AI provider decisions
- **Added an in-process local adapter (Transformers.js)** alongside Ollama, Groq, Gemini, HF Inference and optional paid keys — Ollama is not installed and no hosted key exists, so this is the only way to make *real* model calls at $0 on this machine without installing system software. It runs ONNX open models on CPU from an npm package.
- **Local generation model: `onnx-community/Qwen2.5-1.5B-Instruct` (q4, Apache-2.0)** — probe: ~5s warm load, ~3s for a 30-token JSON answer on CPU. DirectML GPU was slower (18.6s) so CPU is default. Qwen2.5-3B was rejected because its license is not Apache-2.0.
- **Embeddings: `Xenova/all-MiniLM-L6-v2` (384 dims, Apache-2.0)** — probe: sim("refund my order","I want my money back")=0.569 vs 0.245 for an unrelated pair. The same model is served by HF Inference (`sentence-transformers/all-MiniLM-L6-v2`), so vectors stay compatible between local dev and a serverless deploy.
- **Hosted adapters (Groq/Gemini/HF/OpenAI-compatible) are implemented and unit-tested against mocked HTTP only** — no keys available; marked "not verified live" in each README.

## Market research (Step 1)
- **Swapped App D: Real-time Project Manager -> Real-time Booking & Scheduling** — searches found several recent Upwork client posts for custom booking systems and none for custom Kanban builds (see docs/market-research.md); booking keeps the real-time, optimistic-UI and conflict-handling requirements.
- **Apps A, B, C, E kept** — each maps to a recurring gig type with direct client job posts cited in docs/market-research.md.

## App A — Helpdesk
- **Custom orgs/memberships tables instead of Better Auth's organization plugin** — explicit RBAC matrix and queries are easier to test and to explain to clients; Better Auth handles only identity.
- **URL-scoped tenancy (`/o/<slug>/...`)** — every request names its tenant; non-members get 404 so org existence isn't revealed.
- **Seed tickets never carry invented AI output** — older seed tickets have agent-set category/priority (`triage_status=manual`); newest ones are triaged only by a real model (`--with-ai`) or marked "AI unavailable".
- **Triage runs in `after()`** — customers aren't kept waiting on a ~15 s CPU model call; failures are recorded on the ticket.
- **Few-shot triage prompt + `normalizeTriage`** — the 1.5B model misclassified "charged twice" without examples; examples are distinct from the eval set.
- **Internal notes excluded from draft prompts** — drafts are customer-facing; summaries (agent-only) include them.
- **Qwen3-1.7B rejected as default** — scored 5/8 vs Qwen2.5-1.5B 6/8 on a quick triage probe and was slower (3.2 s vs 2.3 s per answer).
- **Sign-in limit 5/min per IP, configurable (`AUTH_SIGNIN_PER_MINUTE`)** — E2E raises it; production default unchanged.
- **Standalone output only for Docker (`BUILD_STANDALONE=1`)** — `next start` warns with standalone output, so local/CI E2E builds stay non-standalone.
- **Docker deps stage copies the whole (dockerignored) tree** — npm workspaces need every workspace manifest for `npm ci`; simplicity over layer caching.
- **CI has a real-Postgres job** — the build machine has no Postgres, so migrations/seed/health are verified against `pgvector/pgvector:pg17` in GitHub Actions.
- **Client/server boundary** — client components import only `@/lib/form-state` (types) and server actions; a bug where `@portfolio/kit` leaked into the client bundle was fixed and a scan confirmed no other leaks.
