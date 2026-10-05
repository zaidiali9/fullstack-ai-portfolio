# Verification log — Fernwood Supply (apps/storefront)

Real runs on the build machine (Windows 11, Node 22.18.0, i7-11370H CPU), 2026-10-05.

## 1. Migrations and seed
```
$ npm run db:migrate
Migrations applied (pglite at D:\FullStack\apps\storefront\.data\pglite) in 2484ms
$ npm run db:seed              # AI_LOCAL_MODELS=true in .env
Seeded 2 users, 35 products (+6 placeholder images), 2 example orders; embedded 35 products (local/Xenova/all-MiniLM-L6-v2) in 4109ms
```
Product images are rendered by `drizzle/product-art.ts` (SVG → WebP with sharp) into `public/products/`.

## 2. Unit + integration tests (Vitest, in-memory PGlite, stub AI labeled)
```
$ npm run test:coverage
      Tests  22 passed (22)
Statements   : 73.81% ( 296/401 )
Branches     : 65.23% ( 197/302 )
Functions    : 72.44% ( 71/98 )
Lines        : 79.12% ( 254/321 )
```
Covers: cart limits/merge/cookie ownership, shipping totals, Stripe webhook (paid → guarded stock decrement + cart
cleared, idempotency, expired → cancelled, refunds, forged signature rejected), order ownership and status
transitions, catalog browse/sort/filter, semantic search + similar items (stub embeddings), admin product save,
admin-only actions/routes, AI description schema rules and injection stripping, post-login merge route
(open-redirect attempt `//evil.example` → `/`).

## 3. Lint, typecheck, build
```
$ npx eslint . && npx tsc --noEmit   -> clean
$ npm run build                      -> ✓ Compiled successfully
```

## 4. End-to-end (Playwright, production build, real Chrome, stub AI)
```
$ npm run build && npm run test:e2e
  14 passed (33.1s)
```
Bugs found and fixed by this suite before it passed:
1. Guests on a server without Stripe keys saw "Payments are not configured" but no way to sign in — the cart now always offers sign-in to guests.
2. Demo-account buttons on the sign-in page dropped the `next` redirect (fixed in all three apps' auth form; logged in DECISIONS.md).
3. axe `color-contrast`: clay accent text was 3.3:1 on the hero background → token darkened (now passes 4.5:1).
4. axe `link-name`: cart thumbnail link had no name → hidden from AT and tab order (the product name link next to it remains).
5. 8 px horizontal overflow in the cart at 360 px → controls wrap and the mobile thumbnail is smaller.

## 5. Manual walkthrough (dev server, real local models)
```
RESULTS: Trailhead Insulated Bottle 750 ml | Waterproof Field Notebook | Enamel Camp Mug | Glass Pantry Jar Set | Folding Camp Chair | mode: Semantic search: matched by meaning and keywords.
JSONLD: Product 38.00 https://schema.org/InStock
SIMILAR: Enamel Camp Mug | Folding Camp Chair | Two-Person Backpacking Tent | Packable Down Blanket
cart label: Cart, 1 item
cart lines: Ridgeline Camping Lantern                       (after signing in: guest cart merged)
qty now: 2                                                   (optimistic update persisted)
admin status for customer: 404
sitemap urls: 43 | robots: User-Agent: * Allow: / Disallow: /admin Disallow: /account ...
overflow / 0 · /products 0 · /products/ridgeline-camping-lantern 0 · /cart 0   (360 px)
```
The first AI draft attempt in this walkthrough returned HTTP 502 after 53 s: the 1.5B model's drafts were shorter
than the original schema minimum (120 characters, 3 highlights) on all 3 attempts. Minimums were lowered to what the
model reliably produces (60 characters, 2 highlights) — see the eval below for the trade-offs measured.

## 6. Search eval (real embeddings) — `npm run eval`
```
something to keep coffee hot on a hike           keyword: … semantic: 1  hybrid: 1
seat to bring to the campfire                    keyword: -  semantic: 1  hybrid: 2
something to write with ink that looks classy    keyword: 5  semantic: 3  hybrid: 3
SUMMARY { "cases": 18,
  "keyword":  { "hitAt3Pct": 88.9, "mrr": 0.844 },
  "semantic": { "hitAt3Pct": 100,  "mrr": 0.935 },
  "hybrid":   { "hitAt3Pct": 100,  "mrr": 0.907 } }
```

## 7. Description eval (real model) — `npm run eval:descriptions`
| Run | Schema rules | valid | 1st-attempt valid | banned content (valid drafts) | avg words | injection: injected content shown |
|---|---|---|---|---|---|---|
| [baseline](metrics/eval-descriptions-baseline.json) | length only | 100% | — | 8 of 15 | 21.7 | 1 of 3 |
| [strict](metrics/eval-descriptions-strict.json) | + banned content + ≥30 words | 33.3% | 5.6% | 0 | 36.8 | 0 (2 invalid) |
| [final](metrics/eval-descriptions.json) ([log](metrics/eval-descriptions.log)) | + banned content; short = warning | **83.3%** | **72.2%** | **0 of 14** | 22.1 | **0** (2 invalid, 1 clean) |

Final summary:
```
"validPct": 83.3, "firstAttemptValidPct": 72.2, "avgWords": 22.1, "minWords": 8, "maxWords": 44,
"draftsWithBannedContent": 0, "draftsUnder30Words": 11, "invalidAfterRepairs": 3,
"avgFactCoveragePct": 81.1, "avgUnsupportedWordPct": 39.5, "injectionCases": 3, "injectionResisted": 1, "avgLatencyMs": 21691
```
(`injectionResisted` counts only valid, clean drafts; the other 2 injection cases produced no draft at all, so no
injected text reached the editor.) Sampling temperature is 0.4 for drafts, so runs vary.

## 8. Lighthouse (production build, `next start`, mobile, Lighthouse 13.5.0)
```
home    http://localhost:3203/                                {"performance":91,"accessibility":100,"best-practices":100,"seo":100} mobile LCP 3.5 s
product http://localhost:3203/products/ridgeline-camping-lantern {"performance":89,"accessibility":100,"best-practices":100,"seo":100} mobile LCP 3.7 s
```

## 9. Screenshots
`npm run screenshots` against `next start` on the seeded dev database with local models:
```
  1 passed (25.6s)
```

## 10. Dependency audit
```
$ npm audit --omit=dev
found 0 vulnerabilities
```

## CI on GitHub (after publishing, commit 86bbfa9)
All jobs passed on GitHub Actions (ubuntu-latest): lint, typecheck, unit tests with coverage, production build and the
Playwright E2E suite; Docker image build; real PostgreSQL (`pgvector/pgvector:pg17` service) — migrations, seed, production build and a health check;
production dependency audit. Run: https://github.com/zaidiali9/fullstack-ai-portfolio/actions/runs/37341160273
(The first runs failed on a Windows-only lockfile and once on a Google Fonts download; both fixed — see DECISIONS.md.)

## 11. Not verified on this machine
- Live Stripe Checkout / Customer flow against Stripe's API (no account/keys); `docker compose up` as a whole stack (image build and real-Postgres jobs pass in CI); GitHub OAuth; hosted AI providers.
