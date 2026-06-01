// Build a print-ready, organized HTML report from PropertyRecord(s). One page
// per property, grouped into sections. Empty fields and empty sections are
// omitted so the page shows exactly what public records returned.
import type { PropertyRecord, SaleRecord } from "./types.js";

const usd = (n?: number) =>
  n == null
    ? null
    : n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
const numf = (n?: number, unit = "") =>
  n == null ? null : `${n.toLocaleString("en-US")}${unit}`;

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

// 10-digit DuPage -> 02-08-205-015 ; 14-digit Cook -> 20-11-115-037-0000
function fmtPin(pin: string): string {
  const d = pin.replace(/\D/g, "");
  if (d.length === 10)
    return d.replace(/(\d{2})(\d{2})(\d{3})(\d{3})/, "$1-$2-$3-$4");
  if (d.length === 14)
    return d.replace(/(\d{2})(\d{2})(\d{3})(\d{3})(\d{4})/, "$1-$2-$3-$4-$5");
  return pin;
}

type Row = [string, string | number | null | undefined];

function section(title: string, tag: string, rows: Row[]): string {
  const live = rows.filter(([, v]) => v != null && String(v).trim() !== "");
  if (!live.length) return "";
  const body = live
    .map(
      ([l, v]) =>
        `<div class="f"><span class="l">${esc(l)}</span><span class="v">${esc(String(v))}</span></div>`,
    )
    .join("");
  return `<div class="sec"><h2>${esc(title)}${tag ? ` <span class="tag">${esc(tag)}</span>` : ""}</h2>${body}</div>`;
}

function salesTable(sales: SaleRecord[]): string {
  const rows = sales.filter((s) => s.date || s.price);
  if (!rows.length) return "";
  const trs = rows
    .map(
      (s) =>
        `<tr><td>${esc(s.date ?? "—")}</td><td class="r">${s.price != null ? esc(usd(s.price) ?? "—") : "—"}</td>` +
        `<td>${esc(s.deedType ?? "—")}</td><td>${esc(s.buyer ?? "—")}</td><td>${esc(s.seller ?? "—")}</td></tr>`,
    )
    .join("");
  return `<div class="sec wide"><h2>Sales History <span class="tag">recorder</span></h2>
    <table><thead><tr><th>Date</th><th class="r">Price</th><th>Deed</th><th>Buyer</th><th>Seller</th></tr></thead>
    <tbody>${trs}</tbody></table></div>`;
}

function card(r: PropertyRecord): string {
  const fullAddr = `${esc(r.address)}, ${esc(r.city)}, ${esc(r.state)} ${esc(r.zip)}`;
  const baths =
    r.fullBaths != null || r.halfBaths != null
      ? `${r.fullBaths ?? 0} full${r.halfBaths ? ` / ${r.halfBaths} half` : ""}`
      : null;

  const sections = [
    section("Identity & Legal", "assessor", [
      ["PIN / Parcel", r.pin ? fmtPin(r.pin) : null],
      ["Municipality", r.municipality],
      ["Township", r.township],
      ["Property class", r.propertyClass],
      ["Legal description", r.legalDescription],
    ]),
    section("Owner of Record", "assessor", [
      ["Owner", r.ownerName],
      ["Mailing address", r.mailingAddress],
      [
        "Absentee owner",
        r.absenteeOwner == null
          ? null
          : r.absenteeOwner
            ? "Yes — mailing ≠ property"
            : "No — owner-occupied",
      ],
    ]),
    section("Assessment & Tax", "assessor", [
      ["Assessed value", usd(r.assessedValue)],
      ["Fair cash value (total)", usd(r.fcvTotal)],
      ["  — land", usd(r.fcvLand)],
      ["  — improvement", usd(r.fcvImprovement)],
      ["Tax rate", r.taxRate != null ? `${r.taxRate}%` : null],
      ["Property tax", usd(r.taxAmount)],
      ["Exemptions", r.exemptions],
      ["Tax year", r.taxYear],
    ]),
    section("Building", "assessor", [
      ["Year built", r.yearBuilt],
      ["Building area", numf(r.buildingSqft, " sqft")],
      ["Beds", r.beds],
      ["Baths", baths],
      ["Rooms", r.rooms],
      ["Exterior", r.exteriorWall],
      ["A/C", r.airConditioning],
      ["Basement", r.basement],
      ["Garage", r.garage],
      ["Type", r.propertyType],
    ]),
    section("Lot", "assessor", [
      [
        "Lot size",
        r.lotSqft
          ? `${numf(r.lotSqft, " sqft")}${r.lotAcres ? ` (${r.lotAcres} ac)` : ""}`
          : null,
      ],
    ]),
    section("Taxing Districts", "assessor", [
      [
        "Schools",
        r.schoolDistricts.length ? r.schoolDistricts.join(" · ") : null,
      ],
      ["Community college", r.communityCollege],
      ["Park", r.parkDistrict],
      ["Library", r.libraryDistrict],
      ["Fire", r.fireDistrict],
      ["Flood", r.floodZone],
    ]),
  ].join("");

  const warnings = r.warnings.length
    ? `<div class="warn">${r.warnings.map((w) => `⚠ ${esc(w)}`).join("<br>")}</div>`
    : "";
  const provenance = Object.entries(r.sources)
    .map(([k, v]) => `${esc(k)}: ${esc(v)}`)
    .join(" · ");

  return `<section class="page">
    <header>
      <div class="brand">PROPERTY INTEL</div>
      <h1>${fullAddr}</h1>
      <div class="sub">${esc(r.county)} County · ${esc(r.township || "—")} Township${r.pin ? ` · PIN ${esc(fmtPin(r.pin))}` : ""}</div>
    </header>
    <div class="grid">${sections}</div>
    ${salesTable(r.sales)}
    ${warnings}
    <footer><span>Public records — ${provenance}</span><span>Generated ${esc(r.fetchedAt)}</span></footer>
  </section>`;
}

export function reportToHtml(records: PropertyRecord[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font: 12.5px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #16202c; }
    .page { padding: 40px 46px; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .brand { font-size: 11px; letter-spacing: 3px; color: #8a97a6; font-weight: 700; }
    header { border-bottom: 3px solid #16202c; padding-bottom: 14px; margin-bottom: 20px; }
    h1 { font-size: 25px; margin-top: 6px; letter-spacing: -0.5px; }
    .sub { color: #5b6876; margin-top: 6px; }
    .grid { columns: 2; column-gap: 38px; }
    .sec { break-inside: avoid; margin-bottom: 18px; }
    .sec.wide { column-span: all; margin-top: 6px; }
    h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1.4px; color: #2f3e4f;
         border-bottom: 1px solid #e2e8ee; padding-bottom: 7px; margin-bottom: 9px; }
    .tag { font-size: 8.5px; padding: 2px 7px; border-radius: 10px; letter-spacing: 0.5px;
           background: #103a2a; color: #aef0c9; font-weight: 600; }
    .f { display: flex; justify-content: space-between; gap: 14px; padding: 5px 0; border-bottom: 1px dotted #e8edf2; }
    .l { color: #6b7785; white-space: pre; }
    .v { font-weight: 600; text-align: right; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eef1f4; }
    th { color: #6b7785; font-weight: 600; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.5px; }
    td.r, th.r { text-align: right; }
    .warn { margin-top: 16px; padding: 11px 13px; background: #fff7ed; border: 1px solid #f6c98b;
            border-radius: 8px; color: #9a5b15; font-size: 11px; }
    footer { margin-top: 26px; padding-top: 11px; border-top: 1px solid #e2e8ee;
             display: flex; justify-content: space-between; font-size: 10px; color: #9aa6b3; }
  </style></head><body>${records.map(card).join("")}</body></html>`;
}
