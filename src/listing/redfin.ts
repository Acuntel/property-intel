// Redfin listing adapter. Two inputs supported:
//   - a redfin.com listing URL (preferred — the realtor pastes it)
//   - a free-text address (resolved to a listing path via in-page autocomplete)
//
// Mechanism: open a Playwright session on redfin.com (passes CloudFront), then
// call Redfin's internal "stingray" JSON API from the page context. Responses
// are prefixed with an anti-hijack token that stripJsonPrefix() removes.
import { openSession } from "./browser.js";
import { stripJsonPrefix } from "../http.js";
import type { ListingInfo } from "../types.js";

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

// Redfin sometimes wraps values as { value } or { displayValue }. Flatten to a string.
function pickStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const s = o["displayValue"] ?? o["value"];
    return s == null ? undefined : String(s);
  }
  return String(v);
}

// Pull the listing path ("/IL/Roselle/620-Rodenburg-Rd-60172/home/12345") from a URL.
function pathFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("redfin.com")) return null;
    return u.pathname;
  } catch {
    return null;
  }
}

export async function fetchRedfin(
  input: string,
): Promise<{ listing: ListingInfo | null; warning?: string }> {
  const isUrl = /^https?:\/\//i.test(input);
  const warmup = isUrl ? input : "https://www.redfin.com/";
  let session;
  try {
    session = await openSession(warmup);
  } catch (e) {
    return {
      listing: null,
      warning: `Redfin: browser launch failed (${msg(e)})`,
    };
  }

  try {
    let path = isUrl ? pathFromUrl(input) : null;

    if (!path) {
      // address -> path via in-page autocomplete
      const acUrl =
        "https://www.redfin.com/stingray/do/location-autocomplete?v=2&location=" +
        encodeURIComponent(input);
      const acText = await session.fetchText(acUrl);
      const ac = JSON.parse(stripJsonPrefix(acText));
      const rows: unknown[] = ac?.payload?.exactMatch
        ? [
            ac.payload.exactMatch,
            ...(ac.payload.sections ?? []).flatMap(
              (s: { rows?: unknown[] }) => s.rows ?? [],
            ),
          ]
        : (ac?.payload?.sections ?? []).flatMap(
            (s: { rows?: unknown[] }) => s.rows ?? [],
          );
      const row = rows.find(
        (r): r is { url: string } =>
          typeof (r as { url?: unknown }).url === "string" &&
          /\/home\/\d+/.test((r as { url: string }).url),
      );
      path = row?.url ?? null;
    }

    if (!path) {
      return { listing: null, warning: "Redfin: no listing found for input" };
    }

    // initialInfo gives propertyId + listingId needed by the detail endpoints.
    const infoText = await session.fetchText(
      `https://www.redfin.com/stingray/api/home/details/initialInfo?path=${encodeURIComponent(path)}`,
    );
    const info = JSON.parse(stripJsonPrefix(infoText));
    const propertyId = info?.payload?.propertyId;
    const listingId = info?.payload?.listingId;
    if (!propertyId) {
      return { listing: null, warning: "Redfin: could not resolve propertyId" };
    }

    const q = `propertyId=${propertyId}${listingId ? `&listingId=${listingId}` : ""}&accessLevel=1`;
    const [aboveText, belowText] = await Promise.all([
      session.fetchText(
        `https://www.redfin.com/stingray/api/home/details/aboveTheFold?${q}`,
      ),
      session.fetchText(
        `https://www.redfin.com/stingray/api/home/details/belowTheFold?${q}`,
      ),
    ]);

    const above = JSON.parse(stripJsonPrefix(aboveText))?.payload ?? {};
    const below = JSON.parse(stripJsonPrefix(belowText))?.payload ?? {};

    const listing = parseRedfin(above, below, path);
    return { listing };
  } catch (e) {
    return {
      listing: null,
      warning: `Redfin: blocked or parse error (${msg(e)})`,
    };
  } finally {
    await session.close().catch(() => {});
  }
}

function parseRedfin(
  above: Record<string, any>,
  below: Record<string, any>,
  path: string,
): ListingInfo {
  const adi = above?.addressSectionInfo ?? {};
  const pub = below?.publicRecordsInfo ?? {};
  const basic = pub?.basicInfo ?? {};
  const tax = (pub?.taxInfo?.taxableLandValue ?? undefined) as
    | number
    | undefined;

  return {
    price: num(adi?.priceInfo?.amount) ?? num(adi?.price),
    beds: num(adi?.beds) ?? num(basic?.beds),
    baths: num(adi?.baths) ?? num(basic?.totalBaths),
    sqft: num(adi?.sqFt?.value) ?? num(basic?.totalSqFt),
    yearBuilt: num(basic?.yearBuilt),
    propertyType: basic?.propertyTypeName,
    status: pickStr(adi?.status),
    daysOnMarket: num(adi?.dom?.value),
    pricePerSqft: num(adi?.pricePerSqFt?.value),
    description: above?.marketingRemarks?.[0]?.marketingRemark,
    photos: [],
    url: path.startsWith("http") ? path : `https://www.redfin.com${path}`,
    source: "Redfin",
  };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
