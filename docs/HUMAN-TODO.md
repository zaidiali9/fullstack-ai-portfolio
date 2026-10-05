# HUMAN-TODO — things only you can do

Everything below needs an account, a credential, a payment method, a public identity or a decision that a
build agent must not make on your behalf. Items are ordered by value: do the top block first.

## 1. Publish the code — done 2026-10-05
- [x] Public repo: https://github.com/zaidiali9/fullstack-ai-portfolio (pushed with `gh repo create`).
- [x] All 5 CI workflows green (lint, typecheck, unit + E2E, Docker image builds, real-Postgres jobs incl. booking's
      concurrency tests and Tally's SQL safety tests, production audit) on commit 86bbfa9.
- [x] Repo topics: ai, full-stack, llm, nextjs, pgvector, playwright, portfolio, postgresql, rag, stripe, text-to-sql, typescript.
- [ ] Pin the repo on your profile (web only — GitHub's API has no pin mutation): github.com/zaidiali9 → "Customize your pins".

## 2. Deploy demos — 3 of 5 live on Railway (2026-10-05)
Railway free plan (Postgres + 3 services); setup and commands in `deploy/README.md`.
- [x] Cairn: https://kb-chat-production-15ef.up.railway.app
- [x] Bookwell: https://booking-production-d564.up.railway.app
- [x] Tally: https://nl-analytics-production.up.railway.app
- [x] `[DEMO LINK]`s for these three filled in (marketing docs, cold emails, Fiverr gigs, portfolio page, app READMEs).
- [ ] **Sign in once on each demo** with the demo logins from its README (the build agent checked health, pages and
      headers but doesn't type passwords into hosted sites).
- [ ] **Turn AI on (optional)**: create a free **Groq** or **Gemini** API key and add `GROQ_API_KEY` /
      `GEMINI_API_KEY` to each service's Variables in the Railway dashboard (it redeploys itself). For Cairn's
      semantic search also add `HF_TOKEN` (embeddings), then re-run the setup job so seed passages get vectors.
      If you want hosted-model figures, re-run each app's eval against that provider and update the README numbers
      (the committed numbers are for the local 1.5B models and must stay labelled as such).
- [ ] **Helpdesk and storefront**: need a paid Railway plan (or another host). Same recipe as `deploy/README.md`; both
      need the `vector` extension. Then fill the remaining `[DEMO LINK]`s (helpdesk/storefront marketing, Fiverr
      gig 2/3, portfolio page).
- [ ] Watch the free plan's usage in the Railway dashboard; the demos stop if its credit runs out.

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
