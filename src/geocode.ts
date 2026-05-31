// Census Bureau geocoder: address -> normalized address, lat/lon, county (FIPS),
// and civil township. Free, no API key. The County Subdivision geography IS the
// civil township in Illinois, and its GEOID's first 5 digits are the county FIPS.
import { fetchJson } from "./http.js";
import { parseAddress } from "./address.js";
import type { GeoInfo } from "./types.js";

const BASE =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

const COUNTY_BY_FIPS: Record<string, string> = {
  "17031": "Cook",
  "17043": "DuPage",
  "17089": "Kane",
  "17097": "Lake",
  "17111": "McHenry",
  "17197": "Will",
  "17037": "DeKalb",
  "17093": "Kendall",
};

interface CensusResp {
  result?: {
    addressMatches?: Array<{
      matchedAddress?: string;
      coordinates?: { x: number; y: number };
      geographies?: Record<string, Array<Record<string, unknown>>>;
    }>;
  };
}

export async function geocode(address: string): Promise<GeoInfo | null> {
  const url =
    `${BASE}?address=${encodeURIComponent(address)}` +
    `&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;

  const data = await fetchJson<CensusResp>(url, { cache: true });
  const match = data.result?.addressMatches?.[0];
  if (!match) return null;

  const matchedAddress = match.matchedAddress ?? address;
  const coords = match.coordinates ?? { x: 0, y: 0 };
  const geos = match.geographies ?? {};

  const sub = geos["County Subdivisions"]?.[0];
  const counties = geos["Counties"]?.[0];

  const township = sub ? String(sub["BASENAME"] ?? "").trim() : "";
  // County FIPS: prefer the Counties layer; fall back to the subdivision GEOID prefix.
  const subGeoid = sub ? String(sub["GEOID"] ?? "") : "";
  const countyFips = counties
    ? String(counties["GEOID"] ?? "")
    : subGeoid.slice(0, 5);
  const countyName =
    (counties ? String(counties["BASENAME"] ?? "").trim() : "") ||
    COUNTY_BY_FIPS[countyFips] ||
    "Unknown";

  const parsed = parseAddress(matchedAddress);

  return {
    matchedAddress,
    lat: coords.y,
    lon: coords.x,
    county: countyName,
    countyFips,
    township,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
  };
}
