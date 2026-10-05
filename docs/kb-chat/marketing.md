# Marketing copy — Cairn (chat with your documents)

Numbers come from `apps/kb-chat/docs/verification.md`. Live demo (seed data; AI off until a provider key is set): https://kb-chat-production-15ef.up.railway.app

## Upwork portfolio blurb (≤150 words)
**RAG knowledge-base chat with page-level citations + embeddable widget**

A full-stack "chat with your documents" product: upload PDFs, Word files, Markdown or web pages; a background job
queue extracts, chunks and embeds them into Postgres + pgvector; answers stream with numbered citations that open
the exact passage and page. If nothing relevant is found it says so without calling the model. On a 22-question eval
with a free open-source model: right document retrieved 17/17, correct fact 17/17, 0 citations to a wrong document,
5/5 out-of-scope questions refused. Includes workspaces with roles, SSRF-safe URL ingestion that respects
robots.txt, magic-byte upload validation, usage limits, and a one-line website widget restricted to allowlisted
domains. 54 integration tests (87.8% coverage), 15 Playwright tests, 0 axe violations. Demo: https://kb-chat-production-15ef.up.railway.app

## Fiverr gig description
**I will build a document Q&A chatbot that answers from your files with citations**

Turn your PDFs, policies and help articles into an assistant your team or customers can trust.

What you get:
- Upload PDFs, Word files, Markdown or web pages; indexing runs in the background with live progress
- Answers built only from your documents, each claim linked to the exact paragraph and page
- An honest "I couldn't find this" when your documents don't cover a question — no made-up answers
- Separate workspaces with owner / editor / viewer roles
- An embeddable chat widget for your website, limited to the domains you choose
- Usage limits and a dashboard so AI costs stay predictable; runs on free open-source models or the provider you prefer

Packages (scope, not price):
- **Basic** — document upload + Q&A with citations for one workspace, deployed to your hosting.
- **Standard** — Basic + multiple workspaces with roles, conversation history, website widget, usage limits.
- **Premium** — Standard + connectors to your sources (Drive, Notion, a help center), an accuracy test set built
  from your real questions, custom branding and a hand-off to human support.

See the working demo first: https://kb-chat-production-15ef.up.railway.app

## Cold-email snippet (5 lines)
Hi [NAME] — I saw [COMPANY]'s team answers a lot of questions about [THEIR DOCS, e.g. policies / product manuals].
I build assistants that answer only from your own documents and link every answer to the page it came from.
In my demo it found the right document for all 17 answerable test questions and declined all 5 it couldn't answer.
It can live inside your team's tools or as a small chat widget on your website.
2-minute demo: https://kb-chat-production-15ef.up.railway.app — open to a quick call this week?
