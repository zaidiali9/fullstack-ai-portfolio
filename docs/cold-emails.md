# Cold emails (≤120 words each)

Before sending: look at the recipient's site yourself and make the first line true and specific; include your real
name, a way to opt out, and your postal address where the law requires it (CAN-SPAM, GDPR/PECR). Send in small
batches. Numbers come from the portfolio apps' `docs/verification.md`. Demo links point to the Railway deployment (`deploy/README.md`).

## 1. SaaS / software company: "chat with your docs" for support (RAG)
**Subject:** Answers from your docs, with the source attached

Hi [NAME],

I noticed [PRODUCT] has [HELP CENTER / DOCS] with [N] articles, and your contact page routes most questions to email.

I build assistants that answer only from a company's own documents and link every answer to the exact passage. If
the answer isn't in the docs, they say so instead of guessing. On my demo's test set, 17 of 17 answers contained the
key fact, and all 5 out-of-scope questions were refused.

It can sit in your app or as a small widget on your site, using free or paid AI providers.

Two-minute demo: https://kb-chat-production-15ef.up.railway.app
Worth a 15-minute call next week?

[YOUR NAME]
[One line: "Reply 'no thanks' and I won't email again."]

## 2. Appointment business: online booking (clinic, studio, salon, consultancy)
**Subject:** Bookings without the back-and-forth

Hi [NAME],

I saw that [BUSINESS] takes appointments by [PHONE / EMAIL / FORM]. That usually means a lot of back-and-forth, and
the odd double booking.

I build booking systems where customers see live availability and book in a few clicks, and the database itself
won't accept two bookings for the same person and time. In my demo, when four people tried to book the same slot at
once, exactly one got it and the others were offered the nearest free times.

Customers can reschedule or cancel themselves, and your team gets a live calendar.

Demo: https://booking-production-d564.up.railway.app
Open to a quick look?

[YOUR NAME]
[Opt-out line]

## 3. Data-rich small company: self-serve analytics
**Subject:** Letting your team ask the data directly

Hi [NAME],

[COMPANY]'s [ROLE/TEAM] probably asks your developers for numbers ("sales by region last month?") more often than
anyone would like.

I build dashboards where people ask in plain English and get a chart, with the database query always shown and
editable. Safety comes first: access is read-only and limited to approved tables, and every query is logged. In my
demo, 4 of 4 attempts to delete data or read passwords executed nothing.

I'll be upfront: with a small free AI model, half of my test questions came back fully right. That's why the query is
always visible, and a stronger hosted model can be measured on your own questions first.

Demo: https://nl-analytics-production.up.railway.app

[YOUR NAME]
[Opt-out line]
