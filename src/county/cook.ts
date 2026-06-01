// Cook County parcel adapter — CCAO open data (Socrata SoDA API), free, no auth.
// Joins five datasets by PIN, all by public lookup (no scraping):
//   3723-97qp  Parcel Addresses    address -> PIN, owner, mailing
//   x54s-btds  Improvement Chars    year built, building sqft, beds/baths, rooms
//   wvhk-k5uv  Parcel Sales         sale price/date history
//   nj4t-kc8j  Parcel Universe      township, lot, districts, flood
//   uzyt-m557  Assessed Values      board/certified assessed totals
// Billed-tax dollars are NOT in open data (Cook Treasurer) — flagged as a warning.
import { fetchJson } from "../http.js";
import { sqlEscape } from "../address.js";
import type { ParcelInfo, ParsedAddress, SaleRecord } from "../types.js";

const BASE = "https://datacatalog.cookcountyil.gov/resource";
const D = {
  addr: `${BASE}/3723-97qp.json`,
  chars: `${BASE}/x54s-btds.json`,
  sales: `${BASE}/wvhk-k5uv.json`,
  univ: `${BASE}/nj4t-kc8j.json`,
  values: `${BASE}/uzyt-m557.json`,
};

const num = (v: unknown): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
};
const int = (v: unknown): number | undefined => {
  const n = num(v);
  return n == null ? undefined : Math.round(n);
};
const str = (v: unknown): string | undefined => {
  const s = String(v ?? "").trim();
  return s || undefined;
};

async function q<T = Record<string, unknown>>(
  url: string,
  where: string,
  order?: string,
  limit = 1,
): Promise<T[]> {
  const parts = [`$where=${encodeURIComponent(where)}`, `$limit=${limit}`];
  if (order) parts.push(`$order=${encodeURIComponent(order)}`);
  return fetchJson<T[]>(`${url}?${parts.join("&")}`, { cache: true });
}

function classLabel(cls?: string): string | undefined {
  if (!cls) return undefined;
  const head = cls[0];
  const label =
    head === "2"
      ? "Residential"
      : head === "3"
        ? "Multi-family"
        : head === "5"
          ? "Commercial"
          : head === "1"
            ? "Vacant/Land"
            : undefined;
  return label ? `${cls} (${label})` : cls;
}

export async function lookupCook(
  addr: ParsedAddress,
): Promise<ParcelInfo | null> {
  if (!addr.number || !addr.streetBase) return null;

  // 1) address -> PIN (latest year wins)
  const where =
    `upper(prop_address_full) like '${sqlEscape(addr.number)}% ${sqlEscape(addr.streetBase)}%'` +
    (addr.city
      ? ` AND upper(prop_address_city_name)='${sqlEscape(addr.city)}'`
      : "");
  const addrRows = await q<Record<string, string>>(
    D.addr,
    where,
    "year DESC",
    10,
  );
  if (!addrRows.length) return null;

  // prefer exact street equality, then a clean house-number start (skipping
  // "REAR"/garden/unit parcels), else the first (latest-year) row.
  const up = (r: Record<string, string>) =>
    (r["prop_address_full"] ?? "").trim().toUpperCase();
  const hit =
    addrRows.find((r) => up(r) === addr.street) ??
    addrRows.find(
      (r) =>
        up(r).startsWith(`${addr.number} `) &&
        !/\b(REAR|GARDEN|UNIT)\b/.test(up(r)),
    ) ??
    addrRows.find((r) => up(r).startsWith(`${addr.number} `)) ??
    addrRows[0]!;
  const pin = (hit["pin"] ?? hit["pin10"] ?? "").trim();
  if (!pin) return null;
  const pin14 = pin.padStart(14, "0");

  const propAddr = str(hit["prop_address_full"]);
  const mailAddr = [
    str(hit["mail_address_full"]),
    str(hit["mail_address_city_name"]),
  ]
    .filter(Boolean)
    .join(", ");

  const out: ParcelInfo = {
    source: "Cook County CCAO (open data)",
    pin: pin14,
    address: propAddr,
    city: str(hit["prop_address_city_name"]),
    zip: str(hit["prop_address_zipcode_1"]),
    ownerName: str(hit["owner_address_name"]) ?? str(hit["mail_address_name"]),
    mailingAddress: mailAddr || undefined,
    absenteeOwner:
      propAddr && hit["mail_address_full"]
        ? !`${hit["mail_address_full"]}`
            .toUpperCase()
            .startsWith(propAddr.toUpperCase())
        : undefined,
    schoolDistricts: [],
    sales: [],
  };

  // 2) building characteristics
  try {
    const c = (
      await q(D.chars, `pin='${sqlEscape(pin14)}'`, "year DESC")
    )[0] as Record<string, unknown> | undefined;
    if (c) {
      out.yearBuilt = int(c["char_yrblt"]);
      out.buildingSqft = int(c["char_bldg_sf"]);
      out.beds = int(c["char_beds"]);
      out.fullBaths = int(c["char_fbath"]);
      out.halfBaths = int(c["char_hbath"]);
      out.rooms = int(c["char_rooms"]);
      out.exteriorWall = str(c["char_ext_wall"]);
      out.airConditioning = str(c["char_air"]);
      out.basement = str(c["char_bsmt"]);
      out.garage = str(c["char_gar1_att"]);
      const lotSf = int(c["char_land_sf"]);
      if (lotSf) {
        out.lotSqft = lotSf;
        out.lotAcres = +(lotSf / 43_560).toFixed(3);
      }
      out.propertyClass = classLabel(str(c["class"]));
    }
  } catch {
    /* best-effort */
  }

  // 3) sale history
  try {
    const rows = (await q(
      D.sales,
      `pin='${sqlEscape(pin14)}'`,
      "sale_date DESC",
      6,
    )) as Record<string, unknown>[];
    out.sales = rows.map<SaleRecord>((r) => ({
      date: str(r["sale_date"])?.slice(0, 10),
      price: num(r["sale_price"]),
      deedType: str(r["deed_type"]),
      seller: str(r["seller_name"]),
      buyer: str(r["buyer_name"]),
      docNo: str(r["doc_no"]),
    }));
  } catch {
    /* best-effort */
  }

  // 4) universe: township + districts + flood
  try {
    const u = (await q(D.univ, `pin='${sqlEscape(pin14)}'`, "year DESC"))[0] as
      | Record<string, unknown>
      | undefined;
    if (u) {
      out.township = str(u["township_name"]);
      out.municipality = str(u["cook_municipality_name"]);
      out.parkDistrict = str(u["tax_park_district_name"]);
      out.libraryDistrict = str(u["tax_library_district_name"]);
      out.fireDistrict = str(u["tax_fire_protection_district_name"]);
      out.communityCollege = str(u["tax_community_college_district_name"]);
      out.schoolDistricts = [
        str(u["tax_school_elementary_district_name"]),
        str(u["tax_school_secondary_district_name"]),
        str(u["tax_school_unified_district_name"]),
      ].filter((s): s is string => !!s);
      const flood = str(u["env_flood_fema_sfha"]);
      if (flood) out.floodZone = `FEMA SFHA: ${flood}`;
      if (!out.propertyClass) out.propertyClass = classLabel(str(u["class"]));
    }
  } catch {
    /* best-effort */
  }

  // 5) assessed value — latest year that actually has a value (the current
  // year is often null until the Board of Review acts). board > certified > mailed.
  try {
    const rows = (await q(
      D.values,
      `pin='${sqlEscape(pin14)}'`,
      "year DESC",
      6,
    )) as Record<string, unknown>[];
    for (const v of rows) {
      const av =
        num(v["board_tot"]) ?? num(v["certified_tot"]) ?? num(v["mailed_tot"]);
      if (av != null) {
        out.assessedValue = av;
        out.taxYear = int(v["year"]);
        break;
      }
    }
  } catch {
    /* best-effort */
  }

  return out;
}
