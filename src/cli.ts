#!/usr/bin/env node
// property-intel CLI — public-records property lookup.
//   pull <address|redfin-url|zillow-url> [options]
//
// Options:
//   --address "<addr>"   explicit address when the input is a URL
//   --out <basename>     output basename (default: derived from address)
//   --json|--csv|--pdf   choose formats (default: all three)
//   --print              also print the JSON record to stdout
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pull } from "./pull.js";
import { recordsToCsv, recordsToJson } from "./output.js";
import { writePdf } from "./pdf.js";
import type { PropertyRecord } from "./types.js";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

function slug(r: PropertyRecord): string {
  return (
    `${r.address}-${r.city}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "property"
  );
}

const dollars = (n?: number) => (n != null ? `$${n.toLocaleString()}` : "—");

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const input = process.argv[3];
  if (cmd !== "pull" || !input || input.startsWith("--")) {
    process.stderr.write(
      'Usage: property-intel pull "<address|redfin-url|zillow-url>" [--address "..."] [--out name] [--json] [--csv] [--pdf] [--print]\n',
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`→ Looking up ${input}\n`);
  const record = await pull(input, { address: flag("address") });

  const anySpecific = has("json") || has("csv") || has("pdf");
  const doJson = !anySpecific || has("json");
  const doCsv = !anySpecific || has("csv");
  const doPdf = !anySpecific || has("pdf");

  const base = flag("out") ?? slug(record);
  const outDir = join(process.cwd(), "output");
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];

  if (doJson) {
    const p = join(outDir, `${base}.json`);
    writeFileSync(p, recordsToJson([record]));
    written.push(p);
  }
  if (doCsv) {
    const p = join(outDir, `${base}.csv`);
    writeFileSync(p, recordsToCsv([record]));
    written.push(p);
  }
  if (doPdf) {
    const p = join(outDir, `${base}.pdf`);
    await writePdf([record], p);
    written.push(p);
  }

  const r = record;
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
      `  Last sale       : ${lastSale ? `${lastSale.date ?? "?"} — ${dollars(lastSale.price)}` : "—"}\n` +
      `  Sales on record : ${r.sales.length}\n`,
  );
  if (r.warnings.length) {
    process.stdout.write(
      `  Notes:\n${r.warnings.map((w) => `    ⚠ ${w}`).join("\n")}\n`,
    );
  }
  if (has("print")) process.stdout.write(`\n${recordsToJson([record])}`);
  process.stdout.write(
    `\nWrote:\n${written.map((w) => `  ${w}`).join("\n")}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `Error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
