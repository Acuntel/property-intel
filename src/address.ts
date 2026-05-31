// Pure address-parsing helpers. No I/O — unit tested.
import type { ParsedAddress } from "./types.js";

const STREET_SUFFIXES = new Set([
  "ST",
  "STREET",
  "RD",
  "ROAD",
  "AVE",
  "AVENUE",
  "DR",
  "DRIVE",
  "LN",
  "LANE",
  "CT",
  "COURT",
  "BLVD",
  "BOULEVARD",
  "PL",
  "PLACE",
  "WAY",
  "TER",
  "TERRACE",
  "CIR",
  "CIRCLE",
  "PKWY",
  "PARKWAY",
  "TRL",
  "TRAIL",
  "HWY",
  "HIGHWAY",
]);

const DIRECTIONALS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

// Parse "620 Rodenburg Rd, Roselle, IL 60172" (or Census "..., IL, 60172") into parts.
export function parseAddress(raw: string): ParsedAddress {
  const clean = raw.replace(/\s+/g, " ").trim();
  // Split on commas first; Census uses ", " between every component.
  const parts = clean
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  let street = "";
  let city = "";
  let state = "";
  let zip = "";

  if (parts.length >= 3) {
    street = parts[0] ?? "";
    city = parts[1] ?? "";
    // remaining parts may be "IL 60172" or "IL", "60172"
    const tail = parts.slice(2).join(" ");
    const m = tail.match(/([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?/);
    if (m) {
      state = (m[1] ?? "").toUpperCase();
      zip = m[2] ?? "";
    }
  } else {
    // No commas — best-effort: pull trailing zip + 2-letter state.
    const zm = clean.match(/(\d{5}(?:-\d{4})?)\s*$/);
    if (zm) zip = zm[1] ?? "";
    const sm = clean.match(/\b([A-Za-z]{2})\b\s+\d{5}/);
    if (sm) state = (sm[1] ?? "").toUpperCase();
    street = clean;
  }

  const upStreet = street.toUpperCase();
  const tokens = upStreet.split(" ").filter(Boolean);
  const number = /^\d/.test(tokens[0] ?? "") ? (tokens[0] ?? "") : "";

  // streetBase = the core name word(s), skipping leading number + directional and
  // trailing suffix. Used for a forgiving LIKE match against county data
  // (handles "RD" vs "ROAD", trailing unit, etc.).
  const nameTokens = tokens.slice(number ? 1 : 0);
  while (nameTokens.length > 1 && DIRECTIONALS.has(nameTokens[0] ?? "")) {
    nameTokens.shift();
  }
  while (
    nameTokens.length > 1 &&
    STREET_SUFFIXES.has(nameTokens[nameTokens.length - 1] ?? "")
  ) {
    nameTokens.pop();
  }
  const streetBase = nameTokens.join(" ");

  return {
    number,
    street: upStreet.replace(/\s+/g, " ").trim(),
    streetBase,
    city: city.toUpperCase(),
    state: state || "IL",
    zip,
    oneLine: clean,
  };
}

// SQL-LIKE-escape a value for an ArcGIS/Socrata where clause (single quotes).
export function sqlEscape(v: string): string {
  return v.replace(/'/g, "''");
}
