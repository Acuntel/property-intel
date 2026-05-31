# property-intel

Paste a **Redfin/Zillow URL or a street address** → pull all the property-specific
data a realtor actually wants (PIN/parcel, township, lot, sqft, beds/baths, taxes,
assessed value, owner, list price) and export it as **JSON, CSV, and a print-ready PDF**.

Built for brokerage use: _"pull the whole listing and all the data for me."_

It joins two sources — the **county assessor** (authoritative for PIN, township, lot,
taxes, owner; free) and **Redfin/Zillow** (supplemental for price, beds/baths, sqft,
MLS). See [`MASTER_PROMPT.md`](./MASTER_PROMPT.md) for the architecture.

## Setup

```bash
npm install
npm run setup:browser   # one-time: Playwright Chromium (skips if already cached)
```

## Usage

```bash
# County data only (fast, always works for supported counties)
npm run pull -- "620 Rodenburg Rd, Roselle, IL 60172"

# + listing enrichment from Redfin/Zillow (best-effort, uses a headless browser)
npm run pull -- "https://www.redfin.com/IL/Roselle/620-Rodenburg-Rd-60172/home/16895259" --listing

# address + URL together (best matching when you have both)
npm run pull -- "https://www.zillow.com/homedetails/.../12345_zpid/" --listing --address "620 Rodenburg Rd, Roselle, IL"
```

Outputs land in `output/<address>.{json,csv,pdf}`.

### Options

| Flag                         | Effect                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| `--listing`                  | Enrich with Redfin/Zillow listing data (launches a browser)      |
| `--address "<addr>"`         | Explicit address when the input is a URL (improves county match) |
| `--out <name>`               | Output basename (default: derived from the address)              |
| `--json` / `--csv` / `--pdf` | Emit only the chosen format(s) (default: all three)              |
| `--print`                    | Also print the JSON record to stdout                             |

### Env

| Var                       | Default | Effect                                                                         |
| ------------------------- | ------- | ------------------------------------------------------------------------------ |
| `PROPERTY_INTEL_HEADLESS` | `true`  | `false` → visible real-browser session (more anti-bot resilient)               |
| `PROPERTY_INTEL_CHROME`   | `false` | `true` → use installed Chrome (`channel:"chrome"`) instead of bundled Chromium |

## Coverage

- **Counties (authoritative):** DuPage (live), Cook (CCAO open data). Other Chicago
  collar counties run the same Esri ArcGIS stack — add an adapter + FIPS in
  `src/county/`. Location + township resolve nationwide via Census even for
  unsupported counties.
- **Listing:** Redfin (URL or address), Zillow (URL). Best-effort behind anti-bot;
  a blocked listing never fails the pull.

## Notes

Redfin/Zillow Terms prohibit automated extraction — keep volume low and human-paced,
don't scrape while logged in, and use the data internally rather than republishing it.
The county assessor data is public and the system of record. Not legal advice.

## Dev

```bash
npm test          # unit tests (pure parsers)
npm run typecheck # tsc --noEmit
```
