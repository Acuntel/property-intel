// For-sale pull: get a city's active listings from Redfin (beds/baths/sqft/price),
// then join each to its county assessor record (PIN/tax/owner/lot/legal) by
// address. Result is the full merged record — but only for homes on the market.
import {
  fetchForSaleListings,
  REDFIN_REGIONS,
  type ForSaleListing,
} from "./listing/redfin-search.js";
import { pull } from "./pull.js";
import type { PropertyRecord } from "./types.js";

export interface ForSaleOpts {
  regionId?: number;
  market?: string;
  count?: number; // Infinity = all active listings
}

// strip a unit/apt so the county address lookup matches the building parcel
function countyAddress(l: ForSaleListing, city: string): string {
  const street = l.address.replace(/\b(unit|apt|ste|#).*$/i, "").trim();
  return `${street}, ${l.city ?? city}, IL ${l.zip ?? ""}`.trim();
}

export async function forSaleCity(
  city: string,
  opts: ForSaleOpts = {},
  onStatus?: (m: string) => void,
): Promise<PropertyRecord[]> {
  const region = REDFIN_REGIONS[city.toLowerCase()];
  const regionId = opts.regionId ?? region?.id;
  const market = opts.market ?? region?.market ?? "chicago";
  if (!regionId) {
    throw new Error(
      `No Redfin region for "${city}". Pass --region <id> --market <market> ` +
        `(find the id in the redfin.com/city/<id>/... URL).`,
    );
  }

  const listings = await fetchForSaleListings(regionId, market, onStatus);
  if (!listings.length) return [];
  const count = opts.count ?? Infinity;
  const chosen = count >= listings.length ? listings : listings.slice(0, count);
  onStatus?.(
    `${listings.length} active listings; joining ${chosen.length} to county records…`,
  );

  const out: PropertyRecord[] = [];
  for (const l of chosen) {
    let rec: PropertyRecord | null = null;
    try {
      rec = await pull(countyAddress(l, city));
    } catch {
      rec = null;
    }
    out.push(rec ? overlay(rec, l) : fromListing(l, city));
  }
  return out;
}

// Overlay active-listing fields onto the county record. Listing data is
// authoritative for beds/baths/sqft (county may not publish them).
function overlay(rec: PropertyRecord, l: ForSaleListing): PropertyRecord {
  rec.forSale = true;
  rec.listPrice = l.price;
  rec.listingStatus = l.status;
  rec.mlsNumber = l.mls;
  rec.daysOnMarket = l.daysOnMarket;
  rec.listingUrl = l.url;
  rec.pricePerSqft =
    l.price && l.sqft ? Math.round(l.price / l.sqft) : undefined;
  rec.beds = l.beds ?? rec.beds;
  rec.fullBaths = l.fullBaths ?? rec.fullBaths;
  rec.halfBaths = l.halfBaths ?? rec.halfBaths;
  rec.buildingSqft = l.sqft ?? rec.buildingSqft;
  rec.yearBuilt = l.yearBuilt ?? rec.yearBuilt;
  rec.propertyType = l.propertyType ?? rec.propertyType;
  rec.sources["listing"] = "Redfin (active listing)";
  // we filled beds/baths/sqft from the listing, so drop the DuPage "no building
  // characteristics" note; keep genuine ones (e.g. no parcel match for condos).
  rec.warnings = rec.warnings.filter(
    (w) => !w.includes("building characteristics"),
  );
  return rec;
}

// Fallback when the county lookup found nothing (e.g. a condo unit or a
// non-DuPage edge address): a listing-only record.
function fromListing(l: ForSaleListing, city: string): PropertyRecord {
  return {
    input: l.address,
    address: l.address,
    city: l.city ?? city,
    state: "IL",
    zip: l.zip ?? "",
    county: "DuPage",
    township: "",
    pin: "",
    forSale: true,
    listPrice: l.price,
    listingStatus: l.status,
    mlsNumber: l.mls,
    daysOnMarket: l.daysOnMarket,
    pricePerSqft: l.price && l.sqft ? Math.round(l.price / l.sqft) : undefined,
    listingUrl: l.url,
    beds: l.beds,
    fullBaths: l.fullBaths,
    halfBaths: l.halfBaths,
    buildingSqft: l.sqft,
    yearBuilt: l.yearBuilt,
    propertyType: l.propertyType,
    schoolDistricts: [],
    sales: [],
    sources: { listing: "Redfin (active listing)" },
    warnings: [
      "No county parcel matched this address (condo unit or off-parcel) — listing data only.",
    ],
    fetchedAt: new Date().toISOString(),
  };
}
