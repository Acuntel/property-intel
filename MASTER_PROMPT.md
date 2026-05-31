# MASTER_PROMPT — property-intel

The architecture that makes this work. Read this before changing anything.

## The problem

A realtor (Redfin/Zillow-native, not a traditional MLS power-user) wants to paste
an **address or a Redfin/Zillow URL** and get back **all the property-specific data**
for a property — the stuff that actually matters for brokerage:

- street address, PIN / parcel number, township
- lot size, square footage, bed / bath count, year built
- property taxes, assessed value, owner of record
- list price, status, MLS #, days on market

…and **none** of the noise (schools, walk score, "nearby coffee"). Use case:
_"I'm going to sell the Schwartz house — pull the whole listing and all the data for me."_

## The one insight the whole design rests on

**This is two data sources joined on the parcel, not one scrape.**

| Field group                                         | Authoritative source            | Why                                                                                                                          |
| --------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| PIN, township, lot, taxes, assessed value, owner    | **County assessor** (free APIs) | The assessor is the legal system of record. Redfin/Zillow's copy is secondhand, patchy, and they almost never show township. |
| price, beds/baths, sqft, photos, MLS #, status, DOM | **Redfin / Zillow**             | Marketing data. Rich, current, but not authoritative and behind anti-bot walls.                                              |

So the pipeline geocodes the address, hits the **county** for the authoritative core
(this always works and is free), and **best-effort** enriches with listing data. A
blocked or missing listing never fails the pull — the county record stands on its own.

## Pipeline (src/pull.ts)

```
input (address | redfin url | zillow url)
   │
   ├─ 1. resolve to address      addressFromUrl() for URLs, else pass through
   │
   ├─ 2. geocode  (Census)       src/geocode.ts
   │      → matched address, lat/lon, county FIPS, TOWNSHIP (County Subdivision geo)
   │
   ├─ 3. county adapter          src/county/index.ts  (router by FIPS)
   │      → PIN, lot, assessed value, tax, owner          [AUTHORITATIVE]
   │      DuPage  = ArcGIS REST (verified)   17043
   │      Cook    = CCAO Socrata             17031
   │
   ├─ 4. listing adapter (opt)   src/listing/index.ts
   │      → price, beds/baths, sqft, MLS, status          [BEST-EFFORT]
   │      Redfin  = Playwright → in-page stingray JSON API
   │      Zillow  = Playwright → __NEXT_DATA__ / Apollo cache
   │
   └─ 5. merge with provenance   src/merge.ts → PropertyRecord (+ warnings[])
          → output: JSON / CSV / PDF
```

## Why each source works the way it does

### Geocoding — US Census (free, no key)

`geographies/onelineaddress` returns the **County Subdivision**, which in Illinois
_is_ the civil township ("Bloomingdale township"), and its GEOID's first 5 digits are
the county FIPS. One free call gives normalized address + lat/lon + county + township.

### County — go straight to the assessor, it's free and authoritative

Illinois is county-administered, so the county GIS/assessor is the source of truth.

- **DuPage** (and most collar counties — they all run Esri ArcGIS): a single public
  ArcGIS REST query on `ParcelsWithRealEstateCC/MapServer/0` returns PIN, ACREAGE
  (lot), BILLVALUE (assessed), TAXAMOUNT, BILLNAME (owner). No auth. **Verified live.**
  Match on `PROPSTNAME LIKE '<num> <streetbase>%'` because the house number is embedded
  in the street-name field and `PROPSTNUM` is often null.
- **Cook**: CCAO Socrata datasets — Parcel Addresses (address→PIN), Parcel Universe
  (township/lot), Assessed Values. Zero-pad PINs to 14 digits. Billed-tax dollars need
  the Treasurer (no API; ptaxsim bulk SQLite) — flagged as a warning for now.
- Adding a county = write an adapter returning `ParcelInfo`, register its FIPS in
  `src/county/index.ts`. Roselle/Schaumburg straddle the DuPage/Cook line, so always
  route by the geocoded FIPS, never by city name.

### Listing — Redfin/Zillow require a real browser

Plain HTTP to Redfin's stingray API **hard-403s** (CloudFront "Request blocked",
verified). Zillow is worse (PerimeterX/HUMAN + Cloudflare). So `src/listing/browser.ts`
opens a Playwright session that **navigates the real page first** (establishing the
clearance cookie), then calls the site's own JSON endpoints **from within the page
context** where the session is valid:

- **Redfin**: `location-autocomplete` (address→path) → `initialInfo` (propertyId) →
  `aboveTheFold` + `belowTheFold`. Responses carry a `{}&&` anti-hijack prefix that
  `stripJsonPrefix()` removes.
- **Zillow**: parse `script#__NEXT_DATA__` → `gdpClientCache`, fall back to
  `hdpApolloPreloadedData`. Walk for the object with `resoFacts`.

Defaults to bundled-chromium headless (fast). For production reliability set
`PROPERTY_INTEL_HEADLESS=false` and/or `PROPERTY_INTEL_CHROME=true` to drive real
Chrome — the proven anti-bot config from il-association-leads. If you ever scale past
a handful of pulls, route through a residential proxy, a managed scraping API
(Scrapfly/ScraperAPI/Zyte), an Apify Redfin/Zillow actor, or the distressed-scraper
AWS Lambda IP-relay (us-east-2). **Keep volume low and human-paced; never scrape while
logged into a Redfin/Zillow account; use the data internally, don't republish it.**

## Provenance & honesty rules

- Every PropertyRecord stamps `sources` (which group came from where) and accumulates
  `warnings[]` (unsupported county, no parcel match, listing blocked). The PDF prints
  both. **Never** present scraped listing numbers as authoritative — the report tags
  the assessor column "authoritative" and the listing column "supplemental".
- County is the join key of record: PIN is the primary key, address-only joins across
  listing vs. assessor data are unreliable.

## Conventions

- TypeScript strict, ESM, functional, early returns, files < 300 lines.
- Pure parsers (`address.ts`, `stripJsonPrefix`, `addressFromUrl`) are unit-tested;
  network adapters are not (they hit live sites). `npm test` + `npm run typecheck`
  stay green before committing.
- Generated pulls under `output/` are gitignored — never commit harvested data.

## Roadmap / next

- Photos (Redfin `mediaBrowserInfo`, Zillow `photos[]`) into the PDF.
- Batch mode: `pull --file addresses.txt` → one multi-page PDF.
- More collar-county ArcGIS adapters (Kane/Lake/Will/McHenry — same Esri pattern).
- Optional Regrid/ATTOM fallback for out-of-IL or uniform multi-county schema.
