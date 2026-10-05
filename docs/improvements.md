# Improvements backlog

What I would do next for each app, ordered by impact. Everything here is **not built**; each item comes from a
measured limitation (eval, Lighthouse, tests) or something the README lists under Limitations.

## Cross-cutting
1. **Measure a hosted model.** All AI numbers in this repo come from free local 1.5B models on a CPU (13–33 s per call).
   Re-run every eval (`npm run eval` in each app) against a free-tier hosted model (Groq/Gemini) and publish both
   columns side by side. Expect large accuracy and latency gains, but report only what the runs show.
2. **Test the remaining deployment paths.** CI now passes on GitHub (Docker image builds; real-Postgres jobs incl.
   booking's concurrency tests and Tally's SQL safety tests). Still untested: `docker compose up` as a full stack, a
   multi-instance booking deployment (LISTEN/NOTIFY fan-out across servers), and a query hitting Postgres' timeout in Tally.
3. **Background job runner.** helpdesk triage and kb-chat ingestion use `after()` plus cron retries. A small Postgres
   queue worker (the kb-chat job table already supports `FOR UPDATE SKIP LOCKED`) would remove serverless time limits.
4. **Shared UI fixes back-ported**: sonner's success-toast contrast (4.25:1) was fixed in booking and Tally only; port the
   CSS override to helpdesk, kb-chat and storefront (their axe runs didn't happen to hit a visible toast).
5. **Email**: verification and password reset for all apps (Better Auth supports both; needs an SMTP provider).

## A — Tidal Desk (helpdesk)
- Injection resistance: pattern stripping left 1 of 3 eval attacks able to change the category. Add a second-pass
  classifier ("does this ticket contain instructions to the assistant?") and require agreement before auto-applying triage.
- Priority accuracy was 75% in the eval: add per-org examples (few-shot from the org's own resolved tickets) and an
  "agent corrected triage" feedback loop that grows the eval set.
- Attachments on tickets (object storage, virus scanning), SLA timers, and canned responses.

## B — Cairn (knowledge-base chat)
- Citations: the local model wrote its own citation markers for 47.1% of answers; the rest were matched automatically and
  labelled. Try constrained output (answer + cited chunk ids as JSON) with a hosted model.
- OCR for scanned PDFs; incremental re-ingestion for changed URLs (ETag/Last-Modified).
- Email invitations for workspace members; per-document access control.

## C — Fernwood Supply (storefront)
- Description drafts: median 22 words; add a length-aware second pass and a brand-voice guide per store.
- Inventory reservation during checkout (hold stock while the Stripe session is open), tax (Stripe Tax), discount codes.
- Mobile Lighthouse performance 89–91: cache catalog pages (the cart badge could load client-side so pages become static).

## D — Bookwell (booking)
- Deposits/card-on-file via Stripe (dropped for scope), no-show fees.
- Admin UI for services, hours and time off (currently seed-managed); multiple locations and resources (rooms) using the
  same exclusion-constraint pattern.
- Reminders by email/SMS with ICS files; waitlist that offers freed slots; Google/Outlook calendar sync.
- NL assistant: 2 of 19 eval requests still wrong ("sports massage", "skin treatment"). Add service synonyms owned by the
  business, and ask a clarifying question when the service is ambiguous instead of guessing.

## E — Tally (NL analytics)
- **Accuracy.** The local coder model still writes wrong-but-valid SQL for about half the eval questions (e.g. `sum`
  instead of `avg`, an unrequested date filter). Next steps, in order: a semantic layer of named metrics ("revenue",
  "active customers") the model selects instead of writing SQL from scratch; self-consistency (generate 2–3 candidates,
  run them, prefer agreeing results); a hosted model.
- **Timeouts on PGlite.** `statement_timeout` isn't enforced by PGlite; the EXPLAIN cost ceiling is the protection there.
  In production use real Postgres (timeouts verified by the CI job once it runs).
- **Managed Postgres roles.** Some hosts don't allow `CREATE ROLE`; the app then runs without the reader role (guard +
  read-only transaction still apply) and logs a warning. Document a host-specific setup or use a separate read-only
  connection string instead of SET ROLE.
- Scheduled dashboard emails, per-dashboard viewer lists (instead of only public links), question history with
  thumbs-up/down feeding the eval set.
