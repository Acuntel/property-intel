// Batch a whole city of DuPage parcels in one shot. Pulls the parcel layer
// directly (one query, not 100 geocodes), maps each row to a PropertyRecord,
// and derives township per unique PIN prefix (a couple of Census calls total).
import {
  queryDuPage,
  queryDuPageAll,
  mapDuPageFeature,
} from "./county/dupage.js";
import { geocode } from "./geocode.js";
import { sqlEscape } from "./address.js";
import type { GeoInfo, ParcelInfo, PropertyRecord } from "./types.js";

const clean = (v: unknown): string => String(v ?? "").trim();
// a usable residential record: real house-numbered street + a real value
const hasStreetNumber = (a: Record<string, unknown>) =>
  /^\d/.test(clean(a["PROPADDRL1"]));

function toRecord(p: ParcelInfo, township: string): PropertyRecord {
  const geo: GeoInfo = {
    matchedAddress: `${p.address ?? ""}, ${p.city ?? ""}, IL ${p.zip ?? ""}`,
    lat: 0,
    lon: 0,
    county: "DuPage",
    countyFips: "17043",
    township,
    city: p.city ?? "",
    state: "IL",
    zip: p.zip ?? "",
  };
  const { source, township: _t, ...fields } = p;
  return {
    input: p.address ?? p.pin,
    address: p.address ?? "",
    city: geo.city,
    state: "IL",
    zip: geo.zip,
    county: "DuPage",
    township,
    pin: p.pin,
    schoolDistricts: [],
    sales: [],
    sources: { assessor: source },
    warnings: [],
    fetchedAt: new Date().toISOString(),
    ...Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    ),
  } as PropertyRecord;
}

export async function batchDuPageCity(
  city: string,
  count: number,
  onStatus?: (msg: string) => void,
): Promise<PropertyRecord[]> {
  const where =
    `PROPCITY LIKE '${sqlEscape(city.toUpperCase())}%' ` +
    `AND REA017_PROP_CLASS='R' AND BILLVALUE>1000`;

  // 1) cheap full scan (PIN + address only) so we can sample across the WHOLE
  // city, not just the lowest-PIN block (Elmhurst spans Addison + York townships).
  onStatus?.(`Scanning all residential parcels in ${city}…`);
  const all = (await queryDuPageAll(where, "PIN,PROPADDRL1")).filter(
    hasStreetNumber,
  );
  if (!all.length) return [];

  let parcels;
  if (count >= all.length) {
    // ALL: fetch full attributes for every parcel via keyset pagination.
    onStatus?.(`Fetching full records for all ${all.length} parcels…`);
    const full = (await queryDuPageAll(where, "*")).filter(hasStreetNumber);
    parcels = full.map(mapDuPageFeature);
  } else {
    // SAMPLE: evenly pick `count` PINs across the sorted set for spread, then
    // fetch full attributes for just those (one query, <1000 ids).
    const stride = Math.max(1, Math.floor(all.length / count));
    const sampledPins: string[] = [];
    for (
      let i = 0;
      sampledPins.length < count && i * stride < all.length;
      i++
    ) {
      sampledPins.push(clean(all[i * stride]!["PIN"]));
    }
    onStatus?.(
      `Sampled ${sampledPins.length} of ${all.length} parcels; fetching full records…`,
    );
    const inList = sampledPins.map((p) => `'${sqlEscape(p)}'`).join(",");
    const full = await queryDuPage(`PIN IN (${inList})`, {
      limit: sampledPins.length,
    });
    const byPin = new Map(full.map((a) => [clean(a["PIN"]), a]));
    parcels = sampledPins
      .map((p) => byPin.get(p))
      .filter((a): a is Record<string, unknown> => !!a)
      .map(mapDuPageFeature);
  }

  // derive township once per unique 2-digit PIN prefix (DuPage encodes township there)
  const prefixes = [...new Set(parcels.map((p) => p.pin.slice(0, 2)))];
  const twpByPrefix = new Map<string, string>();
  onStatus?.(`Resolving townships for ${prefixes.length} PIN group(s)…`);
  for (const prefix of prefixes) {
    const rep = parcels.find((p) => p.pin.startsWith(prefix));
    if (!rep?.address) continue;
    try {
      const g = await geocode(
        `${rep.address}, ${rep.city ?? city}, IL ${rep.zip ?? ""}`,
      );
      if (g?.township) twpByPrefix.set(prefix, g.township);
    } catch {
      /* township stays blank for this group */
    }
  }

  return parcels.map((p) =>
    toRecord(p, twpByPrefix.get(p.pin.slice(0, 2)) ?? ""),
  );
}
