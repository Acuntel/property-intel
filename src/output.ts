// JSON + CSV emitters for PropertyRecord(s).
import type { PropertyRecord } from "./types.js";

const COLUMNS: { key: string; get: (r: PropertyRecord) => unknown }[] = [
  { key: "address", get: (r) => r.address },
  { key: "city", get: (r) => r.city },
  { key: "state", get: (r) => r.state },
  { key: "zip", get: (r) => r.zip },
  { key: "county", get: (r) => r.county },
  { key: "township", get: (r) => r.township },
  { key: "municipality", get: (r) => r.municipality },
  { key: "pin", get: (r) => r.pin },
  { key: "propertyClass", get: (r) => r.propertyClass },
  { key: "ownerName", get: (r) => r.ownerName },
  { key: "mailingAddress", get: (r) => r.mailingAddress },
  { key: "absenteeOwner", get: (r) => r.absenteeOwner },
  { key: "assessedValue", get: (r) => r.assessedValue },
  { key: "fcvTotal", get: (r) => r.fcvTotal },
  { key: "taxRate", get: (r) => r.taxRate },
  { key: "taxAmount", get: (r) => r.taxAmount },
  { key: "taxYear", get: (r) => r.taxYear },
  { key: "exemptions", get: (r) => r.exemptions },
  { key: "yearBuilt", get: (r) => r.yearBuilt },
  { key: "buildingSqft", get: (r) => r.buildingSqft },
  { key: "beds", get: (r) => r.beds },
  { key: "fullBaths", get: (r) => r.fullBaths },
  { key: "halfBaths", get: (r) => r.halfBaths },
  { key: "lotSqft", get: (r) => r.lotSqft },
  { key: "lotAcres", get: (r) => r.lotAcres },
  { key: "schoolDistricts", get: (r) => r.schoolDistricts.join("; ") },
  { key: "lastSaleDate", get: (r) => r.sales[0]?.date },
  { key: "lastSalePrice", get: (r) => r.sales[0]?.price },
  { key: "legalDescription", get: (r) => r.legalDescription },
  { key: "lat", get: (r) => r.lat },
  { key: "lon", get: (r) => r.lon },
  { key: "fetchedAt", get: (r) => r.fetchedAt },
];

function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function recordsToCsv(records: PropertyRecord[]): string {
  const header = COLUMNS.map((c) => c.key).join(",");
  const rows = records.map((r) => COLUMNS.map((c) => cell(c.get(r))).join(","));
  return [header, ...rows].join("\n") + "\n";
}

export function recordsToJson(records: PropertyRecord[]): string {
  return JSON.stringify(records, null, 2) + "\n";
}
