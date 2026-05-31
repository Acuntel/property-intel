// Shared types for the property-intel pipeline.
// A PropertyRecord is the merged output of three sources:
//   geo      (Census geocoder)         -> normalized address, county, township, lat/lon
//   parcel   (county assessor)         -> PIN, lot, assessed value, taxes, owner  [AUTHORITATIVE]
//   listing  (Redfin/Zillow)           -> price, beds/baths, sqft, photos, MLS    [best-effort]

export interface GeoInfo {
  matchedAddress: string;
  lat: number;
  lon: number;
  county: string; // "DuPage"
  countyFips: string; // "17043"
  township: string; // "Bloomingdale"
  city: string;
  state: string;
  zip: string;
}

export interface ParcelInfo {
  pin: string;
  ownerName?: string;
  propertyAddress?: string;
  city?: string;
  lotAcres?: number;
  lotSqft?: number;
  assessedValue?: number;
  taxAmount?: number;
  taxYear?: number;
  source: string; // "DuPage County ArcGIS" | "Cook County CCAO (Socrata)"
}

export interface ListingInfo {
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  propertyType?: string;
  status?: string;
  mlsNumber?: string;
  description?: string;
  daysOnMarket?: number;
  pricePerSqft?: number;
  photos?: string[];
  url?: string;
  source: string; // "Redfin" | "Zillow"
}

// Flat, mailer/CSV-friendly merged record. Field groups carry a provenance tag
// in `sources` so a realtor knows which numbers are authoritative (county) vs.
// scraped marketing data (listing).
export interface PropertyRecord {
  input: string;
  // identity / location
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  township: string;
  pin: string;
  lat?: number;
  lon?: number;
  // listing (best-effort)
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  propertyType?: string;
  status?: string;
  mlsNumber?: string;
  daysOnMarket?: number;
  pricePerSqft?: number;
  listingUrl?: string;
  // assessor (authoritative)
  ownerName?: string;
  lotAcres?: number;
  lotSqft?: number;
  assessedValue?: number;
  taxAmount?: number;
  taxYear?: number;
  // meta
  photos: string[];
  description?: string;
  sources: Record<string, string>;
  warnings: string[];
  fetchedAt: string;
}

export interface ParsedAddress {
  number: string;
  street: string; // street name without unit, e.g. "RODENBURG RD"
  streetBase: string; // first significant word(s) w/o suffix, for fuzzy LIKE, e.g. "RODENBURG"
  city: string;
  state: string;
  zip: string;
  oneLine: string;
}
