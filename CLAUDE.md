# CLAUDE.md — property-intel

## What this is

A TS CLI: paste a Redfin/Zillow URL or address → pull authoritative property data
(PIN, township, lot, taxes, owner) joined with listing data (price, beds/baths, sqft)
→ export JSON/CSV/PDF. For Brady's realtor contacts (brokerage lookups, not mass
scraping). Productizes the Steve Kantorov "listing intel pipeline" idea.

## The non-negotiable mental model

**Two sources, joined on the parcel.** County assessor = authoritative (PIN, township,
lot, taxes, owner; free APIs). Redfin/Zillow = supplemental marketing data behind
anti-bot walls. A blocked/missing listing must NEVER fail the pull. See `MASTER_PROMPT.md`.

## Lineage (reused patterns)

- Anti-bot + HTTP backoff/cache from `~/Desktop/distressed-scraper` (enrich_addresses.py,
  PIN regex, Lambda IP-relay).
- TS scaffold shape (schema-driven adapters, CSV/JSON/PDF-via-Chromium, tests) from
  `~/Desktop/il-association-leads`.
- Output schema echoes the Denis Horgan site `Listing` type.

## Files

```
src/geocode.ts        Census geocoder → county FIPS + township
src/address.ts        pure address parser (tested)
src/county/dupage.ts  ArcGIS REST adapter (verified live)
src/county/cook.ts    CCAO Socrata adapter (taxes via Treasurer = TODO)
src/county/index.ts   FIPS → adapter router
src/listing/browser.ts  shared Playwright session (in-page fetch past anti-bot)
src/listing/redfin.ts   stingray JSON API client
src/listing/zillow.ts   __NEXT_DATA__ / Apollo extractor
src/merge.ts          geo+parcel+listing → PropertyRecord (provenance + warnings)
src/report.ts         print HTML; src/pdf.ts renders it via Chromium
src/pull.ts           the pipeline; src/cli.ts the `pull` command
test/address.test.ts  pure-parser tests
```

## Conventions

- TS strict, ESM, functional, early returns, files < 300 lines.
- `npm test` + `npm run typecheck` green before commit.
- `output/*` is gitignored — never commit harvested property data.
- Keep listing pulls low-volume/human-paced; never scrape logged-in; county data is public.

## Verified

DuPage ArcGIS + Census + Redfin (headless Playwright) all confirmed live on
620 Rodenburg Rd, Roselle (PIN 0208205015, $9,550.56 tax, sold $275k 3/2.5).
