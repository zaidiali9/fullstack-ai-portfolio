# HUMAN-TODO — things only you can do

Everything below needs an account, a credential, a payment method, a public identity or a decision that a
build agent must not make on your behalf. Items are ordered by value: do the top block first.

## 1. Publish the code (unblocks CI, which verifies the parts that couldn't run on the build machine)
- [ ] Create a GitHub repository (public, for a portfolio) and push: `git remote add origin <url> && git push -u origin main`.
- [ ] Open the **Actions** tab and check every workflow. These jobs have **never run** yet and cover what
      wasn't verifiable locally (no Docker/Postgres on the build machine):
  - `postgres` jobs: migrations + seed on real PostgreSQL (pgvector image) for every app; booking's exclusion
    constraint + LISTEN/NOTIFY tests and Tally's SQL guard/executor tests on real Postgres.
  - `docker` jobs: every Dockerfile builds.
  - Fix anything red before linking the repo anywhere. Expect possible first-run issues in Docker builds.
- [ ] Add a repo description and topics (nextjs, postgresql, ai, rag, portfolio).

## 2. Deploy demos (each app's README has a Quickstart and an env table)
Suggested free/cheap combination (check current free tiers and terms yourself):
- [ ] **Database**: one Postgres per app (Neon or Supabase free tier). helpdesk, kb-chat and storefront need the
      `vector` extension; booking needs `btree_gist`; Tally creates a role (`analytics_reader`) — confirm your
      provider allows `CREATE ROLE`, otherwise the app still runs with the guard + read-only transaction and logs a warning.
- [ ] **Hosting**: Vercel (or Render/Fly) per app, root directory `apps/<slug>`; set `APP_URL`, `DATABASE_URL`,
      `BETTER_AUTH_SECRET` (`openssl rand -base64 32`). Run `npm run db:migrate` and `npm run db:seed` once
      against each database (from your machine with `DATABASE_URL` set).
- [ ] **AI provider for demos**: the local Transformers.js models are too heavy for serverless. Create a free
      **Groq** or **Gemini** API key and set `GROQ_API_KEY` / `GEMINI_API_KEY` (no app requires a paid key).
      Then re-run each app's eval against that provider and update the README numbers if you want hosted-model figures
      (the committed numbers are for the local 1.5B models and must stay labelled as such).
- [ ] kb-chat: set `CRON_SECRET` and keep `vercel.json` (ingestion queue cron).
- [ ] booking: SSE needs a long-lived server; on Vercel use the Node runtime and expect reconnects (the client
      reconnects automatically). Render/Fly keep connections open better.
- [ ] Replace every `[DEMO LINK]` in `docs/*/marketing.md`, `docs/cold-emails.md`, `docs/fiverr-gigs.md`,
      `docs/upwork-profile.md` and `portfolio-site/` with the real URLs.

## 3. Credentials for optional features (never commit them; use `.env` / host env vars)
- [ ] **Stripe (test mode only)** for helpdesk billing and storefront checkout: create a Stripe account, copy the
      `sk_test_…` key, create the Pro price for helpdesk (`STRIPE_PRICE_PRO`), and add webhook endpoints → `STRIPE_WEBHOOK_SECRET`.
      Pay with `4242 4242 4242 4242`. Live keys are refused by the apps by design.
- [ ] **GitHub OAuth** (optional sign-in): create an OAuth app per deployed URL; callback `<APP_URL>/api/auth/callback/github`.
- [ ] **SMTP** (helpdesk invitations/notifications): any SMTP provider (`SMTP_URL`); without it emails are only listed in Settings → Emails.

## 4. Profiles and outreach (drafts are in docs/)
- [ ] Review and personalise `docs/upwork-profile.md`, `docs/fiverr-gigs.md`, `docs/cold-emails.md`: your name,
      location/time zone, rates, availability, real photo. Don't add claims the projects don't support.
- [ ] Record short demo videos (Loom, 60–90 s each) — screen recordings of the deployed apps.
- [ ] Create the Upwork/Fiverr profiles; Fiverr gig images can use the README screenshots (all original).
- [ ] Before sending cold emails: check the recipient's site yourself, personalise the first line, follow
      anti-spam law (CAN-SPAM/GDPR: real sender identity, opt-out line), and send in small batches.

## 5. Decisions left to you
- [ ] License for the repository (MIT is common for portfolios). All third-party assets are listed in each README.
- [ ] Whether to keep demo logins public on deployed sites (they reset when you re-seed; consider a nightly re-seed).
- [ ] Custom domain for the portfolio site.
