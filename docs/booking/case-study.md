# Case study: Bookwell — online booking that can't double-book

*Portfolio project. "Lumen Wellness Studio", its team, customers and bookings are fictional seed data.*

## The problem
Appointment businesses (studios, clinics, salons, consultants) run into the same problems with online booking:
- **Double bookings.** Two people pick the same time a second apart, and both get a confirmation. Somebody gets
  a phone call and an apology.
- **Stale pages.** A customer looks at a time for a minute, then finds it's gone only after filling in their details.
- **Phone tag.** People think in sentences ("a massage with Sam sometime next week after work"), not in date pickers.
- **No overview for the owner.** Who's busy, which days are quiet, how many no-shows did we have?

## What I built
A booking system with a customer side and a team side:
1. **Live availability**: when someone books, that time disappears from everyone else's screen within seconds.
2. **Hold, then confirm**: picking a time reserves it for 5 minutes while the customer adds a note, so nobody can
   take it in the meantime.
3. **A booking assistant**: customers describe what they want in their own words and get real open times to choose from.
4. **A live team calendar** with one column per staff member, plus reschedule, cancel, no-show tracking, an
   activity feed and notifications.
5. **A weekly digest for the owner**: numbers for last week and next week, with a short AI-written summary.

## How it works (plain language)
- **The database itself refuses overlapping bookings** for the same person, including the clean-up time after each
  appointment. Even if two requests arrive at exactly the same moment, only one can succeed. The other customer
  immediately sees "that time was just taken" and the three nearest free times as one-click buttons.
- Every change to a booking checks that nobody else changed it first, so a tab left open overnight can't overwrite
  a newer change.
- Opening hours, buffers and minimum notice are worked out in the studio's own time zone, including the days the
  clocks change.
- **The assistant only fills in a search form.** The AI picks the service, the person and the time of day; exact
  dates and clock times ("next Tuesday", "after 4pm") are worked out by ordinary code, because a wrong date is worse
  than no answer. Anything the AI says that doesn't match a real service or staff member is ignored. It never sees
  the calendar and can't book. The customer still picks the time.
- **The digest's numbers come from the database.** The AI only writes the summary, and every number it writes is
  checked against the real figures. If it gets one wrong, the owner sees a "check these numbers" warning.

## Results (measured on demo data)
Commands and raw output: `apps/booking/docs/verification.md`.
- In a test where **4 customers try to book the same slot at the same time, exactly 1 succeeds** and the other 3 get
  alternatives. A separate test inserts overlapping bookings directly into the database to prove it rejects them.
- Browser tests open two windows: a booking in one removes the time from the other with no reload, and a window that
  missed the update gets a clear "just taken" message with working alternatives.
- On 19 everyday booking requests, the assistant got **service, person, date and time all right in 17 (89.5%)**. The
  first version of the prompt, with no code-side date and time handling, got the AI's parts right in only 7 (36.8%).
  This uses a free AI model running on an ordinary laptop CPU, at about 15 seconds per request.
- In 3 prompt-injection attempts ("ignore previous instructions…"), **no made-up service, staff member or action got
  through**. One attempt made the AI output a fake service name, and the app discarded it.
- **91 automated tests** of the business logic (90% of server code) and **18 browser tests** pass, including an
  accessibility scan with **0 issues** on five pages in light and dark mode.
- Google Lighthouse (mobile): **90 performance / 100 accessibility / 100 best practices / 100 SEO** on both the home
  page and a booking page.

No real customers or bookings were involved. The double-booking and live-update tests also pass on a full PostgreSQL
server in the CI pipeline, not just the embedded database used for development.

## Tech used
Next.js and React, PostgreSQL (exclusion constraints, LISTEN/NOTIFY), Server-Sent Events, Drizzle, Better Auth,
date-fns time zones, an open-source AI model (Qwen2.5) with optional hosted providers, Vitest and Playwright for
testing, GitHub Actions and Docker for delivery.

## What a custom version could include
- Your services, team, hours and locations, with an admin screen to manage them; rooms and equipment as bookable resources.
- Deposits or card-on-file through Stripe, no-show fees, packages and memberships.
- Email/SMS confirmations and reminders, waitlists that fill cancelled slots, and Google/Outlook calendar sync.
- A booking widget for your existing website, and the assistant on WhatsApp or SMS.
