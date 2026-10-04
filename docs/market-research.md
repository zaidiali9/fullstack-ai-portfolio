# Market research: what clients buy (October 2026)

Method: web searches on 2026-10-04/05 for Upwork job posts, Upwork Project Catalog listings, Fiverr gig
listings, and the platforms' own published trend reports. I only cite what the search results showed.
I could not read full Upwork press pages directly (HTTP 403 to automated fetch), so figures are quoted
from the search-result summaries of those pages and should be re-checked by a human before reuse.

## Sources
Platform trend reports
- Upwork, "In-Demand Skills 2026" press release — https://www.upwork.com/press/releases/upworks-in-demand-skills-2026-demand-for-top-ai-skills-more-than-doubles-as-ai-is-embedded-into-everyday-work
  (also https://investors.upwork.com/news-releases/news-release-details/upworks-demand-skills-2026-demand-top-ai-skills-more-doubles-ai)
- Staffing Industry Analysts summary — https://www.staffingindustry.com/news/global-daily-news/fastest-growing-work-categories-include-coding-and-web-development
- Fiverr Business Trends Index (December 2025) — https://www.fiverr.com/cp/business-trends-index-december-2025
- Fiverr Spring 2025 Business Trends Index — https://block.fiverr.com/news/spring-bti-2025

Upwork job posts (client demand)
- RAG chatbot + API integration (Next.js) — https://www.upwork.com/freelance-jobs/apply/Full-Stack-Next-Developer-Needed-for-RAG-Chatbot-API-Integration_~022085013534029631679/
- AI-powered SaaS web app (Next.js + Supabase) — https://www.upwork.com/freelance-jobs/apply/Full-Stack-Developer-Needed-for-Powered-SaaS-Web-Application-Next-Supabase_~022070449195226075087/
- AI SaaS MVP with Next.js, OpenAI, PostgreSQL — https://www.upwork.com/freelance-jobs/apply/SaaS-MVP-with-Next-OpenAI-PostgreSQL-AWS_~022084384399919454206/
- RAG-based internal AI chatbot (upload PDF/DOCX/TXT) — https://www.upwork.com/jobs/~022069081382113510722
- Internal knowledge base with RAG, citation-only answers — https://www.upwork.com/jobs/~022062910107343106144
- Text-to-SQL analytics chatbot over a 30+ table DB — https://www.upwork.com/freelance-jobs/apply/Agentic-Engineer-Text-SQL-Analytics-Chatbot-LangChain-LangGraph-OpenAI_~022072337995287551151/
- AI SQL query generator with charts and explanations for non-technical users — https://www.upwork.com/freelance-jobs/apply/Powered-Smart-SQL-Query-Generator_~022066051770194625823/
- Custom booking management system (availability calendar, Stripe, admin) — https://www.upwork.com/jobs/~022066519564928120019
- Booking app similar to Booksy — https://www.upwork.com/freelance-jobs/apply/Booking-App-System-Development_~022051439103015697093/
- Room booking system — https://www.upwork.com/jobs/~022065690462186065601
- Support ticket triage and first response (AI software company) — https://www.upwork.com/freelance-jobs/apply/Customer-Support-Specialist-Ticket-Triage-First-Response-Tax-Software_~022088480375912257166/

Upwork Project Catalog / Fiverr gigs (what sellers package, i.e. what sells)
- AI SaaS MVP, Next.js + Stripe + OpenAI — https://www.upwork.com/services/product/development-it-ai-saas-mvp-from-idea-to-live-product-in-3-weeks-next-js-stripe-openai-2049554475218247529
- Full-stack SaaS MVP + Stripe + Auth — https://www.upwork.com/services/product/development-it-full-stack-saas-mvp-next-js-node-js-stripe-auth-2048849092176091190
- RAG chatbot with citations — https://www.upwork.com/services/product/development-it-a-custom-rag-chatbot-that-answers-from-your-documents-with-citations-2061498207593011728
- AI Zendesk support / triage — https://www.upwork.com/services/product/admin-customer-support-you-get-ai-zendesk-support-openai-faster-replies-fewer-tickets-2047313509533691436
- Zendesk AI chatbot setup (Fiverr) — https://fiverr.com/pasona10/setup-zendesk-ai-chatbot-and-automate-customer-support
- E-commerce with AI assistant — https://www.upwork.com/services/product/development-it-a-modern-e-commerce-platform-with-ai-assistant-2067176511461098640
- Next.js + Stripe e-commerce — https://www.upwork.com/services/product/development-it-a-modern-e-commerce-website-with-next-js-stripe-integration-1979925978303258536
- Text-to-SQL chatbot with insights — https://www.upwork.com/services/product/development-it-ai-text-to-sqlchatbot-application-with-insights-2070824273910701853
- Custom admin dashboard / internal tool / CRM (Fiverr) — https://fiverr.com/andikads__/build-a-custom-web-app-admin-dashboard-or-internal-tool , https://fiverr.com/sapp532/build-a-custom-crm-admin-dashboard-and-web-app-in-react-and-node
- Booking system or admin dashboard (Fiverr) — https://fiverr.com/ronatalsiregar/build-a-custom-booking-system-or-admin-dashboard
- Booking/appointment scheduling (Upwork catalog) — https://www.upwork.com/services/product/development-it-a-custom-booking-or-appointment-scheduling-system-2040769820042353686
- Collaborative Kanban board with real-time sync — https://www.upwork.com/services/product/development-it-collaborative-kanban-board-with-real-time-sync-drag-and-drop-google-oauth-2049770955395105898

## Headline signals
- Upwork's 2026 in-demand list (per the press release summary) names **full-stack development** among the
  most consistently in-demand skills, and within Coding & Web Development the fastest-growing AI skills
  are **AI integration (+178%)** and **AI chatbot development (+71%)**.
- Fiverr's trend reports (per search summaries) show surging searches for **AI agent development** and
  continued strong demand for **e-commerce website development**.
- Upwork job posts consistently specify the same stack: **Next.js + TypeScript + PostgreSQL/Supabase +
  Stripe + auth + an LLM API**. Several explicitly require multi-tenancy, document upload, and subscriptions.

## Top 8 recurring gig types
1. **AI SaaS MVP** — auth, Stripe subscriptions, dashboard, one AI feature; "live in 2–3 weeks" packaging.
2. **RAG / "chat with your documents"** — upload PDFs/DOCX, answers grounded in docs **with citations**,
   refuse when the answer is not in the docs, internal or embeddable.
3. **AI chatbot embedded in a website or support tool** — support deflection, Zendesk-style triage and drafted replies.
4. **E-commerce store** — custom Next.js storefront with Stripe checkout, admin, SEO; AI assistant/search as an upsell.
5. **Admin dashboard / internal tool / CRM** — RBAC, CRUD, reports, CSV export, charts.
6. **Booking & appointment systems** — real-time availability, Stripe deposits, reminders, admin calendar
   (salons, clinics, coaches, rooms).
7. **Text-to-SQL / natural-language analytics** — non-technical users query a DB in plain English, get charts and explanations.
8. **Payment + auth integration into an existing app** — Stripe Checkout/Billing, webhooks, OAuth.

(Also seen but weaker as custom-build demand: real-time Kanban/project management — it appears as a
seller-packaged catalog item, but I found no recent client job posts for custom builds; clients mostly
buy Trello/Jira-style SaaS instead.)

## Typical client pain points (from post wording)
- "Need it live fast" — want a working MVP in weeks, not a prototype.
- Previous AI prototype hallucinated — want **grounded answers with sources** and "don't guess" behavior.
- Support team drowning in tickets — want triage/routing and drafted replies a human approves.
- Non-technical staff depend on a developer for every data question — want self-serve answers with charts.
- Double bookings and manual scheduling over phone/DM — want self-serve booking with payments.
- Security/trust: multi-tenant data isolation, role-based access, payments done correctly.
- Cost control on AI APIs: limits per user/plan, usage visibility.

## The 5 apps and why
| # | App | Gig types covered | Why |
|---|---|---|---|
| A | AI Helpdesk (multi-tenant SaaS) | 1, 3, 5, 8 | SaaS MVP shape (orgs, RBAC, Stripe subscriptions) + the support-triage AI use case clients request. |
| B | Knowledge Base Chat (RAG) | 2, 3 | Most frequent AI job type found; citations + refusals answer the "hallucination" pain point. |
| C | E-commerce Storefront | 4, 8 | Perennial top category; AI search/descriptions/recommendations is a current upsell. |
| D | **Real-time Booking & Scheduling** (swapped in) | 5, 6, 8 | Multiple recent client job posts and many seller listings; shows real-time + concurrency handling. |
| E | Natural-Language Analytics Dashboard | 5, 7 | Direct client posts for text-to-SQL with charts; shows safety engineering (SQL guard). |

### Swap: D "Real-time Project Manager" -> "Real-time Booking & Scheduling"
Research found several recent client job posts for custom booking systems (links above) and none for
custom Kanban builds, so booking is the higher-demand choice. The swap keeps every capability the original
D was meant to prove: live updates (SSE availability feed), optimistic UI, conflict handling (double-booking
prevented at the database level and surfaced in the UI), activity feed and notifications, plus AI features
(natural-language booking request -> validated slot search, AI weekly schedule digest, AI-suggested alternative times).
Logged in DECISIONS.md.
