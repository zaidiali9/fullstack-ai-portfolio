# Portfolio site

A single static page (`index.html`, inline CSS, no build step, no JavaScript) that introduces the five apps in this
repository. Host it anywhere that serves static files (GitHub Pages, Netlify, Vercel, Cloudflare Pages).

## Before publishing
Replace every placeholder (they are shown in monospace on the page so none can be missed):
`[YOUR NAME]`, `[YOUR EMAIL]`, `[UPWORK PROFILE LINK]`, helpdesk and storefront show "Demo: not deployed yet" until they are deployed (the repo and the other three demos are linked).
Keep the metric sentences as they are unless you re-run the evals; each names the command and file it came from.

## Preview locally
```bash
python -m http.server 3300 --directory portfolio-site
```

## Verification (2026-10-05, build machine)
```
Lighthouse 12.8.2, mobile, http://127.0.0.1:3300/
{"performance":100,"accessibility":100,"best-practices":100,"seo":100}  LCP 1.1 s   -> metrics/lighthouse-portfolio.json
axe-core (WCAG 2 A/AA) via Playwright + Chrome
light violations: []   dark violations: []
360 px viewport: document scrollWidth 360 (no horizontal scroll)
```
Every metric quoted on the page was checked against the app's `docs/verification.md` and `docs/metrics/*.json`.

## Assets
| Asset | Source | License |
|---|---|---|
| Screenshots in `img/` | captured from the apps in this repo (fictional seed data), resized to 800×500 WebP with sharp | same as this repo |
| Fonts | system font stack (no web fonts) | — |
| Favicon | inline SVG drawn for this page | same as this repo |
