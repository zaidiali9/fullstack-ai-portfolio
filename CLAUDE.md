# CLAUDE.md

On 'continue', read PROGRESS.md and resume at the first unchecked item without asking questions.

This monorepo is a portfolio of 5 production-style full-stack apps with AI features.
Log every assumption or choice in DECISIONS.md (one line + reason). Update PROGRESS.md after every task.
Commit after every completed task (conventional commits).

## Hard rules (never violate)
1. HONESTY: never fabricate metrics, screenshots, client names, testimonials, revenue, or user counts.
   Every number in a README/marketing file must come from a command that was run, with the command or
   script path cited beside it.
2. VERIFY: never mark a task done unless it was run and seen working. Record the command and a short real
   output excerpt in the app's docs/verification.md.
3. NO FAKE AI OUTPUT: seed data (users, products, tickets) is allowed and labeled "seed data". AI responses
   must come from a real model call. Tests may stub the provider only if the test name says so.
4. SECRETS: never commit keys. Only .env.example. `.env*` is gitignored.
5. SECURITY BASICS in every app: zod validation, CSRF-safe forms, hashed passwords, rate limiting on auth
   and AI endpoints, secure headers, authz checks on every server action and API route, no secrets or raw
   stack traces to the client, dependency audit.
6. AI SAFETY AND COST: cap input/output length, per-user rate limits, timeouts, usage logging,
   prompt-injection mitigation (user/document content is untrusted data; model output never executes
   privileged actions without validation). Model-generated SQL must pass a read-only allowlist guard.
7. LICENSES: record every dataset, model, font, and image source + license in the app README.
8. PRIVACY: no real personal data; no scraping of sites that prohibit it.
9. SCOPE: a smaller app that fully works beats a bigger broken one.
10. FAILURE: if a step fails 3 different ways, log it under "Blocked" in PROGRESS.md, skip, continue.
11. Do not rewrite earlier apps while building later ones, except to fix bugs (log the fix).

## Repo structure
```
apps/<app-slug>/            Next.js app: src/, drizzle/ (schema, migrations, seed), tests/unit, tests/e2e,
                            docker-compose.yml, Dockerfile, .env.example, README.md, docs/verification.md
packages/ai/                shared provider-agnostic AI module
packages/kit/               shared server utilities (db driver switch, rate limit, headers, errors)
portfolio-site/             static portfolio page
docs/                       market-research, upwork-profile, cold-emails, fiverr-gigs, improvements,
                            HUMAN-TODO, <app-slug>/case-study.md, <app-slug>/marketing.md
.github/workflows/<slug>.yml  CI per app (GitHub only runs root workflows; see DECISIONS.md)
PROGRESS.md  DECISIONS.md  CLAUDE.md
```

## Local environment notes
- No Docker/Postgres on the build machine: dev + tests use PGlite (Postgres 18 WASM + pgvector) when
  `DATABASE_URL` is unset; set `DATABASE_URL=postgres://...` for real Postgres (Neon/Supabase/compose).
- PGlite is single-process: never run the seed script while a dev server holds the same data dir.
- Local AI: Transformers.js (`AI_PROVIDER=local`) downloads Apache-2.0 models to `.cache/hf` on first use.
- Shell: Windows; prefer the Bash tool (Git Bash) with POSIX syntax.
