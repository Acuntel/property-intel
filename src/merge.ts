// Merge geo + parcel into one PropertyRecord. Everything comes from public
// records; `sources` records which dataset each group came from.
import type { GeoInfo, ParcelInfo, PropertyRecord } from "./types.js";

function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

export function mergeRecord(args: {
  input: string;
  geo: GeoInfo;
  parcel: ParcelInfo | null;
  warnings: string[];
}): PropertyRecord {
  const { input, geo, parcel, warnings } = args;

  const sources: Record<string, string> = { location: "US Census geocoder" };
  if (parcel) sources["assessor"] = parcel.source;

  const base: PropertyRecord = {
    input,
    address: geo.matchedAddress.split(",")[0]?.trim() || input,
    city: geo.city,
    state: geo.state,
    zip: geo.zip,
    county: geo.county,
    township: geo.township,
    pin: "",
    lat: geo.lat || undefined,
    lon: geo.lon || undefined,
    schoolDistricts: [],
    sales: [],
    sources,
    warnings,
    fetchedAt: new Date().toISOString(),
  };

  if (parcel) {
    const { source: _source, township, ...fields } = parcel;
    Object.assign(base, defined(fields));
    // assessor township is more precise for IL than the Census MCD; prefer it.
    if (township) base.township = township;
    // keep Census zip if the assessor record lacks one
    base.zip = base.zip || geo.zip;
  }

  return base;
}
