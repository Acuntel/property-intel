// Core pipeline: input (address or Redfin/Zillow URL) -> PropertyRecord.
//
//   1. Resolve input to a geocodable address (URL -> address heuristic, or pass through)
//   2. Geocode (Census)          -> lat/lon, county FIPS, township, normalized address
//   3. County adapter            -> PIN, lot, assessed value, taxes, owner   [authoritative]
//   4. Listing adapter (opt)     -> price, beds/baths, sqft, MLS, photos     [best-effort]
//   5. Merge with provenance + warnings
import { geocode } from "./geocode.js";
import { parseAddress } from "./address.js";
import { lookupParcel, supportedCounties } from "./county/index.js";
import { fetchListing } from "./listing/index.js";
import { mergeRecord } from "./merge.js";
import type { PropertyRecord } from "./types.js";

export interface PullOpts {
  withListing?: boolean;
  // If the input is a URL, an explicit address improves county matching.
  address?: string;
}

// Pull a Redfin-style listing path or URL apart into a rough street address.
// e.g. ".../IL/Roselle/620-Rodenburg-Rd-60172/home/123" -> "620 Rodenburg Rd, Roselle, IL 60172"
export function addressFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // Redfin: /<STATE>/<City>/<Street-Words-ZIP>/home/<id>
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
    // Zillow: /homedetails/<Street-City-ST-ZIP>/<zpid>_zpid/
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

  // 3. County parcel (authoritative)
  let parcel = null;
  const parsed = parseAddress(geo.matchedAddress);
  const { parcel: p, supported } = await lookupParcel(
    geo.countyFips,
    parsed,
  ).catch((e) => {
    warnings.push(
      `County lookup failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { parcel: null, supported: true };
  });
  parcel = p;
  if (!supported) {
    warnings.push(
      `${geo.county} County (FIPS ${geo.countyFips}) not yet supported — ` +
        `adapters exist for ${supportedCounties().join(", ")}. Location/township still resolved.`,
    );
  } else if (!parcel) {
    warnings.push(
      `No parcel match in ${geo.county} County for "${parsed.number} ${parsed.street}".`,
    );
  }

  // 4. Listing (best-effort enrichment)
  let listing = null;
  if (opts.withListing) {
    const { listing: l, warning } = await fetchListing(
      isUrl ? input : addressForGeo,
    );
    listing = l;
    if (warning) warnings.push(warning);
  }

  return mergeRecord({ input, geo, parcel, listing, warnings });
}
