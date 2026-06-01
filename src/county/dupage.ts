// DuPage County parcel adapter — public ArcGIS REST FeatureServer, no auth.
// Pulls the full assessor record: owner + mailing (absentee), assessment/tax,
// fair-cash valuation (land/improvement), legal description, lot, and the full
// set of taxing districts. DuPage's GIS does NOT publish building
// characteristics (beds/baths/sqft) or sale history — see the warning emitted.
import { fetchJson } from "../http.js";
import { sqlEscape } from "../address.js";
import type { ParcelInfo, ParsedAddress } from "../types.js";

const LAYER =
  "https://gis.dupageco.org/arcgis/rest/services/DuPage_County_IL/" +
  "ParcelsWithRealEstateCC/MapServer/0/query";

interface ArcGisResp {
  features?: Array<{ attributes: Record<string, unknown> }>;
  error?: { message?: string };
}

const clean = (v: unknown): string => String(v ?? "").trim();
const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== "" ? n : undefined;
};

const CLASS_LABELS: Record<string, string> = {
  R: "Residential",
  C: "Commercial",
  I: "Industrial",
  F: "Farm",
  A: "Apartment",
  E: "Exempt",
};

export async function lookupDuPage(
  addr: ParsedAddress,
): Promise<ParcelInfo | null> {
  const namePrefix = [addr.number, addr.streetBase]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!namePrefix) return null;

  const where =
    `PROPSTNAME LIKE '${sqlEscape(namePrefix)}%'` +
    (addr.city ? ` AND PROPCITY LIKE '${sqlEscape(addr.city)}%'` : "");

  const url =
    `${LAYER}?where=${encodeURIComponent(where)}` +
    `&outFields=*&returnGeometry=false&resultRecordCount=10&f=json`;

  const data = await fetchJson<ArcGisResp>(url, { cache: true });
  if (data.error) throw new Error(`DuPage ArcGIS: ${data.error.message}`);

  const feats = data.features ?? [];
  if (!feats.length) return null;

  const exact = feats.find((f) =>
    clean(f.attributes["PROPSTNAME"]).startsWith(`${addr.number} `),
  );
  const a = (exact ?? feats[0])!.attributes;

  const legal = Array.from({ length: 9 }, (_, i) =>
    clean(a[`LEGALDES${i + 1}`]),
  )
    .filter(Boolean)
    .join(" ");
  const propAddr = clean(a["PROPADDRL1"]);
  const mailAddr = [clean(a["BILLADDRL1"]), clean(a["BILLADDRL2"])]
    .filter(Boolean)
    .join(", ");
  const cls = clean(a["REA017_PROP_CLASS"]);
  const acres = num(a["ACREAGE"]);
  const exemptCode = clean(a["EXEMPTCODE"]);

  const schools = [
    clean(a["GRADESCHOOLDISTRICT"]),
    clean(a["UNITSCHOOLDISTRICT"]),
    clean(a["HIGHSCHOOLDISTRICT"]),
  ].filter(Boolean);

  return {
    source: "DuPage County ArcGIS",
    pin: clean(a["PIN"]),
    address: propAddr || undefined,
    city: clean(a["PROPCITY"]) || undefined,
    zip: clean(a["PROPZIP"]) || undefined,
    municipality: clean(a["MUNICIPALITY"]) || undefined,
    legalDescription: legal || undefined,
    propertyClass: cls
      ? `${cls}${CLASS_LABELS[cls] ? ` (${CLASS_LABELS[cls]})` : ""}`
      : undefined,
    ownerName: clean(a["BILLNAME"]) || undefined,
    mailingAddress: mailAddr || undefined,
    absenteeOwner:
      propAddr && mailAddr
        ? !clean(a["BILLADDRL1"])
            .toUpperCase()
            .startsWith(propAddr.toUpperCase())
        : undefined,
    assessedValue: num(a["BILLVALUE"]),
    fcvLand: num(a["REA017_FCV_LAND"]),
    fcvImprovement: num(a["REA017_FCV_IMP"]),
    fcvTotal: num(a["REA017_FCV_TOTAL"]),
    taxRate: num(a["TAXRATE"]),
    taxAmount: num(a["TAXAMOUNT"]),
    exemptions:
      exemptCode && exemptCode !== "0" ? `Code ${exemptCode}` : undefined,
    lotAcres: acres,
    lotSqft: acres != null ? Math.round(acres * 43_560) : undefined,
    schoolDistricts: schools,
    parkDistrict: clean(a["PARKDISTRICT"]) || undefined,
    libraryDistrict: clean(a["LIBRARYDISTRICT"]) || undefined,
    fireDistrict: clean(a["FIREPROTECTIONDISTRICT"]) || undefined,
    communityCollege: clean(a["COMMUNITYCOLLEGEDISTRICT"]) || undefined,
  };
}
