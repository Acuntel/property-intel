// Build a print-ready HTML property report from PropertyRecord(s).
// One page per property. Authoritative (county) fields are visually separated
// from supplemental (listing) fields, with a provenance footer.
import type { PropertyRecord } from "./types.js";

const usd = (n?: number) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
const numf = (n?: number) => (n == null ? "—" : n.toLocaleString("en-US"));
const txt = (s?: unknown) => {
  const v = s == null ? "" : String(s);
  return v.trim() ? esc(v) : "—";
};

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

function field(label: string, value: string): string {
  return `<div class="f"><span class="l">${label}</span><span class="v">${value}</span></div>`;
}

function card(record: PropertyRecord): string {
  const r = record;
  const fullAddr = `${esc(r.address)}, ${esc(r.city)}, ${esc(r.state)} ${esc(r.zip)}`;
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
      <div class="sub">${esc(r.county)} County · ${txt(r.township)} Township${r.pin ? ` · PIN ${esc(r.pin)}` : ""}</div>
    </header>

    <div class="grid">
      <div class="col">
        <h2>Assessor Record <span class="tag auth">authoritative</span></h2>
        ${field("PIN / Parcel", txt(r.pin))}
        ${field("Owner of record", txt(r.ownerName))}
        ${field("Township", txt(r.township))}
        ${field("Lot size", r.lotSqft ? `${numf(r.lotSqft)} sqft (${r.lotAcres ?? "—"} ac)` : "—")}
        ${field("Assessed value", usd(r.assessedValue))}
        ${field("Property tax", usd(r.taxAmount) + (r.taxYear ? ` (${r.taxYear})` : ""))}
      </div>
      <div class="col">
        <h2>Listing <span class="tag supp">supplemental</span></h2>
        ${field("List price", usd(r.price))}
        ${field("Beds / Baths", `${numf(r.beds)} / ${numf(r.baths)}`)}
        ${field("Living area", r.sqft ? `${numf(r.sqft)} sqft` : "—")}
        ${field("$ / sqft", usd(r.pricePerSqft))}
        ${field("Year built", txt(r.yearBuilt != null ? String(r.yearBuilt) : undefined))}
        ${field("Type / Status", `${txt(r.propertyType)} / ${txt(r.status)}`)}
        ${field("MLS #", txt(r.mlsNumber))}
        ${field("Days on market", txt(r.daysOnMarket != null ? String(r.daysOnMarket) : undefined))}
      </div>
    </div>

    ${r.description ? `<div class="desc"><h2>Description</h2><p>${esc(r.description)}</p></div>` : ""}
    ${r.listingUrl ? `<div class="link">Listing: ${esc(r.listingUrl)}</div>` : ""}
    ${warnings}
    <footer>
      <span>Sources — ${provenance}</span>
      <span>Generated ${esc(r.fetchedAt)}</span>
    </footer>
  </section>`;
}

export function reportToHtml(records: PropertyRecord[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font: 13px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #16202c; }
    .page { padding: 40px 48px; page-break-after: always; min-height: 100vh; }
    .page:last-child { page-break-after: auto; }
    .brand { font-size: 11px; letter-spacing: 3px; color: #8a97a6; font-weight: 700; }
    header { border-bottom: 3px solid #16202c; padding-bottom: 14px; margin-bottom: 22px; }
    h1 { font-size: 26px; margin-top: 6px; letter-spacing: -0.5px; }
    .sub { color: #5b6876; margin-top: 6px; font-size: 13px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #2f3e4f;
         border-bottom: 1px solid #e2e8ee; padding-bottom: 8px; margin-bottom: 12px; }
    .tag { font-size: 9px; padding: 2px 7px; border-radius: 10px; letter-spacing: 0.5px; margin-left: 6px; vertical-align: middle; }
    .auth { background: #103a2a; color: #aef0c9; }
    .supp { background: #eef1f4; color: #6b7785; }
    .f { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px dotted #e8edf2; }
    .l { color: #6b7785; }
    .v { font-weight: 600; text-align: right; }
    .desc { margin-top: 26px; } .desc p { color: #3d4956; }
    .link { margin-top: 18px; font-size: 11px; color: #4a90d9; word-break: break-all; }
    .warn { margin-top: 20px; padding: 12px 14px; background: #fff7ed; border: 1px solid #f6c98b;
            border-radius: 8px; color: #9a5b15; font-size: 11px; }
    footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e2e8ee;
             display: flex; justify-content: space-between; font-size: 10px; color: #9aa6b3; }
  </style></head><body>${records.map(card).join("")}</body></html>`;
}
