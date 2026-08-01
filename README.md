# Bartr

Shopify for campus barter and resale marketplaces.

Students already trade constantly — textbooks, fridges, bikes, formal tickets —
over group chats and flyers. Bartr gives that market a storefront: listings that
can be **sold, swapped, or given away**, scoped to a campus and a meetup spot.

## Tech stack

- [Next.js 15](https://nextjs.org) (App Router, React Server Components)
- [React 19](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com/)
- [TypeScript](https://www.typescriptlang.org/) in strict mode
- [Zod](https://zod.dev) for validation, [React Hook Form](https://react-hook-form.com) for forms
- [Vitest](https://vitest.dev) for unit tests

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No environment variables are required — everything in `.env.example` has a
working default. Copy it to `.env.local` if you want to override anything.

### Scripts

| Command             | What it does                            |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Dev server with Turbopack               |
| `npm run build`     | Production build                        |
| `npm run start`     | Serve the production build              |
| `npm run lint`      | ESLint                                  |
| `npm run typecheck` | `tsc --noEmit`                          |
| `npm run test`      | Vitest (unit tests)                     |
| `npm run check`     | Lint + typecheck + tests, in that order |
| `npm run format`    | Prettier write                          |

## What's in the app

| Route            | What it does                                                       |
| ---------------- | ------------------------------------------------------------------ |
| `/`              | Landing page — category grid, newest and most-viewed listings      |
| `/browse`        | Full marketplace: search, facet filters, sorting, pagination       |
| `/listings/[id]` | Listing detail — seller card, offers, related items, make-an-offer |
| `/sell`          | Create a listing (sale, barter or free) with validated form        |
| `/saved`         | Items saved in this browser                                        |
| `/dashboard`     | Your listings, offers received, and seller stats                   |

### API

| Endpoint                   | Method | Notes                                                                 |
| -------------------------- | ------ | --------------------------------------------------------------------- |
| `/api/listings`            | GET    | Same filter pipeline as `/browse`; `?ids=` hydrates specific listings |
| `/api/listings`            | POST   | Publish a listing — 201, or 422 with `fieldErrors`                    |
| `/api/listings/:id`        | GET    | One listing with its seller, or 404                                   |
| `/api/listings/:id/offers` | GET    | Offers on a listing                                                   |
| `/api/listings/:id/offers` | POST   | Make a cash or trade offer                                            |

## Architecture

```
src/
  app/                    Routes, layouts, API handlers
  components/             App components
    ui/                   shadcn/ui primitives
  config/env.ts           Validated, defaulted environment config
  lib/
    types.ts              Domain model (Listing, User, Offer)
    constants.ts          Display metadata for the domain enums
    listings/query.ts     Search / filter / sort / paginate — pure, tested
    data/store.ts         Data access layer (in-memory)
    data/seed.ts          Demo content
    validation.ts         Zod schemas shared by forms and API routes
    format.ts             Money, dates, monograms — pure, tested
  utils/logger.ts         Structured server-side logging
```

Three conventions worth knowing:

**Money is always integer cents.** `priceCents` never holds a float, so range
filters and totals can't drift. Dollars only exist at the edges — URL params and
form fields — and `dollarsToCents` / `formatCents` convert at the boundary.

**Browse state lives in the URL.** `parseListingQuery` turns raw search params
into a validated `ListingQuery`, and `buildSearchParams` turns it back. Unknown
values are dropped rather than rejected, so a hand-edited URL degrades to a sane
page instead of a 500. The result: every filtered view is shareable and
server-rendered.

**The data layer is swappable.** `src/lib/data/store.ts` is an in-memory store
behind an async, plain-object API. Replacing it with Prisma, Drizzle or a
service client is a change to that one file — no call site moves. State is kept
on `globalThis` so it survives dev-server hot reloads; it resets when the process
does.

## Testing

```bash
npm run test
```

78 unit tests cover the parts where bugs are silent rather than loud: query
parsing and round-tripping, filter/sort semantics (including how priceless
barter listings sort), pagination clamping, money and date formatting, and every
validation schema.

## Notes on this build

- Listings are seeded sample data held in memory. Creating a listing or sending
  an offer works for real, but resets when the server restarts.
- There is no auth. A single demo user is treated as signed in — see
  `CURRENT_USER_ID` in `src/lib/data/seed.ts`.
- Listings have no uploaded photos; each one renders a deterministic gradient
  and its category emoji.
