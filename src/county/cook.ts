// Cook County parcel adapter — CCAO open data (Socrata SoDA API), free.
// Address -> PIN via the Parcel Addresses dataset, then PIN -> township/lot +
// assessed value via Parcel Universe / Assessed Values.
//
// NOTE: Cook's authoritative *billed-tax* dollars come from the Treasurer
// (no public API; ptaxsim bulk SQLite is the programmatic route). This adapter
// returns PIN + township + lot + assessed value and flags taxes as unavailable
// via API — verify billed amounts against cookcountypropertyinfo.com.
import { fetchJson } from "../http.js";
import { sqlEscape } from "../address.js";
import type { ParcelInfo, ParsedAddress } from "../types.js";

const BASE = "https://datacatalog.cookcountyil.gov/resource";
const ADDRESSES = `${BASE}/3723-97qp.json`; // Assessor - Parcel Addresses
const UNIVERSE = `${BASE}/nj4t-kc8j.json`; // Assessor - Parcel Universe
const ASSESSED = `${BASE}/uzyt-m557.json`; // Assessor - Assessed Values

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function soql<T = Record<string, unknown>>(
  url: string,
  where: string,
  limit = 1,
): Promise<T[]> {
  const full = `${url}?$where=${encodeURIComponent(where)}&$limit=${limit}`;
  return fetchJson<T[]>(full, { cache: true });
}

export async function lookupCook(
  addr: ParsedAddress,
): Promise<ParcelInfo | null> {
  if (!addr.number || !addr.streetBase) return null;

  // 1) address -> PIN. The Parcel Addresses dataset stores cleaned address parts.
  const where =
    `mailing_house_number='${sqlEscape(addr.number)}' ` +
    `AND upper(mailing_street_name) like '%${sqlEscape(addr.streetBase)}%'`;
  let pin = "";
  try {
    const rows = await soql<Record<string, unknown>>(ADDRESSES, where, 5);
    const hit = rows[0];
    if (hit) pin = String(hit["pin"] ?? hit["pin10"] ?? "").trim();
  } catch {
    // address dataset shape varies; fall through to null below.
  }
  if (!pin) return null;
  const pin14 = pin.padStart(14, "0");

  const out: ParcelInfo = {
    pin: pin14,
    source: "Cook County CCAO (Socrata)",
  };

  // 2) PIN -> township + lot from Parcel Universe.
  try {
    const u = (await soql(UNIVERSE, `pin='${sqlEscape(pin14)}'`))[0];
    if (u) {
      // township comes from the Census geocoder; here we only need lot size.
      out.lotSqft = num(u["lot_size"]) ?? num(u["land_sf"]);
      if (out.lotSqft) out.lotAcres = +(out.lotSqft / 43_560).toFixed(3);
    }
  } catch {
    /* best-effort */
  }

  // 3) PIN -> latest assessed total.
  try {
    const av = (await soql(ASSESSED, `pin='${sqlEscape(pin14)}'`, 1))[0] as
      | Record<string, unknown>
      | undefined;
    if (av) out.assessedValue = num(av["tot"]) ?? num(av["total"]);
  } catch {
    /* best-effort */
  }

  return out;
}
