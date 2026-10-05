# Self-hosted fonts

Variable-weight Latin subsets used by the five apps, loaded with `next/font/local` so that builds (CI, Docker,
deploys) never need to download fonts from Google at build time.

| File | Family | Weight range | Used by | Source |
|---|---|---|---|---|
| `geist-latin-wght-normal.woff2` | Geist | 100–900 | helpdesk | @fontsource-variable/geist 5.3.0 |
| `geist-mono-latin-wght-normal.woff2` | Geist Mono | 100–900 | all apps (code/monospace) | @fontsource-variable/geist-mono 5.3.0 |
| `inter-latin-wght-normal.woff2` | Inter | 100–900 | storefront, booking, nl-analytics | @fontsource-variable/inter 5.3.0 |
| `plus-jakarta-sans-latin-wght-normal.woff2` | Plus Jakarta Sans | 200–800 | kb-chat | @fontsource-variable/plus-jakarta-sans 5.3.0 |
| `fraunces-latin-wght-normal.woff2` | Fraunces | 100–900 | storefront (headings) | @fontsource-variable/fraunces 5.3.0 |
| `lora-latin-wght-normal.woff2` | Lora | 400–700 | booking (headings) | @fontsource-variable/lora 5.3.0 |
| `space-grotesk-latin-wght-normal.woff2` | Space Grotesk | 300–700 | nl-analytics (headings) | @fontsource-variable/space-grotesk 5.3.0 |

All are licensed under the **SIL Open Font License 1.1**; each font's licence and copyright notice is kept next to it
(`LICENSE-<font>.txt`), as the OFL requires when redistributing. Only the Latin subset is included; add other
subsets from the same Fontsource packages if an app needs more scripts.
