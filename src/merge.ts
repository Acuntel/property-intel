// Merge geo + parcel + listing into one flat PropertyRecord, stamping each
// field group's provenance. County (assessor) data is authoritative; listing
// data is supplemental marketing data.
import type {
  GeoInfo,
  ListingInfo,
  ParcelInfo,
  PropertyRecord,
} from "./types.js";

export function mergeRecord(args: {
  input: string;
  geo: GeoInfo;
  parcel: ParcelInfo | null;
  listing: ListingInfo | null;
  warnings: string[];
}): PropertyRecord {
  const { input, geo, parcel, listing, warnings } = args;

  const sources: Record<string, string> = { location: "US Census geocoder" };
  if (parcel) sources["assessor"] = parcel.source;
  if (listing) sources["listing"] = listing.source;

  const street =
    parcel?.propertyAddress?.replace(/\s+/g, " ").trim() ||
    geo.matchedAddress.split(",")[0]?.trim() ||
    input;

  return {
    input,
    address: street,
    city: parcel?.city?.trim() || geo.city,
    state: geo.state,
    zip: geo.zip,
    county: geo.county,
    township: geo.township,
    pin: parcel?.pin ?? "",
    lat: geo.lat || undefined,
    lon: geo.lon || undefined,
    // listing (supplemental)
    price: listing?.price,
    beds: listing?.beds,
    baths: listing?.baths,
    sqft: listing?.sqft,
    yearBuilt: listing?.yearBuilt,
    propertyType: listing?.propertyType,
    status: listing?.status,
    mlsNumber: listing?.mlsNumber,
    daysOnMarket: listing?.daysOnMarket,
    pricePerSqft: listing?.pricePerSqft,
    listingUrl: listing?.url,
    // assessor (authoritative)
    ownerName: parcel?.ownerName,
    lotAcres: parcel?.lotAcres,
    lotSqft: parcel?.lotSqft,
    assessedValue: parcel?.assessedValue,
    taxAmount: parcel?.taxAmount,
    taxYear: parcel?.taxYear,
    // meta
    photos: listing?.photos ?? [],
    description: listing?.description,
    sources,
    warnings,
    fetchedAt: new Date().toISOString(),
  };
}
