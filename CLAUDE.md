# CLAUDE.md — property-intel

## What this is

A TS CLI: paste a Redfin/Zillow URL or address → look the property up in **public
county records** and export an organized JSON/CSV/PDF report (PIN, township, legal,
tax, valuation, owner, building characteristics, lot, districts, sale history).
For Brady's realtor contacts (brokerage lookups). Productizes the Steve Kantorov
"listing intel pipeline" idea.

## The non-negotiable mental model

**Public-records lookup, NOT scraping.** Data comes from the US Census geocoder + the
county assessor (DuPage ArcGIS, Cook CCAO open data) — all free, official, no key, no
login, no rate-limit dodging. If the input is a Redfin/Zillow URL we only parse the
address out of the slug; **we never fetch the listing site or drive a browser against
it.** (An earlier version scraped Redfin via Playwright — that was removed on purpose;
don't bring it back.) Playwright/Chromium is used ONLY to render the PDF locally.
A blocked/missing field never fails the pull. See `MASTER_PROMPT.md`.

## Lineage (reused patterns)

- HTTP backoff/cache + PIN handling from `~/Desktop/distressed-scraper`
  (which also uses the same DuPage/Cook public APIs).
- TS scaffold shape (schema-driven adapters, CSV/JSON/PDF-via-Chromium, tests) from
  `~/Desktop/il-association-leads`.

## Files

```
src/geocode.ts        Census geocoder → county FIPS + township
src/address.ts        pure address parser (tested)
src/county/dupage.ts  ArcGIS REST adapter — full record, no building chars
src/county/cook.ts    CCAO Socrata — 5 datasets joined on PIN (incl beds/baths/sqft, sales)
src/county/index.ts   FIPS → adapter router
src/merge.ts          geo + parcel → PropertyRecord (provenance + warnings)
src/report.ts         organized sectioned HTML; src/pdf.ts renders it via Chromium
src/output.ts         JSON + CSV emitters
src/pull.ts           the pipeline; src/cli.ts the `pull` command
test/address.test.ts  pure-parser tests
```

## Cook gotchas (in code, keep them)

- Zero-pad PINs to 14 digits. Datasets are multi-year → order `year DESC`, take latest.
- Assessed value: skip the current year if null (Board hasn't acted), take latest with a value.
- Billed tax is NOT in open data (Treasurer) → show assessed value + warn.

## Conventions

- TS strict, ESM, functional, early returns, files < 300 lines.
- `npm test` + `npm run typecheck` green before commit.
- `output/*` gitignored — never commit harvested property data.

## Verified live

- DuPage: 620 Rodenburg Rd, Roselle → PIN 02-08-205-015, $9,550.56 tax @ 7.1689%,
  FCV $149,222 (land 38,692 / imp 110,530), owner-occupied.
- Cook: 5046 S Greenwood Ave, Chicago → PIN 20-11-115-037-0000, Hyde Park twp,
  6bd/6ba, 6,243 sqft, built 1922, assessed $220k, absentee LLC owner, 1 sale on record.
- 9 unit tests + typecheck green.
