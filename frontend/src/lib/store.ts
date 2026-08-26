// Local-first persistence for profiles + readings.
// The serverless backend's SQLite lives on an ephemeral per-instance disk, so
// journal data is kept in localStorage; the backend CRUD endpoints remain
// available for self-hosted deployments with a durable database.

import type { BirthInputPayload, Profile, Reading } from "../types";

const PROFILES_KEY = "cb.profiles";
const READINGS_KEY = "cb.readings";

function readList<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, rows: T[]): void {
  localStorage.setItem(key, JSON.stringify(rows));
}

export const store = {
  profiles(): Profile[] {
    return readList<Profile>(PROFILES_KEY);
  },

  createProfile(name: string, b: BirthInputPayload): Profile {
    const p: Profile = {
      id: Date.now(),
      name,
      birth_local: b.local_dt,
      place_name: b.place ?? "",
      lat: b.lat,
      lon: b.lon,
      tz_name: b.tz_name,
      house_system: b.house_system ?? "P",
    };
    writeList(PROFILES_KEY, [p, ...store.profiles()]);
    return p;
  },

  deleteProfile(id: number): { ok: true } {
    writeList(PROFILES_KEY, store.profiles().filter((p) => p.id !== id));
    writeList(READINGS_KEY, readList<Reading>(READINGS_KEY).filter((r) => r.profile_id !== id));
    return { ok: true };
  },

  readings(pid: number): Reading[] {
    return readList<Reading>(READINGS_KEY)
      .filter((r) => r.profile_id === pid)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.id - a.id);
  },

  createReading(
    pid: number,
    data: { title: string; focus?: string | null; body_md?: string; snapshot_json?: string | null },
  ): Reading {
    const r: Reading = {
      id: Date.now(),
      profile_id: pid,
      created_at: new Date().toISOString(),
      title: data.title,
      focus: data.focus ?? null,
      body_md: data.body_md ?? "",
      snapshot_json: data.snapshot_json ?? null,
    };
    writeList(READINGS_KEY, [r, ...readList<Reading>(READINGS_KEY)]);
    return r;
  },

  updateReading(id: number, patch: Partial<Pick<Reading, "title" | "focus" | "body_md" | "snapshot_json">>): Reading {
    const rows = readList<Reading>(READINGS_KEY);
    const i = rows.findIndex((r) => r.id === id);
    if (i === -1) throw new Error("Reading not found");
    rows[i] = { ...rows[i], ...patch };
    writeList(READINGS_KEY, rows);
    return rows[i];
  },

  deleteReading(id: number): { ok: true } {
    writeList(READINGS_KEY, readList<Reading>(READINGS_KEY).filter((r) => r.id !== id));
    return { ok: true };
  },
};
