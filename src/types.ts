// Shared types. A PropertyRecord is assembled purely from PUBLIC RECORDS:
//   geo    (US Census geocoder)  -> normalized address, county FIPS, township, lat/lon
//   parcel (county assessor)     -> everything else: PIN, owner, tax, valuation,
//                                   building characteristics, lot, districts, sales
// No listing-site scraping — we look the address up in public data and take what's there.

export interface GeoInfo {
  matchedAddress: string;
  lat: number;
  lon: number;
  county: string; // "DuPage"
  countyFips: string; // "17043"
  township: string; // "Bloomingdale" (Census civil township)
  city: string;
  state: string;
  zip: string;
}

export interface SaleRecord {
  date?: string; // YYYY-MM-DD
  price?: number;
  deedType?: string;
  seller?: string;
  buyer?: string;
  docNo?: string;
}

// Everything an assessor adapter can return. All optional except identity.
// Field names match PropertyRecord so merge can spread cleanly.
export interface ParcelInfo {
  source: string; // "DuPage County ArcGIS" | "Cook County CCAO (open data)"
  pin: string;
  // identity
  address?: string;
  city?: string;
  zip?: string;
  municipality?: string;
  township?: string; // assessor township (overrides Census when present)
  legalDescription?: string;
  propertyClass?: string;
  // owner
  ownerName?: string;
  mailingAddress?: string;
  absenteeOwner?: boolean;
  // assessment & tax
  assessedValue?: number;
  fcvLand?: number;
  fcvImprovement?: number;
  fcvTotal?: number;
  taxRate?: number;
  taxAmount?: number;
  taxYear?: number;
  exemptions?: string;
  // building characteristics
  yearBuilt?: number;
  buildingSqft?: number;
  beds?: number;
  fullBaths?: number;
  halfBaths?: number;
  rooms?: number;
  exteriorWall?: string;
  airConditioning?: string;
  basement?: string;
  garage?: string;
  propertyType?: string;
  // lot
  lotAcres?: number;
  lotSqft?: number;
  // districts
  schoolDistricts?: string[];
  parkDistrict?: string;
  libraryDistrict?: string;
  fireDistrict?: string;
  communityCollege?: string;
  floodZone?: string;
  // sales history
  sales?: SaleRecord[];
}

export interface PropertyRecord {
  input: string;
  // identity
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  township: string;
  municipality?: string;
  pin: string;
  legalDescription?: string;
  propertyClass?: string;
  lat?: number;
  lon?: number;
  // owner
  ownerName?: string;
  mailingAddress?: string;
  absenteeOwner?: boolean;
  // assessment & tax
  assessedValue?: number;
  fcvLand?: number;
  fcvImprovement?: number;
  fcvTotal?: number;
  taxRate?: number;
  taxAmount?: number;
  taxYear?: number;
  exemptions?: string;
  // building
  yearBuilt?: number;
  buildingSqft?: number;
  beds?: number;
  fullBaths?: number;
  halfBaths?: number;
  rooms?: number;
  exteriorWall?: string;
  airConditioning?: string;
  basement?: string;
  garage?: string;
  propertyType?: string;
  // lot
  lotAcres?: number;
  lotSqft?: number;
  // districts
  schoolDistricts: string[];
  parkDistrict?: string;
  libraryDistrict?: string;
  fireDistrict?: string;
  communityCollege?: string;
  floodZone?: string;
  // sales
  sales: SaleRecord[];
  // meta
  sources: Record<string, string>;
  warnings: string[];
  fetchedAt: string;
}

export interface ParsedAddress {
  number: string;
  street: string;
  streetBase: string;
  city: string;
  state: string;
  zip: string;
  oneLine: string;
}
