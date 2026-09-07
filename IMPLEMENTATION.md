# Restaurant experience improvements

## Included in this release

- Compact responsive menu, category selector, whole-menu search and empty state.
- Live cart total and mobile cart access; editable checkout quantities.
- Shared Hobart trading calendar and available times, including 15-minute pickup notice.
- Server-authoritative menu prices and variants; input limits and same-origin submissions.
- Server-generated request references and separate owner/customer receipt outcomes.
- Resend idempotency headers: same unchanged request uses the same email key for retries.
- Success pages require recent submission data; requests are not described as staff-confirmed.
- Original dish images preserved; WebP menu derivatives and larger detail images.
- Search metadata, restaurant structured data, sitemap and non-indexed checkout/success pages.

## Deployment

The existing Cloudflare Pages project is `argyle-pantry-site`, linked to GitHub.
Pushes are checked by Cloudflare Pages; verify a preview before merging to main.
Production email secrets remain in Cloudflare, never in this repository.
The Node server uses the same Worker handler as production. It now needs Node 22.13 or newer.

## Verification

- `npm test` runs service checks without sending mail.
- Start `RESERVATION_DRY_RUN=true PORT=4182 npm start`, then run the browser check.
- Browser checks require Playwright (tested with 1.62.1) and Google Chrome.
- Image optimization requires Sharp (tested with 0.35.4). Run `npm run optimize:images` after source-image changes.
- Browser screenshots and audit reports are ignored by Git and blocked by the static request allowlist.

## Not yet activated

Cloudflare database and owner authentication must be configured before implementing a live
management console, acceptance/rejection, stock controls or pause-order controls.
`migrations/0001_submissions.sql` is an optional journal schema. Only when a migrated D1
database is bound as `DB` will submissions and mail provider IDs be persisted there.
No public endpoint exposes these records. Set an appropriate retention policy before activating it.

Without that binding, requests continue to use email, not durable database storage.
Resend email idempotency has a 24-hour window; it is not an unlimited duplicate-order guarantee.
An owner API acceptance is not proof of inbox delivery or staff acceptance.
Waiting for an actual delivery event requires a verified Resend webhook and persistent delivery state;
this release preserves store-first API acceptance, then customer receipt.

Still to implement after secure owner access: management console, delivery-event processing,
customer receipt retry queue, platform rate limits, unavailable dishes, lead-time controls,
and configurable special hours. Allergen labels, platter contents, real venue photos and
sales-based recommendations require verified restaurant information.
Online card payments have not been added; the checkout explicitly says pay at the restaurant.
