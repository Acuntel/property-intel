#!/usr/bin/env node
// property-intel CLI — public-records property lookup.
//   pull  <address|redfin-url|zillow-url>   one property -> detailed report
//   batch <city>                            many DuPage properties -> table report
//
// Options (both):  --out <basename>  --json --csv --pdf  (default: all three)
//   pull only:     --address "<addr>"  --print
//   batch only:    --count <n>   (default 100)
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pull } from "./pull.js";
import { batchDuPageCity } from "./batch.js";
import { forSaleCity } from "./forsale.js";
import { recordsToCsv, recordsToJson } from "./output.js";
import { writePdf, renderHtmlToPdf } from "./pdf.js";
import { reportTableToHtml } from "./report-table.js";
import type { PropertyRecord } from "./types.js";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);
const dollars = (n?: number) => (n != null ? `$${n.toLocaleString()}` : "—");

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "property"
  );
}

// Write the requested formats; pdfHtml overrides the per-record PDF (used by batch).
async function writeOutputs(
  records: PropertyRecord[],
  base: string,
  pdfHtml?: string,
): Promise<string[]> {
  const anySpecific = has("json") || has("csv") || has("pdf");
  const outDir = join(process.cwd(), "output");
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];

  if (!anySpecific || has("json")) {
    const p = join(outDir, `${base}.json`);
    writeFileSync(p, recordsToJson(records));
    written.push(p);
  }
  if (!anySpecific || has("csv")) {
    const p = join(outDir, `${base}.csv`);
    writeFileSync(p, recordsToCsv(records));
    written.push(p);
  }
  if (!anySpecific || has("pdf")) {
    const p = join(outDir, `${base}.pdf`);
    if (pdfHtml) await renderHtmlToPdf(pdfHtml, p, { landscape: true });
    else await writePdf(records, p);
    written.push(p);
  }
  return written;
}

async function runPull(input: string): Promise<void> {
  process.stdout.write(`→ Looking up ${input}\n`);
  const r = await pull(input, { address: flag("address") });
  const written = await writeOutputs(
    [r],
    flag("out") ?? slugify(`${r.address}-${r.city}`),
  );

  const lastSale = r.sales[0];
  process.stdout.write(
    `\n${r.address}, ${r.city} ${r.state} ${r.zip}\n` +
      `  County/Township : ${r.county} / ${r.township}\n` +
      `  PIN             : ${r.pin || "—"}\n` +
      `  Owner           : ${r.ownerName ?? "—"}${r.absenteeOwner ? "  (absentee)" : ""}\n` +
      `  Class / Year    : ${r.propertyClass ?? "—"} / ${r.yearBuilt ?? "—"}\n` +
      `  Beds/Baths/Sqft : ${r.beds ?? "—"} / ${r.fullBaths ?? "—"}${r.halfBaths ? `+${r.halfBaths}h` : ""} / ${r.buildingSqft ?? "—"}\n` +
      `  Lot             : ${r.lotSqft ? `${r.lotSqft.toLocaleString()} sqft` : "—"}\n` +
      `  Assessed value  : ${dollars(r.assessedValue)}\n` +
      `  Property tax    : ${dollars(r.taxAmount)}${r.taxRate ? ` @ ${r.taxRate}%` : ""}\n` +
      `  Last sale       : ${lastSale ? `${lastSale.date ?? "?"} — ${dollars(lastSale.price)}` : "—"}\n`,
  );
  if (r.warnings.length)
    process.stdout.write(
      `  Notes:\n${r.warnings.map((w) => `    ⚠ ${w}`).join("\n")}\n`,
    );
  if (has("print")) process.stdout.write(`\n${recordsToJson([r])}`);
  process.stdout.write(
    `\nWrote:\n${written.map((w) => `  ${w}`).join("\n")}\n`,
  );
}

async function runBatch(city: string): Promise<void> {
  const count = has("all") ? Infinity : Number(flag("count") ?? 100) || 100;
  process.stdout.write(
    `→ Batch: ${count === Infinity ? "ALL" : `up to ${count}`} properties in ${city}\n`,
  );
  const records = await batchDuPageCity(city, count, (m) =>
    process.stdout.write(`  ${m}\n`),
  );
  if (!records.length) {
    process.stderr.write(`No DuPage parcels found for "${city}".\n`);
    process.exitCode = 1;
    return;
  }

  const title = `${city} — DuPage County Property Report`;
  const subtitle = `${records.length} residential parcels · public records (DuPage County Assessor)`;
  const html = reportTableToHtml(records, { title, subtitle });
  const written = await writeOutputs(
    records,
    flag("out") ?? `${slugify(city)}-${records.length}`,
    html,
  );

  const tax = records
    .map((r) => r.taxAmount)
    .filter((n): n is number => n != null);
  const absentee = records.filter((r) => r.absenteeOwner).length;
  const totalTax = tax.reduce((s, n) => s + n, 0);
  process.stdout.write(
    `\nPulled ${records.length} properties in ${city}\n` +
      `  Total tax billed : ${dollars(Math.round(totalTax))}\n` +
      `  Absentee-owned   : ${absentee} (${Math.round((absentee / records.length) * 100)}%)\n` +
      `  Townships        : ${[...new Set(records.map((r) => r.township).filter(Boolean))].join(", ") || "—"}\n` +
      `\nWrote:\n${written.map((w) => `  ${w}`).join("\n")}\n`,
  );
}

async function runForSale(city: string): Promise<void> {
  const count = has("all")
    ? Infinity
    : flag("count")
      ? Number(flag("count"))
      : Infinity;
  process.stdout.write(
    `→ For-sale: active listings in ${city} (Redfin) → joined to county records\n`,
  );
  const records = await forSaleCity(
    city,
    {
      count,
      regionId: flag("region") ? Number(flag("region")) : undefined,
      market: flag("market"),
    },
    (m) => process.stdout.write(`  ${m}\n`),
  );
  if (!records.length) {
    process.stderr.write(`No active listings found for "${city}".\n`);
    process.exitCode = 1;
    return;
  }

  const title = `${city} — Homes For Sale`;
  const subtitle = `${records.length} active listings · Redfin + ${records[0]?.county ?? "county"} County assessor records`;
  const html = reportTableToHtml(records, { title, subtitle });
  const written = await writeOutputs(
    records,
    flag("out") ?? `${slugify(city)}-forsale`,
    html,
  );

  const prices = records
    .map((r) => r.listPrice)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);
  const med = prices.length ? prices[Math.floor(prices.length / 2)] : undefined;
  const joined = records.filter((r) => r.pin).length;
  process.stdout.write(
    `\n${records.length} active for-sale listings in ${city}\n` +
      `  Median list price : ${dollars(med)}\n` +
      `  Joined to county  : ${joined}/${records.length} (PIN + tax + owner)\n` +
      `  Beds/baths/sqft   : from Redfin listing\n` +
      `\nWrote:\n${written.map((w) => `  ${w}`).join("\n")}\n`,
  );
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  if (cmd === "pull" && arg && !arg.startsWith("--")) return runPull(arg);
  if (cmd === "batch" && arg && !arg.startsWith("--")) return runBatch(arg);
  if (cmd === "forsale" && arg && !arg.startsWith("--")) return runForSale(arg);
  process.stderr.write(
    "Usage:\n" +
      '  property-intel pull "<address|redfin-url|zillow-url>" [--address "..."] [--out name] [--json|--csv|--pdf] [--print]\n' +
      '  property-intel batch "<city>" [--count 100 | --all] [--out name] [--json|--csv|--pdf]\n' +
      '  property-intel forsale "<city>" [--count N] [--region <id> --market <m>] [--out name] [--json|--csv|--pdf]\n',
  );
  process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(
    `Error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
