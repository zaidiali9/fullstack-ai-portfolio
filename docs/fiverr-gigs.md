# Fiverr gigs (3)

Chosen from the top demand categories in `docs/market-research.md`. Packages are defined by **scope**; set prices
and delivery times yourself (`[PRICE]`, `[DAYS]`). Don't add reviews, client logos or sales counts you don't have.
Gig images: use the README screenshots (original, from the apps); replace `[DEMO LINK]` after deploying.

---

## Gig 1 — AI chatbot that answers from your documents
**Title:** I will build an AI chatbot that answers from your documents with sources
**Category:** Programming & Tech → AI Development → AI Chatbots (or the closest current category)
**Tags:** ai chatbot, rag, chatgpt, document chatbot, nextjs

**Description**
Your customers and team ask the same questions your documents already answer. I'll build an assistant that answers
**only** from your files and links every answer to the exact passage, so people can check it.

- Upload PDFs, Word, Markdown or web pages; it indexes them automatically
- Answers cite the page and passage; if the answer isn't in your documents, it says so instead of guessing
- Embeddable widget for your website, limited to the domains you choose
- Works with OpenAI, Gemini, Groq, Ollama or free local models; usage limits keep AI costs predictable
- Tested on a question set before handover, so you know how well it performs

From my demo's test set: 17 of 17 answers contained the key fact, 0 cited the wrong document, and 5 of 5 out-of-scope
questions were refused. Demo: [DEMO LINK]

**Packages**
| | Basic | Standard | Premium |
|---|---|---|---|
| Scope | Chat over up to [N] documents you provide, citations, simple web page | Basic + document upload UI, accounts, website widget, usage limits | Standard + multiple workspaces/teams, URL ingestion, evaluation report on your own questions, deployment |
| Price / delivery | [PRICE] / [DAYS] | [PRICE] / [DAYS] | [PRICE] / [DAYS] |

**Requirements from buyer:** sample documents (no personal data unless you have the right to share it); 10–20 real
questions people ask; preferred AI provider (or "free/local"); where it should live (your site, internal tool).

**FAQ**
- *Will it make things up?* It's built to answer only from your documents and to refuse otherwise; I test this on your
  questions and share the results, including any failures.
- *Can I use a free model?* Yes. Free local models are slower and less fluent; I'll show you the difference on your data.

---

## Gig 2 — SaaS MVP with auth, payments and one AI feature
**Title:** I will build your SaaS MVP in Next.js with auth, Stripe and an AI feature
**Category:** Programming & Tech → Website Development → Web Applications (or SaaS)
**Tags:** saas, nextjs, stripe, mvp, ai integration

**Description**
Get from idea to a working product: sign-up, roles, subscriptions and the AI feature your product is built around,
on a codebase another developer can take over.

- Email/password and GitHub sign-in, organizations and roles (admin, member, customer)
- Stripe subscriptions in test mode first, signed webhooks, a billing page
- Dashboard with your core workflow, CSV export, audit log
- One AI feature done properly: structured output, validation, rate limits, cost tracking, and a measured test set
- Tests (unit and real-browser), Docker, CI and a README with setup steps

Example: my AI helpdesk demo triages tickets with 91.7% category accuracy on a labelled test set and drafts replies an
agent approves. Demo: [DEMO LINK]

**Packages**
| | Basic | Standard | Premium |
|---|---|---|---|
| Scope | Auth + roles + dashboard for one core workflow | Basic + Stripe subscriptions + one AI feature with tests | Standard + multi-tenancy, admin/audit log, evaluation report, CI/CD and deployment |
| Price / delivery | [PRICE] / [DAYS] | [PRICE] / [DAYS] | [PRICE] / [DAYS] |

**Requirements from buyer:** a one-page description of the product and its main workflow; examples of the data or
inputs; Stripe account (test mode) if payments are included; preferred AI provider.

**FAQ**
- *Do you use a template?* No; the structure is reused from my own tested projects, and the code is yours.
- *What does "measured" mean?* I write test cases for the AI feature with you, run them, and hand over the results.

---

## Gig 3 — Online store or booking system with Stripe
**Title:** I will build a fast Next.js store or booking system with Stripe payments
**Category:** Programming & Tech → Website Development → E-Commerce / Web Applications
**Tags:** nextjs ecommerce, stripe checkout, booking system, appointment booking, web app

**Description**
A custom store or booking site that's fast, accessible and correct where it matters: payments and availability.

Store:
- Catalog, cart, Stripe Checkout with signed webhooks, order history, admin for products and orders
- SEO built in (page titles, sitemap, structured product data); optional search that understands what shoppers mean
  (my demo: right product in the top 3 for 18 of 18 test searches, vs 16 of 18 with keyword search)

Booking:
- Live availability, holds while the customer confirms, and a database rule that makes double bookings impossible
  (in my demo, 4 simultaneous attempts on one slot: exactly 1 succeeded, the others were offered alternatives)
- Customer self-service reschedule/cancel, live staff calendar, time zones handled

Demos: [DEMO LINK] · [DEMO LINK]

**Packages**
| | Basic | Standard | Premium |
|---|---|---|---|
| Scope | Store: catalog + cart + Stripe Checkout **or** Booking: services, staff, hours, live booking | Basic + admin panel (products/orders or calendar/bookings), accounts, emails | Standard + AI search/assistant, deposits or subscriptions, reminders, deployment |
| Price / delivery | [PRICE] / [DAYS] | [PRICE] / [DAYS] | [PRICE] / [DAYS] |

**Requirements from buyer:** product list or services/staff/opening hours; brand assets; Stripe account; domain/hosting
preference.

**FAQ**
- *Shopify instead?* If a standard Shopify store fits, that's often cheaper; I'll say so. This gig is for custom needs.
- *Payments safe?* Card details stay with Stripe; orders and bookings are confirmed by Stripe's signed webhooks.
