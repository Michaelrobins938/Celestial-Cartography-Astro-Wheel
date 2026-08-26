import type { BirthFormValue } from "../components/BirthForm";

interface SharePayload {
  n: string; // place label
  d: string; // local_dt yyyy-MM-ddTHH:mm
  la: number;
  lo: number;
  tz: string | null;
  h: string; // house system code
}

export interface DecodedShare {
  n: string;
  d: string;
  la: number;
  lo: number;
  tz: string | null;
  house_system: string;
}

export function encodeShare(v: BirthFormValue, name?: string): string {
  const p: SharePayload = {
    n: name ?? v.place ?? "",
    d: v.local_dt,
    la: v.lat ?? 0,
    lo: v.lon ?? 0,
    tz: v.tz_name ?? null,
    h: v.house_system ?? "P",
  };
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShare(hash: string): DecodedShare | null {
  try {
    const b64 = hash.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
    if (!p.d || typeof p.la !== "number" || typeof p.lo !== "number") return null;
    return { n: p.n, d: p.d, la: p.la, lo: p.lo, tz: p.tz, house_system: p.h || "P" };
  } catch {
    return null;
  }
}
