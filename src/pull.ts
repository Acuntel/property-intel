// Core pipeline: input (address or Redfin/Zillow URL) -> PropertyRecord, built
// entirely from PUBLIC RECORDS. If the input is a listing URL we just parse the
// address out of it and look that address up — we never fetch the listing site.
//
//   1. resolve input to an address (addressFromUrl for URLs, else pass through)
//   2. geocode (Census)   -> lat/lon, county FIPS, township, normalized address
//   3. county adapter     -> PIN, owner, tax, valuation, building, lot, districts, sales
//   4. merge + warnings
import { geocode } from "./geocode.js";
import { parseAddress } from "./address.js";
import { lookupParcel, supportedCounties } from "./county/index.js";
import { mergeRecord } from "./merge.js";
import type { PropertyRecord } from "./types.js";

export interface PullOpts {
  address?: string; // explicit address when the input is a URL
}

// Pull a rough street address out of a Redfin/Zillow URL slug.
export function addressFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (u.hostname.includes("redfin.com") && parts.length >= 3) {
      const state = parts[0];
      const city = (parts[1] ?? "").replace(/-/g, " ");
      const slug = parts[2] ?? "";
      const zip = slug.match(/-(\d{5})(?:$|-)/)?.[1] ?? "";
      const street = slug
        .replace(/-\d{5}.*$/, "")
        .replace(/-/g, " ")
        .trim();
      if (street) return `${street}, ${city}, ${state} ${zip}`.trim();
    }
    if (u.hostname.includes("zillow.com")) {
      const hd = parts.indexOf("homedetails");
      const slug = hd >= 0 ? parts[hd + 1] : undefined;
      if (slug)
        return slug
          .replace(/-/g, " ")
          .replace(/\s+\d+\s*$/, "")
          .trim();
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export async function pull(
  input: string,
  opts: PullOpts = {},
): Promise<PropertyRecord> {
  const warnings: string[] = [];
  const isUrl = /^https?:\/\//i.test(input);
  const addressForGeo =
    opts.address ?? (isUrl ? addressFromUrl(input) : input) ?? input;

  const geo = await geocode(addressForGeo);
  if (!geo) {
    throw new Error(
      `Could not geocode "${addressForGeo}". Provide a full street address (or --address with a URL).`,
    );
  }

  const parsed = parseAddress(geo.matchedAddress);
  const { parcel, supported } = await lookupParcel(
    geo.countyFips,
    parsed,
  ).catch((e) => {
    warnings.push(
      `County lookup failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { parcel: null, supported: true };
  });

  if (!supported) {
    warnings.push(
      `${geo.county} County (FIPS ${geo.countyFips}) has no assessor adapter yet — ` +
        `supported: ${supportedCounties().join(", ")}. Location + township still resolved from Census.`,
    );
  } else if (!parcel) {
    warnings.push(
      `No parcel match in ${geo.county} County for "${parsed.number} ${parsed.street}".`,
    );
  } else {
    // honest notes about what each county's public records do/don't include
    if (parcel.source.startsWith("DuPage") && parcel.beds == null) {
      warnings.push(
        "DuPage public records don't publish building characteristics (beds/baths/sqft) — " +
          "shown values are land/assessment/valuation only.",
      );
    }
    if (parcel.source.startsWith("Cook") && parcel.taxAmount == null) {
      warnings.push(
        "Cook billed-tax dollars aren't in open data — see cookcountypropertyinfo.com for the exact bill " +
          "(assessed value shown instead).",
      );
    }
  }

  return mergeRecord({ input, geo, parcel, warnings });
}
