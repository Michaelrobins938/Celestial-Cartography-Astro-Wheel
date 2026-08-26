import type {
  Astrocartography,
  Chart,
  CyclesPayload,
  HarmonicsPayload,
  PlaceHit,
  Profile,
  ProgressionChart,
  TimelinePayload,
  TransitPayload,
} from "./types";

/** Backend origin. Empty = same-origin (vite dev proxy); set VITE_API_BASE for deployed builds. */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const u = (path: string): string => `${API_BASE}${path}`;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export interface BirthInputPayload {
  local_dt: string;
  place?: string | null;
  lat?: number | null;
  lon?: number | null;
  tz_name?: string | null;
  house_system: string;
}

export const api = {
  geocode: (q: string): Promise<PlaceHit[]> =>
    fetch(u(`/api/geocode?q=${encodeURIComponent(q)}`)).then((r) => r.json()),

  natal: (b: BirthInputPayload) => post<Chart>(u("/api/chart/natal"), b),

  transits: (b: BirthInputPayload, transitUtc?: string) =>
    post<TransitPayload>(u("/api/chart/transits"), { ...b, transit_dt: transitUtc }),

  progressions: (b: BirthInputPayload, progDate?: string) =>
    post<ProgressionChart>(u("/api/chart/progressions"), { ...b, prog_date: progDate }),

  draconic: (b: BirthInputPayload) => post<Chart>(u("/api/chart/draconic"), b),

  astrocartography: (b: BirthInputPayload) =>
    post<Astrocartography>(u("/api/astrocartography"), b),

  relocate: (utcBirth: string, lat: number, lon: number, houseSystem: string) =>
    // Power-user bypass: pass the resolved UTC + coords directly.
    fetch(u("/api/relocate"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        local_dt: new Date().toISOString(),
        lat,
        lon,
        house_system: houseSystem,
        utc_override: utcBirth,
      }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).detail ?? "relocate failed");
      return r.json() as Promise<Chart>;
    }),

  profiles: (): Promise<Profile[]> => fetch(u("/api/profiles")).then((r) => r.json()),

  cycles: (days: number): Promise<CyclesPayload> =>
    fetch(u(`/api/cycles?days=${days}`)).then(async (r) => {
      if (!r.ok) throw new Error("cycles fetch failed");
      return r.json() as Promise<CyclesPayload>;
    }),

  timeline: (days: number): Promise<TimelinePayload> =>
    fetch(u(`/api/timeline?days=${days}`)).then(async (r) => {
      if (!r.ok) throw new Error("timeline fetch failed");
      return r.json() as Promise<TimelinePayload>;
    }),

  harmonics: (): Promise<HarmonicsPayload> =>
    fetch(u("/api/harmonics")).then(async (r) => {
      if (!r.ok) throw new Error("harmonics fetch failed");
      return r.json() as Promise<HarmonicsPayload>;
    }),

  createProfile: (name: string, b: BirthInputPayload) =>
    post<{ id: number; name: string }>(u("/api/profiles"), { ...b, name }),

  deleteProfile: (id: number) =>
    fetch(u(`/api/profiles/${id}`), { method: "DELETE" }).then((r) => r.json()),
};
