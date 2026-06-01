# MASTER_PROMPT — property-intel

The architecture that makes this work. Read this before changing anything.

## The problem

A realtor (Redfin/Zillow-native, not a traditional MLS power-user) wants to paste
an **address or a Redfin/Zillow URL** and get back **all the property-specific data**
for a property — the stuff that actually matters for brokerage:

- street address, PIN / parcel number, township, municipality, legal description
- lot size, square footage, bed / bath count, year built, building characteristics
- property taxes, assessed value, fair-cash valuation, owner of record, sale history

…and **none** of the noise (schools-rating blurbs, walk score, "nearby coffee").
Use case: _"I'm going to sell the Schwartz house — pull the whole record for me."_

## How we get the data — public-records lookup, NOT scraping

**We do not scrape Redfin/Zillow.** We look the address up in **public county
records** and take what's there. If the input is a Redfin/Zillow URL, we only parse
the street address out of the URL slug — we never fetch the listing site, never drive
a browser against it, never touch their internal APIs. Everything in the output comes
from free, official, public datasets:

| Source                         | What it gives                                                                                             | Access                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------- |
| **US Census geocoder**         | normalized address, lat/lon, county FIPS, civil township                                                  | free HTTP, no key         |
| **DuPage County ArcGIS**       | PIN, owner+mailing, assessment/tax, fair-cash value (land/imp), legal desc, lot, taxing districts         | free ArcGIS REST, no key  |
| **Cook County CCAO open data** | PIN, owner+mailing, assessed value, **beds/baths/sqft/year built**, lot, districts, **full sale history** | free Socrata SoDA, no key |

This is the whole point of the design: the county assessor is the legal system of
record, it's free, and it has far more than a listing page shows (legal description,
exemptions, valuation breakdown, sale history, mailing address for absentee detection).
Bed/bath/sqft — the one thing people assume only Zillow has — is published directly by
Cook County as open data.

## Pipeline (src/pull.ts)

```
input (address | redfin url | zillow url)
   │
   ├─ 1. resolve to address      addressFromUrl() parses the URL slug; else pass through
   │
   ├─ 2. geocode  (Census)       src/geocode.ts
   │      → matched address, lat/lon, county FIPS, township (County Subdivision geo)
   │
   ├─ 3. county adapter          src/county/index.ts  (router by FIPS)
   │      DuPage  17043 = ArcGIS REST          src/county/dupage.ts
   │      Cook    17031 = CCAO Socrata (5 datasets, joined on PIN)  src/county/cook.ts
   │
   └─ 4. merge + warnings        src/merge.ts → PropertyRecord
          → output: JSON / CSV / organized PDF
```

## Why each source works the way it does

### Geocoding — US Census (free, no key)

`geographies/onelineaddress` returns the **County Subdivision**, which in Illinois is
the civil township, and its GEOID's first 5 digits are the county FIPS. One call gives
normalized address + lat/lon + county + township. For Chicago the Census MCD is the
city, so the Cook adapter overrides township with the assessor's `township_name`
(e.g. "Hyde Park") which is the assessment township that actually matters.

### DuPage — one ArcGIS REST query, `outFields=*`

`ParcelsWithRealEstateCC/MapServer/0` returns the full record. Match on
`PROPSTNAME LIKE '<num> <streetbase>%'` because the house number is embedded in the
street-name field and `PROPSTNUM` is often null. DuPage publishes assessment,
valuation, legal, and districts — but **no building characteristics** (beds/baths/sqft)
and no sale history. The tool emits a warning saying so rather than faking it. Most
collar counties (Kane/Lake/Will/McHenry) run the same Esri stack → same adapter shape.

### Cook — five CCAO Socrata datasets, joined on PIN

`3723-97qp` Parcel Addresses (address→PIN, owner, mailing) → `x54s-btds` Improvement
Characteristics (year built, building sqft, beds, full/half baths, rooms, ext wall,
A/C, basement, garage) → `wvhk-k5uv` Parcel Sales (price/date/deed/buyer/seller) →
`nj4t-kc8j` Parcel Universe (township, lot, taxing districts, flood) → `uzyt-m557`
Assessed Values (board/certified/mailed totals). Gotchas baked into the adapter:

- **Zero-pad PINs to 14 digits** (leading zeros drop on export).
- **Datasets are multi-year** — order `year DESC` and take the latest; for assessed
  value, skip the current year if it's null (board hasn't acted) and take the latest
  year that has a value.
- **Billed-tax dollars are NOT in open data** (that's the Treasurer, no API; ptaxsim
  is the bulk route). The tool shows assessed value and warns about the tax bill.

## Provenance & honesty rules

- Every PropertyRecord stamps `sources` and accumulates `warnings[]` (county not
  supported, no parcel match, data a county doesn't publish). The PDF prints both.
- The PDF omits empty fields and empty sections, so it shows exactly what records
  returned — never a wall of "—". County is the join key of record: PIN is the
  primary key; address-only joins are unreliable.
- `absenteeOwner` is derived by comparing the property address to the mailing address
  — a genuinely useful brokerage signal that listing sites don't surface.

## County routing

Roselle/Schaumburg straddle the DuPage/Cook line, so **always route by the geocoded
county FIPS, never by city name.** Adding a county = write an adapter returning a
`ParcelInfo`, register its FIPS in `src/county/index.ts`. Unsupported counties still
resolve location + township from Census and emit a warning.

## Conventions

- TypeScript strict, ESM, functional, early returns, files < 300 lines.
- Pure parsers (`address.ts`, `stripJsonPrefix`, `addressFromUrl`) are unit-tested;
  county adapters hit live public APIs and aren't unit-tested. `npm test` +
  `npm run typecheck` stay green before committing.
- Playwright/Chromium is used ONLY to render the HTML report to PDF locally — never
  to fetch a listing site.
- Generated pulls under `output/` are gitignored — never commit harvested data.

## Roadmap / next

- More collar-county ArcGIS adapters (Kane/Lake/Will/McHenry — same Esri pattern).
- DuPage building characteristics if/when a richer county service is found; otherwise
  an optional licensed property-data API (RentCast/ATTOM, queried by address — still a
  lookup, not a scrape) to fill beds/baths/sqft for DuPage.
- Batch mode: `pull --file addresses.txt` → one multi-page PDF.
- Recorder sale-history for DuPage (separate from the assessor GIS).
