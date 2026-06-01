// Batch report: a paginated table of many properties with a summary header.
// Used for city-wide pulls (e.g. "100 properties in Elmhurst").
import type { PropertyRecord } from "./types.js";

const usd0 = (n?: number) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

function median(nums: number[]): number | undefined {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return undefined;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

function fmtPin(pin: string): string {
  const d = pin.replace(/\D/g, "");
  if (d.length === 10)
    return d.replace(/(\d{2})(\d{2})(\d{3})(\d{3})/, "$1-$2-$3-$4");
  if (d.length === 14)
    return d.replace(/(\d{2})(\d{2})(\d{3})(\d{3})(\d{4})/, "$1-$2-$3-$4-$5");
  return pin;
}

export function reportTableToHtml(
  records: PropertyRecord[],
  meta: { title: string; subtitle?: string },
): string {
  const taxes = records
    .map((r) => r.taxAmount)
    .filter((n): n is number => n != null);
  const assessed = records
    .map((r) => r.assessedValue)
    .filter((n): n is number => n != null);
  const fcv = records
    .map((r) => r.fcvTotal)
    .filter((n): n is number => n != null);
  const absentee = records.filter((r) => r.absenteeOwner).length;
  const totalTax = taxes.reduce((s, n) => s + n, 0);

  const stats = [
    ["Properties", String(records.length)],
    ["Median assessed", usd0(median(assessed))],
    ["Median fair-cash", usd0(median(fcv))],
    ["Median tax", usd0(median(taxes))],
    ["Total tax billed", usd0(totalTax)],
    [
      "Absentee-owned",
      `${absentee} (${Math.round((absentee / records.length) * 100)}%)`,
    ],
  ]
    .map(
      ([l, v]) =>
        `<div class="stat"><span class="sl">${esc(l!)}</span><span class="sv">${esc(v!)}</span></div>`,
    )
    .join("");

  const rows = records
    .map((r, i) => {
      const baths =
        r.fullBaths != null
          ? `${r.fullBaths}${r.halfBaths ? `+${r.halfBaths}h` : ""}`
          : "—";
      const bbs =
        r.beds != null || r.buildingSqft != null
          ? `${r.beds ?? "—"} / ${baths} / ${r.buildingSqft ? r.buildingSqft.toLocaleString() : "—"}`
          : "—";
      return `<tr>
        <td class="i">${i + 1}</td>
        <td>${esc(r.address)}${r.zip ? `<span class="z"> ${esc(r.zip)}</span>` : ""}</td>
        <td class="mono">${esc(r.pin ? fmtPin(r.pin) : "—")}</td>
        <td>${esc(r.ownerName ?? "—")}${r.absenteeOwner ? ' <span class="abs">abs</span>' : ""}</td>
        <td class="r">${r.lotSqft ? r.lotSqft.toLocaleString() : "—"}</td>
        <td class="c">${esc(bbs)}</td>
        <td class="r">${usd0(r.assessedValue)}</td>
        <td class="r">${usd0(r.fcvTotal)}</td>
        <td class="r">${usd0(r.taxAmount)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font: 10px/1.4 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #16202c; padding: 28px 30px; }
    .brand { font-size: 10px; letter-spacing: 3px; color: #8a97a6; font-weight: 700; }
    h1 { font-size: 21px; margin-top: 4px; letter-spacing: -0.4px; }
    .sub { color: #5b6876; margin-top: 4px; font-size: 11px; }
    .stats { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 14px;
             border-top: 3px solid #16202c; border-bottom: 1px solid #e2e8ee; padding: 12px 0; }
    .stat { flex: 1; min-width: 110px; }
    .sl { display: block; color: #6b7785; font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; }
    .sv { display: block; font-size: 15px; font-weight: 700; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th { text-align: left; padding: 6px 6px; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.5px;
         color: #2f3e4f; border-bottom: 2px solid #16202c; }
    td { padding: 5px 6px; border-bottom: 1px solid #eef1f4; vertical-align: top; }
    tr { break-inside: avoid; }
    td.r, th.r { text-align: right; } td.c, th.c { text-align: center; }
    td.i { color: #9aa6b3; } td.mono { font-family: "SF Mono", Menlo, monospace; font-size: 9px; }
    .z { color: #9aa6b3; } .abs { background: #fff0e6; color: #b4631c; padding: 0 4px; border-radius: 3px; font-size: 8px; }
    footer { margin-top: 14px; font-size: 9px; color: #9aa6b3; display: flex; justify-content: space-between; }
  </style></head><body>
    <div class="brand">PROPERTY INTEL</div>
    <h1>${esc(meta.title)}</h1>
    ${meta.subtitle ? `<div class="sub">${esc(meta.subtitle)}</div>` : ""}
    <div class="stats">${stats}</div>
    <table>
      <thead><tr>
        <th class="i">#</th><th>Address</th><th>PIN</th><th>Owner</th>
        <th class="r">Lot sqft</th><th class="c">Bd / Ba / Sqft</th>
        <th class="r">Assessed</th><th class="r">Fair-cash</th><th class="r">Tax</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <footer><span>Source: DuPage County / Cook County CCAO public records</span><span>${esc(records[0]?.fetchedAt ?? "")}</span></footer>
  </body></html>`;
}
