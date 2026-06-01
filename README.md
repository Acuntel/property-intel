# property-intel

Paste a **Redfin/Zillow URL or a street address** → get all the property-specific data
a realtor actually wants (PIN/parcel, township, legal description, lot, sqft,
beds/baths, year built, taxes, assessed value, owner, **sale history**) and export it
as **JSON, CSV, and an organized print-ready PDF**.

Built for brokerage lookups: _"pull the whole record for me."_

**It's a public-records lookup, not a scraper.** The data comes from free official
county sources — the US Census geocoder + the county assessor (DuPage ArcGIS, Cook
County CCAO open data). If you paste a Redfin/Zillow link, it just reads the address
out of the URL and looks that up; it never fetches the listing site. See
[`MASTER_PROMPT.md`](./MASTER_PROMPT.md) for the architecture.

## Setup

```bash
npm install
npm run setup:browser   # one-time: Chromium for PDF rendering (skips if cached)
```

## Usage

```bash
# DuPage
npm run pull -- "620 Rodenburg Rd, Roselle, IL 60172"

# Cook (returns beds/baths/sqft/year + sale history)
npm run pull -- "5046 S Greenwood Ave, Chicago, IL 60615"

# from a listing URL (address is read from the URL slug — the site is never fetched)
npm run pull -- "https://www.redfin.com/IL/Roselle/620-Rodenburg-Rd-60172/home/16895259"
```

### Batch a whole DuPage city

```bash
# even-sampled spread across the city
npm run pull -- batch "Elmhurst" --count 100

# EVERY residential parcel in the city (e.g. all ~14.7k in Elmhurst)
npm run pull -- batch "Elmhurst" --all
```

Batch scans the full city via keyset pagination, derives township per PIN group,
and emits a combined CSV + JSON + a paginated table PDF with summary stats
(median assessed/tax, total tax billed, % absentee-owned). CSV is the practical
deliverable at city scale; the PDF table runs ~50 rows/page.

### Homes currently for sale (Redfin + county)

```bash
npm run pull -- forsale "Elmhurst" --count 50     # 50 active listings
npm run pull -- forsale "Elmhurst"                # all active listings
```

`forsale` pulls a city's **active listings** from Redfin in one region request
(address + beds/baths/sqft/year/list price) and joins each to its county assessor
record (PIN/owner/lot/assessed/tax). This is the only flow that fills beds/baths/sqft
for DuPage. Redfin is used because Zillow is captcha-walled; both carry the same MLS
data. New cities need their Redfin region id — add it to `REDFIN_REGIONS` in
`src/listing/redfin-search.ts` or pass `--region <id> --market <market>`.

Outputs land in `output/<name>.{json,csv,pdf}`.

### Options

| Flag                         | Effect                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| `--address "<addr>"`         | Explicit address when the input is a URL (improves county match) |
| `--out <name>`               | Output basename (default: derived from the address)              |
| `--json` / `--csv` / `--pdf` | Emit only the chosen format(s) (default: all three)              |
| `--print`                    | Also print the JSON record to stdout                             |

## Coverage

| County             | PIN/owner/tax                           | Valuation         | Beds/baths/sqft      | Sale history |
| ------------------ | --------------------------------------- | ----------------- | -------------------- | ------------ |
| **DuPage** (17043) | ✅                                      | ✅ land/imp/total | ❌ not in public GIS | ❌           |
| **Cook** (17031)   | ✅ (assessed; billed tax via Treasurer) | ✅ assessed       | ✅                   | ✅           |

Other Chicago collar counties run the same Esri ArcGIS stack as DuPage — add an
adapter + FIPS in `src/county/`. Unsupported counties still resolve location + township
from Census. The PDF only shows fields that records actually return — no blank filler.

## Notes

All sources are public and free. We don't scrape Redfin/Zillow or hit any login-gated
or rate-limited endpoint — this is the official system-of-record data. Cook billed-tax
dollars aren't in open data; the tool shows assessed value and points to
cookcountypropertyinfo.com for the exact bill.

## Dev

```bash
npm test          # unit tests (pure parsers)
npm run typecheck # tsc --noEmit
```
