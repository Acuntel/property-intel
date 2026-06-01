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

Outputs land in `output/<address>.{json,csv,pdf}`.

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
