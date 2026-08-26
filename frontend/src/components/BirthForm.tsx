// Birth-data input pipeline UI: local civil date/time + place name.
// Place search hits the backend's offline gazetteer; timezone is resolved
// server-side via timezonefinder + tzdata (historical rules).
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { PlaceHit } from "../types";

export interface BirthFormValue {
  local_dt: string; // yyyy-MM-ddTHH:mm
  place: string;
  lat?: number | null;
  lon?: number | null;
  tz_name?: string | null;
  house_system?: string;
}

export default function BirthForm({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: BirthFormValue;
  onChange: (v: BirthFormValue) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const [suggestions, setSuggestions] = useState<PlaceHit[]>([]);
  const [showSug, setShowSug] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value.place || value.lat != null) return setSuggestions([]);
    const t = setTimeout(() => {
      api.geocode(value.place).then((hits) => {
        setSuggestions(hits);
        setShowSug(true);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [value.place, value.lat]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setShowSug(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pickPlace = (p: PlaceHit) => {
    onChange({ ...value, place: `${p.name}, ${p.country}`, lat: p.lat, lon: p.lon, tz_name: p.tz });
    setShowSug(false);
  };

  const canSubmit = value.local_dt && (value.lat != null || suggestions.length > 0);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <label className="text-xs text-zinc-400">
        <span className="mb-1 block">Local birth date &amp; time</span>
        <input
          type="datetime-local"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
          value={value.local_dt}
          onChange={(e) => onChange({ ...value, local_dt: e.target.value })}
          required
        />
      </label>

      <div className="relative" ref={boxRef}>
        <label className="text-xs text-zinc-400">
          <span className="mb-1 block">Birthplace</span>
          <input
            type="text"
            placeholder="Search a city…"
            className="w-56 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500 placeholder:text-zinc-600"
            value={value.place}
            onChange={(e) => onChange({ ...value, place: e.target.value, lat: null, lon: null, tz_name: null })}
            onFocus={() => suggestions.length && setShowSug(true)}
          />
        </label>
        {showSug && suggestions.length > 0 && (
          <ul className="absolute z-[1200] mt-1 max-h-56 w-full overflow-auto rounded-md border border-zinc-700 bg-zinc-900 shadow-xl">
            {suggestions.map((p, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-800"
                  onClick={() => pickPlace(p)}
                >
                  {p.name}
                  <span className="text-zinc-500"> · {p.country} · </span>
                  <span className="text-zinc-600">{p.tz}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <select
        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        value={value.house_system ?? "P"}
        onChange={(e) => onChange({ ...value, house_system: e.target.value })}
      >
        <option value="P">Placidus</option>
        <option value="W">Whole Sign</option>
        <option value="K">Koch</option>
        <option value="E">Equal</option>
      </select>

      <button
        type="submit"
        disabled={!canSubmit || busy}
        className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
      >
        {busy ? "Calculating…" : "Cast chart"}
      </button>
    </form>
  );
}
