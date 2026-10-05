# Case study: Cairn — answers from your own documents

*Portfolio project. "Brightline Studio" and its handbook are fictional seed data written for the demo.*

## The problem
Every company has answers buried in PDFs, Word files and wiki pages: the expense policy, the leave rules, the
product manual. People ask the same questions in chat again and again, and the person who knows the answer is busy.
Generic AI chatbots don't help much here — they answer confidently from the internet, and you can't tell whether an
answer came from your policy or was made up.

## What I built
A web app where a team uploads its documents (PDF, Word, Markdown, text or a web page) and then asks questions in
plain language. Every answer:
- is built only from the uploaded documents,
- shows numbered sources — click one to see the exact paragraph and page it came from,
- says "I couldn't find this in the documents" when the documents don't cover the question, instead of guessing.

The same assistant can be added to a company website with one line of code, so customers can ask about
public documents like a returns policy.

## How it works (plain language)
1. **Upload.** The app checks that a file really is what it claims to be (a renamed program can't sneak in as a PDF),
   then saves it and confirms right away.
2. **Read and index in the background.** It pulls out the text page by page, splits it into short passages, and
   stores them with a "meaning fingerprint" so related wording can be found, not just exact words. A progress
   indicator shows when each document is ready. The original file is deleted afterwards.
3. **Ask.** The app finds the most relevant passages using both meaning and keywords. If none are relevant, it
   says so — without even asking the AI. Otherwise it gives only those passages to the AI with strict instructions
   to answer from them and cite them.
4. **Check.** Each claim links to its passage. If the AI forgets to cite, the app matches each sentence to the
   passage it came from and labels those links as matched automatically.

Each team's documents are kept separate, people have roles (owner, editor, viewer), and usage limits keep AI costs
predictable. It runs on a free open-source model by default and can switch to a hosted provider.

## Results (measured on the demo data, not production statistics)
From 22 test questions about the demo handbook, run with the free open-source model on a laptop CPU
(commands and raw output in `apps/kb-chat/docs/verification.md`):
- The right document was found for **17 of 17** answerable questions, and every answer contained the correct fact.
- **15 of 17** answers linked to the correct document; **no** answer linked to a wrong one.
- All **5** questions the documents can't answer — including one whose answer was planted in a *different*
  team's workspace — were declined. No answerable question was wrongly declined.
- Answers take about **13.5 seconds** on a laptop CPU; a hosted model would be much faster.
- **54 automated tests** of the logic (**87.8%** of server code) and **15 browser tests** pass; the browser tests
  include an accessibility scan with **0 issues** on five pages in light and dark mode.
- Google Lighthouse (mobile): **95 performance / 100 accessibility** on the home page, **92 / 100** on the chat page.
- While testing, I found and fixed a security gap where a web address written as a raw IP number could have
  reached internal servers; regression tests now cover it.

There were no real users or customers; 22 questions is a small sample.

## Tech used
Next.js and React, PostgreSQL with vector search (pgvector), Drizzle, Better Auth, open-source AI models
(Qwen2.5 for answers, MiniLM for search) with optional hosted providers, Vitest and Playwright for testing,
GitHub Actions and Docker for delivery.

## What a custom version could include
- Automatic sync from where your documents already live (Google Drive, Notion, Confluence, SharePoint, a help center).
- Scanned-document support (OCR) and per-document permissions.
- A test set built from your team's real questions, so accuracy is measured before launch and after every change.
- A branded website widget that hands the conversation to a human when it can't help.
- Single sign-on, audit logs and data-retention settings.
