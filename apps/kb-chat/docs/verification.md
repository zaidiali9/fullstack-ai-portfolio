# Verification log — Cairn (apps/kb-chat)

Real runs on the build machine (Windows 11, Node 22.18.0, i7-11370H CPU), 2026-10-05.

## 1. Migrations and seed (real ingestion pipeline)
```
$ npm run db:migrate
Migrations applied (pglite at D:\FullStack\apps\kb-chat\.data\pglite) in 2301ms
$ npm run db:seed          # AI_LOCAL_MODELS=true in .env
Seeded 3 users, 2 workspaces, 6 documents -> 6 indexed (0 failed), 22 passages, embeddings: local/Xenova/all-MiniLM-L6-v2 in 5304ms
```
The 6 seed documents cover all four parsers: Markdown, plain text, a 3-page PDF generated with pdf-lib (parsed
by unpdf) and a DOCX generated with the `docx` package (parsed by mammoth).

## 2. Unit + integration tests (Vitest, in-memory PGlite)
```
$ npm run test:coverage
 Test Files  4 passed (4)
      Tests  54 passed (54)
Statements   : 85.52% ( 567/663 )
Branches     : 75.28% ( 332/441 )
Functions    : 88.15% ( 134/152 )
Lines        : 87.75% ( 480/547 )
```
Tests use the labeled STUB provider (`AI_PROVIDER=stub`) for wiring only; metrics come from the real-model eval below.

Security bug found by these tests and fixed: URLs with IP-literal hosts (`http://127.0.0.1/`,
`http://169.254.169.254/…`) bypassed undici's DNS-lookup hook, so the connect-time private-address check never ran.
Debug output that confirmed it:
```
http://localhost:4555/ lookup called: 1 undefined:fetch failed <- EBLOCKED:blocked_address
http://127.0.0.1:4555/ lookup called: 0 undefined:fetch failed <- ECONNREFUSED:connect ECONNREFUSED 127.0.0.1:4555
```
`safeGet` now rejects non-public IP literals on every hop; 5 regression cases cover IPv4, IPv6, metadata and 0.0.0.0.

## 3. Lint, typecheck, build
```
$ npx eslint . && npx tsc --noEmit      -> clean
$ npm run build                          -> ✓ Compiled successfully
```
(One build attempt failed with `next/font: error` while fetching Google Fonts — a network blip; the retry succeeded.)

## 4. End-to-end (Playwright, production build, real Chrome, stub AI)
```
$ npm run build && npm run test:e2e
  ok  1 › viewer asks a question and opens the cited passage (stub AI)
  ok  2 › questions outside the documents are refused without inventing an answer
  ok  3 › editor uploads a document, it is indexed, and answers cite it (stub AI)
  ok  4 › viewers cannot upload; invalid files are rejected with a clear message
  ok  5 › owner sees settings; the widget only renders on allowlisted sites
  ok  6–15 › landing, sign-in, chat, documents, settings: no axe violations (light + dark) / no horizontal scroll at 360px
  15 passed (32.3s)
```
The first run failed on axe rule `label` for the hidden file input on the documents page; it now has `aria-label="Upload files"`.

## 5. Manual walkthrough with the real local model (`next dev`, Playwright script)
```
OK  ask question (real model) 29016ms
DIALOG: [1] Travel and Expense Policy | Page 2 | Meals and per diem Client dinners are reimbursable up to $75 per person, including tax and tip. ...
OK  out-of-scope refusal 13679ms
OK  owner upload + live status 9579ms
WIDGET: Brightline Handbook | Answers come from Brightline Handbook's documents · AI-generated, may be imperfect | Hi! Ask me about Brightlin...
overflow px: 0          (375 px mobile)
page errors: []
```
Found during the walkthrough: the Sources list showed all 5 retrieved passages while the answer was still
streaming; it now appears only when the answer is complete and lists only cited passages.

## 6. RAG eval (real model, no stubs) — `npm run eval`
22 cases (17 in-scope with expected document + key fact, 5 out-of-scope incl. one answerable only from another workspace).

| Run | Change | hit@5 | fact | cites correct doc | model-written citations | false refusal | correct refusal |
|---|---|---|---|---|---|---|---|
| 1 ([baseline](metrics/eval-rag-baseline.json), [log](metrics/eval-rag-baseline.log)) | initial prompt, temperature 0.1 | 100 | 100 | 47.1 | 47.1 | 0 | 100 |
| 2 | + worked example in the prompt | 100 | 76.5 | 70.6 | 70.6 | 11.8 | 100 |
| 3 | example reverted; + labeled sentence→passage attribution | 100 | 94.1 | 82.4 | 35.3 | 5.9 | 100 |
| 4 ([final](metrics/eval-rag.json), [log](metrics/eval-rag.log)) | + temperature 0 (deterministic) | **100** | **100** | **88.2** | 47.1 | **0** | **100** |

Final summary (`docs/metrics/eval-rag.json`):
```
"retrievalHitAt5Pct": 100, "citationCorrectPct": 88.2, "modelWrittenCitationCorrectPct": 47.1, "wrongDocCitations": 0,
"factAccuracyPct": 100, "falseRefusalPct": 0, "correctRefusalPct": 100, "crossWorkspaceLeaks": 0, "avgLatencyMs": 13520
```
Run 2's prompt made the 1.5B model refuse or ramble (e.g. `"[I couldn't find this in the documents.]"` for the
security-incident question even though the passage was retrieved), so it was rejected.

## 7. Lighthouse (production build, `next start`, mobile emulation, Lighthouse 13.5.0)
```
landing http://localhost:3202/ {"performance":95,"accessibility":100,"best-practices":100,"seo":100} mobile
chat http://localhost:3202/w/brightline/chat {"performance":92,"accessibility":100,"best-practices":100,"seo":100} mobile
```
(chat measured signed in as the viewer via `--extra-headers` with a session cookie)

## 8. Screenshots
`npm run screenshots` against `next start` on the seeded dev database with the local model:
```
  1 passed (42.7s)
```
The answer and refusal in `chat-citations.png` were generated live during capture.

## 9. Dependency audit
```
$ npm audit --omit=dev
found 0 vulnerabilities
```
Dev-only: the `braces` advisory (GHSA-vfj7-8cjw-p6xm, no patched version exists) is reached through ESLint and the
shadcn CLI (`ts-morph` → `fast-glob`); it never ships in the app.

## CI on GitHub (after publishing, commit 86bbfa9)
All jobs passed on GitHub Actions (ubuntu-latest): lint, typecheck, unit tests with coverage, production build and the
Playwright E2E suite; Docker image build; real PostgreSQL (`pgvector/pgvector:pg17` service) — migrations, seed, production build and a health check;
production dependency audit. Run: https://github.com/zaidiali9/fullstack-ai-portfolio/actions/runs/37341160288
(The first runs failed on a Windows-only lockfile and once on a Google Fonts download; both fixed — see DECISIONS.md.)

## Deployed on Railway (2026-10-05)
Live at https://kb-chat-production-15ef.up.railway.app, on a Railway Postgres 18.6 database of its own, with no AI provider configured (see `deploy/README.md`). Migrations and seed ran in Railway's setup job (`railway logs`):
```
[setup] Postgres 18.6 (Debian 18.6-1.pgdg13+2); extensions available: btree_gist, vector
Seeded 3 users, 2 workspaces, 6 documents -> 6 indexed (0 failed), 22 passages, embeddings: unavailable (keyword search only) in 619ms
```
Checked from this machine after `railway up --service kb-chat --ci` ("Deploy complete"):
```
GET /api/health -> 200 {"status":"ok","database":"ok","ai":{"chat":"unavailable","embeddings":"unavailable"}}
GET /         -> 200 <title>Cairn — chat with your documents</title>
GET /sign-in  -> 200 <title>Sign in · Cairn</title>
```
Security headers present on `/`: Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy.
Not checked on the deployment: signing in with the demo logins (left for a human; a build agent doesn't enter passwords on hosted sites) and AI features (off).

## 10. Not verified on this machine
- `docker compose up` as a whole stack (image build and real-Postgres jobs pass in CI).
- GitHub OAuth; hosted AI providers against live APIs; URL ingestion against the public internet (tested against a local server with private addresses explicitly allowed).
