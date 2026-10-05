# Case study: Fernwood Supply — an online store with search that understands shoppers

*Portfolio project. The store, its products and orders are fictional seed data.*

## The problem
Small online shops lose sales in two quiet ways:
- **Search that only matches exact words.** A shopper types "something to keep coffee hot on a hike"; the product is
  called "Insulated Bottle 750 ml". Keyword search shows nothing, and the shopper leaves.
- **Product pages that take forever to write.** Every new product needs a description, and owners copy-paste or
  leave them thin.

Template stores also make it hard to trust the basics: did payment really go through, is stock correct, do
search engines see the products properly?

## What I built
A complete store: product catalog, cart, secure card checkout through Stripe (test mode), order history and an
admin area for products and orders. On top of that:
1. **Search by meaning** — shoppers describe what they need and get the right products, even without the product's words.
2. **"Similar items"** on every product page, chosen by meaning rather than just category.
3. **AI-drafted descriptions for the owner** — type the product facts, get a first draft, edit, save.

## How it works (plain language)
- Every product gets a "meaning fingerprint". A search is turned into one too and compared, then blended with
  normal keyword matching so exact names still work. If the AI part is unavailable or overloaded, the store falls
  back to keyword search and says so — it never just breaks.
- At checkout the server re-checks every price and stock level (the browser can't change them). The order only
  counts as paid when Stripe sends a signed confirmation; stock is then reduced so it can never go below zero, even
  if two people buy the last item at once.
- Description drafts use only the facts the owner typed. Rules ("no prices", "no 'best ever'") are checked
  automatically; drafts that break them are sent back to the AI to fix, and the owner always edits before saving.
- Search engines get proper page titles, a sitemap and structured product data (price, availability).

## Results (measured on demo data)
Commands and raw output: `apps/storefront/docs/verification.md`.
- On 18 shopper-style searches written to avoid the products' own words, the right product appeared in the
  **top 3 for 18 of 18** with meaning-based search, versus **16 of 18** for keyword search alone.
- In 18 description drafts from the free local AI model, **none** of the accepted drafts contained prices, shipping
  claims or superlatives (8 of 15 did before those rules were enforced). Drafts are short (median 22 words) and are
  meant as a starting point for the owner.
- **22 automated tests** of the business logic (79% of server code) and **14 browser tests** pass — including an
  automatic accessibility scan with **0 issues** on five pages in light and dark mode. The browser tests found and
  fixed five real problems before launch (for example, a guest couldn't reach sign-in from the cart).
- Google Lighthouse (mobile): **91 performance / 100 accessibility / 100 SEO** on the home page, **89 / 100 / 100** on a product page.

No real customers or payments were involved; card payments were tested with signed test events, not a live Stripe account.

## Tech used
Next.js and React, PostgreSQL with vector search (pgvector), Drizzle, Better Auth, Stripe Checkout (test mode),
open-source AI models (MiniLM for search, Qwen2.5 for drafts) with optional hosted providers, sharp for images,
Vitest and Playwright for testing, GitHub Actions and Docker for delivery.

## What a custom version could include
- Your catalog imported from Shopify, WooCommerce or a spreadsheet, with real photos and product variants.
- Taxes, carrier shipping rates, discount codes, abandoned-cart and order emails.
- Search analytics that show what people search for and can't find, with synonyms you control.
- AI copy in your brand voice, bulk drafting for new collections, and translations.
