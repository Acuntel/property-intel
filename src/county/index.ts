// County router: pick the right assessor adapter by FIPS code.
// Add a new collar county by writing an adapter and registering its FIPS here.
import { lookupDuPage } from "./dupage.js";
import { lookupCook } from "./cook.js";
import type { ParcelInfo, ParsedAddress } from "../types.js";

type Adapter = (addr: ParsedAddress) => Promise<ParcelInfo | null>;

const ADAPTERS: Record<string, Adapter> = {
  "17043": lookupDuPage, // DuPage
  "17031": lookupCook, // Cook
};

export function supportedCounties(): string[] {
  return Object.keys(ADAPTERS);
}

export async function lookupParcel(
  countyFips: string,
  addr: ParsedAddress,
): Promise<{ parcel: ParcelInfo | null; supported: boolean }> {
  const adapter = ADAPTERS[countyFips];
  if (!adapter) return { parcel: null, supported: false };
  const parcel = await adapter(addr);
  return { parcel, supported: true };
}
