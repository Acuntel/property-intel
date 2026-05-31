// JSON + CSV emitters for PropertyRecord(s).
import type { PropertyRecord } from "./types.js";

const COLUMNS: (keyof PropertyRecord)[] = [
  "address",
  "city",
  "state",
  "zip",
  "county",
  "township",
  "pin",
  "ownerName",
  "price",
  "beds",
  "baths",
  "sqft",
  "lotAcres",
  "lotSqft",
  "yearBuilt",
  "propertyType",
  "status",
  "mlsNumber",
  "daysOnMarket",
  "pricePerSqft",
  "assessedValue",
  "taxAmount",
  "taxYear",
  "listingUrl",
  "lat",
  "lon",
  "fetchedAt",
];

function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function recordsToCsv(records: PropertyRecord[]): string {
  const header = COLUMNS.join(",");
  const rows = records.map((r) => COLUMNS.map((c) => cell(r[c])).join(","));
  return [header, ...rows].join("\n") + "\n";
}

export function recordsToJson(records: PropertyRecord[]): string {
  return JSON.stringify(records, null, 2) + "\n";
}
