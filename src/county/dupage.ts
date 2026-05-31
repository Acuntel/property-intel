// DuPage County parcel adapter — public ArcGIS REST FeatureServer, no auth.
// Verified live: a single query returns PIN + lot acreage + assessed value +
// current tax + owner name. Most Chicago collar counties run the same Esri
// stack, so this adapter is the template for Kane/Lake/Will/McHenry.
import { fetchJson } from "../http.js";
import { sqlEscape } from "../address.js";
import type { ParcelInfo, ParsedAddress } from "../types.js";

const LAYER =
  "https://gis.dupageco.org/arcgis/rest/services/DuPage_County_IL/" +
  "ParcelsWithRealEstateCC/MapServer/0/query";

const OUT_FIELDS = [
  "PIN",
  "PROPSTNUM",
  "PROPSTNAME",
  "PROPCITY",
  "ACREAGE",
  "BILLVALUE",
  "TAXAMOUNT",
  "BILLNAME",
];

interface ArcGisResp {
  features?: Array<{ attributes: Record<string, unknown> }>;
  error?: { message?: string };
}

function clean(v: unknown): string {
  return String(v ?? "").trim();
}
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function lookupDuPage(
  addr: ParsedAddress,
): Promise<ParcelInfo | null> {
  // PROPSTNAME embeds the house number, e.g. "620 RODENBURG RD". Match on
  // number + street base so "RD" vs "ROAD" and trailing units don't matter.
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
    `&outFields=${encodeURIComponent(OUT_FIELDS.join(","))}` +
    `&returnGeometry=false&resultRecordCount=5&f=json`;

  const data = await fetchJson<ArcGisResp>(url, { cache: true });
  if (data.error) throw new Error(`DuPage ArcGIS: ${data.error.message}`);

  const feats = data.features ?? [];
  if (!feats.length) return null;

  // Prefer an exact house-number match within PROPSTNAME if multiple come back.
  const exact = feats.find((f) =>
    clean(f.attributes["PROPSTNAME"]).startsWith(`${addr.number} `),
  );
  const a = (exact ?? feats[0])!.attributes;

  const acres = num(a["ACREAGE"]);
  return {
    pin: clean(a["PIN"]),
    ownerName: clean(a["BILLNAME"]) || undefined,
    propertyAddress: clean(a["PROPSTNAME"]) || undefined,
    city: clean(a["PROPCITY"]) || undefined,
    lotAcres: acres,
    lotSqft: acres != null ? Math.round(acres * 43_560) : undefined,
    assessedValue: num(a["BILLVALUE"]),
    taxAmount: num(a["TAXAMOUNT"]),
    source: "DuPage County ArcGIS",
  };
}
