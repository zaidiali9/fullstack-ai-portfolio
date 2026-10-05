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

## App B — Knowledge Base Chat (Cairn)
- **Raw uploads stored in Postgres (bytea) and deleted after indexing** — no object storage needed for a $0 deploy; keeps the job queue transactional with the document row.
- **Job queue in Postgres (`FOR UPDATE SKIP LOCKED`) driven by `after()` + a cron route** — serverless-friendly; no separate worker service needed.
- **Hybrid retrieval with reciprocal rank fusion** — vector search misses exact terms (VAT numbers, product names); keyword search misses paraphrases.
- **No-model refusal below cosine 0.3** — cheaper and removes the chance to hallucinate when nothing relevant exists.
- **Labeled post-hoc citation matching** — the 1.5B model answered correctly but omitted [n] markers in about half of answers; a few-shot example raised citations but cut fact accuracy to 76.5%, so it was rejected in favor of sentence→passage matching stored as `method: "matched"` and disclosed in the UI.
- **Temperature 0 for answers** — deterministic, reproducible answers; improved the eval to 100% fact accuracy with 0 false refusals.
- **Stream trailer added to the shared stream protocol** — backward-compatible way to send final citations after streaming (App A unaffected).
- **SSRF: IP-literal check added** — undici skips custom DNS lookup for IP hosts; caught by tests.
- **Members added by existing email (no invitations)** — App A already demonstrates invitations; kept B smaller per scope rule.
- **Widget allowlist via Referer** — headers can't vary per workspace statically; `/embed/*` is frameable and the page checks the embedding origin.
- **Bug fix (A, B, C): demo-account buttons on the sign-in page dropped the `next` redirect** — found by the storefront E2E; fixed in the shared auth form copy of each app.

## App C — Storefront (Fernwood Supply)
- **Procedurally generated product art (SVG -> WebP via sharp)** — zero image-licensing risk at $0; real `next/image` optimization still applies.
- **User role as a Better Auth additional field with `input: false`** — simplest RBAC for a single-tenant store; can't be set at sign-up.
- **Stripe session created before the order row** — a Stripe failure leaves no orphaned pending order; the webhook remains the only path to "paid".
- **Guarded stock decrement (`greatest(stock - q, 0)`) on payment, not at add-to-cart** — no reservations (documented limitation); avoids negative stock under races.
- **Guest cart cookie + `/app` merge route** — route handlers can set cookies; server components can't.
- **Search embeds the query, so it is rate limited per IP with silent keyword fallback** — protects CPU/API cost without breaking browsing.
- **Description rules in the zod schema (repair turns) but length as a warning** — measured: rules-in-schema cut banned content from 8/15 to 0; a 30-word minimum dropped validity to 33%, so it became an advisory.
- **Bug fix (A, B, C): sign-in demo buttons dropped the `next` redirect** — found by storefront E2E.

## App D — Bookwell (booking)
- **Single business, not multi-tenant** — scope rule; the interesting problems (concurrency, time zones, realtime) don't need tenancy, and helpdesk already shows multi-tenancy.
- **Stripe deposit dropped** — scope rule 9; storefront already demonstrates Stripe Checkout + webhooks. Listed in docs/improvements.md.
- **Double booking prevented by a Postgres exclusion constraint (btree_gist, `tstzrange [starts_at, blocked_until)`, only held/confirmed rows)** — app-level checks race; the constraint can't. App catches SQLSTATE 23P01 and answers 409 with the nearest alternatives.
- **Hold → confirm with a 5-minute hold (HOLD_MINUTES), one active hold per customer** — stops a slot being taken while the customer types notes; expired holds are deleted lazily before inserts (no cron needed).
- **Optimistic concurrency via `version` on cancel/reschedule/outcome** — a stale tab gets a clear 409 "changed by someone else" instead of overwriting.
- **Reschedule updates the row in place** — keeps the reference and history; availability ignores the booking itself so small nudges work.
- **Realtime = Postgres LISTEN/NOTIFY fanned out to SSE** — NOTIFY inside the transaction only fires on commit; works across instances on real Postgres; SSE is one-way, proxy friendly and needs no extra service. Public stream only carries {date, staffId}; staff stream adds references.
- **Kit: `DbHandle.listen()` and `pgliteExtensions` option** — additive shared-package change needed for LISTEN and btree_gist; A/B/C typecheck and kit tests re-run.
- **NL booking: model extracts service/staff/time preference only; dates are parsed deterministically** — small local models are unreliable at calendar arithmetic and a wrong date books the wrong day. The resolved range is shown to the user. The model never sees the calendar and cannot book.
- **Date conventions: weeks start Monday; bare/"this" weekday = next occurrence incl. today; "next <weekday>" = that weekday in next week** — ambiguous in English; chosen once, unit-tested and displayed back.
- **Weekly digest = SQL/JS stats + model narrative, with an unverified-number check** — any number in the narrative not present in the stats is flagged to the owner instead of trusted.
- **Owner-only digest; staff see calendar/activity** — business value figures are owner information.
- **Timezone: America/New_York for the seed studio, all slot math via @date-fns/tz TZDate** — DST days (23/25 h) are unit-tested.
- **Exact dates and clock times are parsed in code; the model's clock times are dropped unless the request contains a time** — eval baseline: the model invented "after 14:00" for "Friday afternoon" and turned "after 4pm" into "evening". With code parsing the final time-window accuracy is 100% (raw model 73.7%).
- **Service-name fallback when the model abstains** — if the model returns no valid service and the request names exactly one service by a distinctive word, use it (end-to-end accuracy 78.9% → 89.5% on the eval). Shared words like "massage" never match.
- **Few-shot examples not added** — rules-only prompt changes were enough, and few-shot made app B worse; examples would also overlap the small eval set.
- **Digest stats are passed as plain fact lines, not JSON** — with JSON the 1.5B model added last week and next week together ("35 appointments"); with fact lines the observed runs were grounded. The number check stays either way.
- **Release a customer's previous hold before checking availability** — otherwise their own hold could block their new pick (found as a flaky unit test).
- **Availability `exclude` parameter for rescheduling, honoured only for the booking's owner/team** — the booking's own slot must look free while moving it, without letting anyone probe other bookings.
- **Canonical URLs per page, not in the root layout** — a layout canonical made every page claim to be "/" (Lighthouse SEO 91 on the booking page).
- **robots.txt and sitemap.xml are dynamic** — they read APP_URL at runtime so a deployment never advertises the build-time URL.
- **Toast colors darkened in this app only** — sonner's rich success text is 4.25:1; earlier apps are left as they are (rule 11; their axe runs didn't hit a visible toast). Listed in docs/improvements.

## App E — Tally (NL analytics)
- **Guard uses libpg-query (the real PostgreSQL 18 parser, WASM)** — same grammar as the database (PGlite is PG 18), so the guard can't be fooled by parser differences. Allowlists: statement type (one SELECT), AST node types, tables (demo.*), functions, cast types, special values.
- **Bare typed fields are checked too** — the parser emits `TypeCast.typeName` without a node wrapper; a test caught `::regclass` passing before this was handled. An AST key audit found no other unwrapped field that can carry a relation, function or type.
- **CTE names may not start with `pg_`** — otherwise an out-of-scope reference to a catalog view could pass the "table is a CTE" rule.
- **Defense in depth at execution** — READ ONLY transaction, `SET LOCAL ROLE analytics_reader` (can read only the demo schema; verified to get "permission denied" on account/user), `search_path = demo`, `statement_timeout`, EXPLAIN cost ceiling, row cap, app timeout, audit row for every attempt.
- **EXPLAIN cost ceiling 250,000** — PGlite ignores statement_timeout (measured: pg_sleep(1.5) ran 1503 ms under a 300 ms timeout). After ANALYZE, legitimate test queries cost ≤ 21k and an orders×order_items cross join 1.77M.
- **Seed runs ANALYZE** — without statistics the planner estimated the same cross join at 826k, under the first (1M) ceiling.
- **Dataset in its own `demo` schema, app tables in `public`** — the allowlist and the role can both draw a hard line between data users may query and the app's own tables.
- **Separate synthetic dataset (fictional retailer, no names/contact details)** — rule 8; queries over it are realistic (joins, time series, cohorts) without any personal data.
- **Model output is a JSON plan (sql, title, chart, explanation); the chart is re-validated against the actual result columns** — invalid charts fall back to type-based inference.
- **Up to 2 repair turns with the guard/database error** — the SQL from the last attempt and the reason are always shown, with an editor, so a failed answer still helps.
- **Hand-written SQL uses exactly the same path** — the non-AI fallback when no provider is configured.
- **Shared dashboards are public read-only links with 24-byte random tokens; revoking deletes the token** — no accounts needed for viewers; tiles re-run through the guard on every view and are rate limited per IP.
- **CSV export neutralises formula injection (leading = + - @ tab CR → apostrophe) and adds a UTF-8 BOM** — OWASP CSV injection guidance; BOM for Excel.
- **Example dashboard uses hand-written SQL labelled "Hand-written"** — seed content must not pass as AI output (rule 3).
- **Model: Qwen2.5-Coder-1.5B-Instruct (Apache-2.0) for SQL** — the general Qwen2.5-1.5B baseline got 1 of 22 eval questions right (4.5%). Qwen2.5-Coder-3B was ruled out: its upstream licence is "other" (Qwen Research License), not permissive (rule 7). 7B (Apache-2.0) is too slow for CPU-only demos.
- **Queries are evaluated in UTC (`SET LOCAL TIME ZONE 'UTC'`)** — the eval exposed that PGlite used the machine's zone (+05), so "this year"/date_trunc answers depended on the server. Midnight UTC timestamps are returned as plain dates.
- **Only genuine parse errors become user-facing "syntax" messages** — a WASM load failure was reported as a syntax error including a server path on a public page; other errors now rethrow to the generic 500 path.
- **The app states outcomes itself; model text is quoted** — in the eval the model claimed a table "was successfully dropped" when nothing ran.
- **README hero screenshot uses a question the model answered correctly in all eval runs** — the first capture ("monthly revenue") was a real miss and is cited in Limitations; the accuracy figure (50%) sits next to the image.
- **Lighthouse SEO 63 on shared dashboards accepted** — share links are deliberately `noindex`.

## Final QA
- **Accepted dev-only advisory: `braces` GHSA-vfj7-8cjw-p6xm (high, ReDoS-style stack exhaustion), range <= 3.0.3** — 3.0.3 is the newest published version, so there is no patched release to override to. It is reached only through dev CLIs (`shadcn` via fast-glob/micromatch, `eslint-config-next`) on globs written by us, never user input. `npm audit --omit=dev`: 0 vulnerabilities. npm's suggested "fix" downgrades to years-old majors and was rejected. `shadcn` stays because `packages/ui` CSS imports `shadcn/tailwind.css`.
- **Fix (CI): lockfile regenerated from manifests in a clean folder** — the Windows-generated `package-lock.json` only recorded win32 native optional packages (npm/cli#4828), so Linux CI and Docker failed to load rolldown (vitest) and lightningcss (Tailwind). Regenerating without `node_modules` records all platforms; versions changed only by re-hoisting and in-range patch/minor updates. All typechecks, unit suites and builds re-run locally before pushing.
- **Fonts self-hosted (`packages/ui/fonts`, `next/font/local`) instead of `next/font/google`** — booking's first CI build failed when a Google Fonts download dropped mid-build (passed on re-run). Committing the OFL font files (Fontsource 5.3.0 variable Latin builds, 232 KB total, licences alongside) makes every build — CI, Docker, deploys — independent of Google's servers. Verified: all 5 apps build with 0 references to fonts.gstatic/googleapis, and the browser loads only local woff2 files.

## Deployment
- **Host: Railway (user's choice), free plan, AI off** — the free plan allows Postgres + 3 services, so Cairn, Bookwell and Tally are deployed (user's pick); helpdesk and storefront deploy the same way on a paid plan. No AI key is set (user's choice), so the apps show "AI unavailable" until a Groq/Gemini key is added in the dashboard.
- **One Postgres server, one database per app** — fits the free limit and keeps app data isolated. Railway's `postgres-ssl:18` image reported both `vector` and `btree_gist` as available, so no custom image was needed.
- **Migrations and seeds run as a job inside Railway (`deploy/Dockerfile.setup`)** — the Postgres service has no public TCP proxy and the CLI can't create one; running on the private network also keeps credentials off this machine. With no spare service slot, the job borrowed the booking service and was then switched back.
- **Setup job drops the host service's `APP_URL` before seeding** — the first run failed kb-chat's env validation with "Invalid URL" at APP_URL (the deploy captured it before the domain existed); seeds don't need it.
- **Secrets come from Railway's `${{secret(N)}}` and service references** — nothing secret is typed, printed or committed.
- **Railway CLI runs from PowerShell** — the Git Bash sandbox here has no DNS for the CLI's API calls.
