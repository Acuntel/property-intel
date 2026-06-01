// Redfin for-sale search: one region request returns the whole active
// inventory of a city (address + beds/baths/sqft/year/price), instead of
// scraping each listing page. Redfin's downloadable CSV is gutted by MRED
// (Chicago MLS) rules, so we read the map JSON endpoint that powers the pins.
//
// A real page navigation establishes the CloudFront/Cloudflare session; the
// JSON is then fetched from within the page context. Zillow is captcha-walled
// (PerimeterX) and not used.
import { chromium } from "playwright";
import { stripJsonPrefix } from "../http.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const HEADLESS = process.env["PROPERTY_INTEL_HEADLESS"] !== "false";

// Known DuPage cities -> Redfin region. Add as needed, or pass --region/--market.
export const REDFIN_REGIONS: Record<string, { id: number; market: string }> = {
  elmhurst: { id: 29479, market: "chicago" },
};

export interface ForSaleListing {
  address: string;
  city?: string;
  zip?: string;
  price?: number;
  beds?: number;
  fullBaths?: number;
  halfBaths?: number;
  sqft?: number;
  yearBuilt?: number;
  daysOnMarket?: number;
  status?: string;
  propertyType?: string;
  mls?: string;
  url?: string;
}

const v = (x: unknown): unknown =>
  x && typeof x === "object" && "value" in (x as Record<string, unknown>)
    ? (x as { value: unknown }).value
    : x;
const n = (x: unknown): number | undefined => {
  const num = Number(v(x));
  return Number.isFinite(num) ? num : undefined;
};
const s = (x: unknown): string | undefined => {
  const str = v(x);
  return str == null || str === "" ? undefined : String(str);
};

function splitBaths(baths?: number): {
  fullBaths?: number;
  halfBaths?: number;
} {
  if (baths == null) return {};
  const full = Math.floor(baths);
  return { fullBaths: full, halfBaths: baths - full >= 0.5 ? 1 : 0 };
}

const PROP_TYPES: Record<number, string> = {
  1: "Single Family Residential",
  2: "Condo/Co-op",
  3: "Townhouse",
  4: "Multi-Family",
  5: "Land",
  6: "Other",
};

export async function fetchForSaleListings(
  regionId: number,
  market: string,
  onStatus?: (m: string) => void,
): Promise<ForSaleListing[]> {
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const ctx = await browser.newContext({
      userAgent: UA,
      locale: "en-US",
      viewport: { width: 1366, height: 900 },
    });
    const page = await ctx.newPage();
    onStatus?.("Opening Redfin search session…");
    await page
      .goto(`https://www.redfin.com/city/${regionId}/`, {
        waitUntil: "domcontentloaded",
        timeout: 35_000,
      })
      .catch(() => {});
    // the bare /city/<id>/ may 404; the canonical path isn't needed for the API,
    // but we must land on a redfin.com page to get the clearance cookie.
    if (!page.url().includes("redfin.com")) {
      await page.goto("https://www.redfin.com/", {
        waitUntil: "domcontentloaded",
        timeout: 35_000,
      });
    }
    await page.waitForTimeout(2500);

    const api =
      `https://www.redfin.com/stingray/api/gis?al=1&market=${market}&num_homes=350` +
      `&ord=redfin-recommended-asc&page_number=1&region_id=${regionId}&region_type=6` +
      `&sf=1,2,3,5,6,7&status=9&uipt=1,2,3,4,5,6,7,8&v=8`;
    onStatus?.("Fetching active for-sale inventory…");
    const raw = await page.evaluate(async (u) => {
      const r = await fetch(u, {
        credentials: "include",
        headers: { Accept: "application/json,*/*" },
      });
      return r.text();
    }, api);

    const homes = (JSON.parse(stripJsonPrefix(raw))?.payload?.homes ??
      []) as Record<string, unknown>[];
    return homes
      .map((h): ForSaleListing => {
        const baths = n(h["baths"]);
        return {
          address: String(v(h["streetLine"]) ?? "").trim(),
          city: s(h["city"]),
          zip: s(h["postalCode"]) ?? s(h["zip"]),
          price: n(h["price"]),
          beds: n(h["beds"]),
          ...splitBaths(baths),
          sqft: n(h["sqFt"]),
          yearBuilt: n(h["yearBuilt"]),
          daysOnMarket: n(h["dom"]),
          status: s(h["mlsStatus"]) ?? s(h["listingType"]),
          propertyType: PROP_TYPES[n(h["propertyType"]) ?? -1],
          mls: s(h["mlsId"]),
          url: h["url"] ? `https://www.redfin.com${v(h["url"])}` : undefined,
        };
      })
      .filter((l) => l.address);
  } finally {
    await browser.close();
  }
}
