import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { TimelineEvent, TimelinePayload } from "../types";

const RANGES: Array<[number, string]> = [
  [90, "90 d"],
  [180, "6 mo"],
  [365, "1 yr"],
  [730, "2 yr"],
];

const TYPE_STYLE: Record<string, { color: string; label: string }> = {
  STATION: { color: "#f59e0b", label: "station" },
  INGRESS: { color: "#818cf8", label: "ingress" },
  LUNATION: { color: "#e4e4e7", label: "lunation" },
  ASPECT: { color: "#34d399", label: "outer aspect" },
  ECLIPSE: { color: "#fbbf24", label: "eclipse" },
};

interface RxWindow {
  planet: string;
  glyph: string | null;
  start: string | null;
  end: string;
  ongoing: boolean;
}

/** Pair Station-Rx → Station-Direct events into retrograde windows. */
function pairRxWindows(events: TimelineEvent[], rangeStart: string): RxWindow[] {
  const stations = events
    .filter((e) => e.event_type === "STATION")
    .sort((a, b) => a.jd - b.jd);
  const byPlanet = new Map<string, TimelineEvent[]>();
  for (const s of stations) {
    const arr = byPlanet.get(s.primary_body.name) ?? [];
    arr.push(s);
    byPlanet.set(s.primary_body.name, arr);
  }
  const out: RxWindow[] = [];
  for (const [planet, evts] of byPlanet) {
    const isOpening = (e: TimelineEvent) => e.event.includes("Retrograde");
    let open: TimelineEvent | null =
      evts[0] && !isOpening(evts[0]) ? { ...evts[0], date: `before ${rangeStart}` } : null;
    for (const e of evts) {
      if (isOpening(e)) {
        open = e;
      } else if (open) {
        out.push({
          planet,
          glyph: open.primary_body.glyph,
          start: open.date,
          end: e.date,
          ongoing: open.date.startsWith("before"),
        });
        open = null;
      }
    }
    if (open) {
      out.push({
        planet,
        glyph: open.primary_body.glyph,
        start: open.date,
        end: "(still retrograde)",
        ongoing: true,
      });
    }
  }
  return out;
}

export default function CyclesView({
  onSelectEvent,
  selectedEventId,
}: {
  onSelectEvent?: (e: TimelineEvent) => void;
  selectedEventId?: string | null;
}) {
  const [days, setDays] = useState(365);
  const [data, setData] = useState<TimelinePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(
    new Set(["STATION", "INGRESS", "LUNATION", "ASPECT", "ECLIPSE"]),
  );
  const [openInterp, setOpenInterp] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .timeline(days)
      .then((c) => alive && setData(c))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days]);

  const rxWindows = useMemo(
    () => (data ? pairRxWindows(data.events, data.range_start) : []),
    [data],
  );

  const timeline = useMemo(
    () => (data ? data.events.filter((e) => enabled.has(e.event_type)) : []),
    [data, enabled],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden text-zinc-200">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Cycles &amp; Ephemeris Events
        </h2>
        <div className="flex gap-1">
          {RANGES.map(([d, label]) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded px-2 py-0.5 text-[11px] transition ${
                days === d
                  ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {loading && <span className="text-[11px] text-indigo-400">scanning ephemeris…</span>}
        {error && <span className="text-[11px] text-red-400">{error}</span>}
        {data && !loading && (
          <span className="ml-auto font-mono text-[10px] text-zinc-600">
            {data.total} events · {data.range_start.slice(0, 16)} → {data.range_end.slice(0, 16)} UTC
          </span>
        )}
      </div>

      {/* filter chips */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 pb-1">
        {Object.entries(TYPE_STYLE).map(([k, v]) => (
          <button
            key={k}
            onClick={() => {
              const next = new Set(enabled);
              if (next.has(k)) next.delete(k);
              else next.add(k);
              setEnabled(next);
            }}
            className={`flex items-center gap-1 text-[11px] transition ${
              enabled.has(k) ? "text-zinc-200" : "text-zinc-600 line-through"
            }`}
          >
            <span className="inline-block h-1.5 w-3 rounded-full" style={{ background: v.color }} />
            {v.label}
            {data?.metrics[k] != null && (
              <span className="text-zinc-600">{data.metrics[k]}</span>
            )}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-zinc-600">click an event → bi-wheel at that moment</span>
      </div>

      {!data ? (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
          {error ?? "Loading…"}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {/* ---------- spotlight: Mercury & Saturn retrogrades ---------- */}
          <div className="mb-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
            {(["Mercury", "Saturn"] as const).map((p) => {
              const wins = rxWindows.filter((w) => w.planet === p);
              return (
                <div key={p} className="rounded-lg border border-amber-700/30 bg-amber-950/10 p-2">
                  <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <span className="text-base leading-none">{p === "Mercury" ? "☿" : "♄"}</span>
                    {p} Retrograde Windows
                  </h3>
                  {wins.length === 0 ? (
                    <p className="text-[11px] text-zinc-500">No {p} stations in range.</p>
                  ) : (
                    <ul className="space-y-1">
                      {wins.map((w, i) => (
                        <li key={i} className="rounded bg-zinc-900/60 px-2 py-1">
                          <div className="font-mono text-[11px] text-zinc-300">
                            {w.start} → {w.end}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {w.start!.startsWith("before")
                              ? `retrograde NOW — direct at ${w.end}`
                              : w.end.startsWith("(")
                                ? "stationed retrograde — direct date beyond range"
                                : `retrograde ${w.start} → ${w.end}`}
                            {p === "Mercury" && !w.start!.startsWith("before") && !w.end.startsWith("(")
                              ? " · shadow lasts ~2 wk after"
                              : ""}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* ---------- eclipses ---------- */}
          {data.events.some((e) => e.event_type === "ECLIPSE") && (
            <div className="mb-3 rounded-lg border border-yellow-600/30 bg-yellow-950/10 p-2">
              <h3 className="mb-1 text-xs font-semibold text-yellow-300">Eclipses — nodal alignments</h3>
              <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                {data.events
                  .filter((e) => e.event_type === "ECLIPSE")
                  .map((e) => (
                    <li key={e.event_id}>
                      <button
                        onClick={() => onSelectEvent?.(e)}
                        className="flex w-full items-baseline gap-2 rounded px-1 text-left hover:bg-yellow-500/10"
                      >
                        <span className="font-mono text-[11px] text-zinc-400">{e.date.slice(0, 16)}</span>
                        <span
                          className={`text-xs font-medium ${
                            e.event.includes("Solar") ? "text-yellow-200" : "text-slate-300"
                          }`}
                        >
                          {e.event.includes("Solar") ? "☀" : "☾"} {e.event}
                        </span>
                        <span className="ml-auto text-[11px] text-zinc-500">{e.position_str}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* ---------- unified clickable timeline ---------- */}
          <h3 className="mb-1 text-xs font-semibold text-zinc-400">
            Chronological timeline ({timeline.length})
          </h3>
          <ul className="divide-y divide-zinc-900/60">
            {timeline.map((e) => {
              const st = TYPE_STYLE[e.event_type];
              const selected = selectedEventId === e.event_id;
              return (
                <li
                  key={e.event_id}
                  className={`border-l-2 transition ${
                    selected ? "bg-indigo-500/10" : "hover:bg-zinc-900/50"
                  } ${onSelectEvent ? "cursor-pointer" : ""}`}
                  style={{ borderColor: st.color }}
                  onClick={() => onSelectEvent?.(e)}
                >
                  <div className="flex items-baseline gap-2 py-[3px] pl-2 pr-1">
                    <span className="w-32 shrink-0 font-mono text-[11px] text-zinc-400">{e.date.slice(0, 16)}</span>
                    <span className="text-xs text-zinc-200">
                      {e.glyphs ? `${e.glyphs} ` : e.primary_body.glyph ? `${e.primary_body.glyph} ` : ""}
                      <strong className="font-medium">{e.event}</strong>
                      {e.planets ? <span className="text-zinc-400"> · {e.planets}</span> : null}
                      {e.curated && (
                        <span className="ml-1 text-[10px] text-amber-400" title="curated interpretation">
                          ★
                        </span>
                      )}
                    </span>
                    {e.position_str && (
                      <span className="ml-auto hidden shrink-0 text-[11px] text-zinc-500 md:inline">
                        {e.position_str}
                      </span>
                    )}
                    {onSelectEvent && (
                      <span className="shrink-0 text-[10px] text-indigo-400/70">⤿</span>
                    )}
                  </div>
                  {openInterp === e.event_id ? (
                    <div className="flex gap-2 pb-1.5 pl-2 pr-2">
                      <p className="flex-1 text-[11px] leading-snug text-zinc-400">
                        {e.interpretation}
                        {e.curated && <span className="ml-1 text-amber-500/70">— curated</span>}
                      </p>
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setOpenInterp(null);
                        }}
                        className="shrink-0 text-[10px] text-zinc-600 hover:text-zinc-300"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setOpenInterp(e.event_id);
                      }}
                      className="pb-1 pl-2 text-[10px] text-zinc-600 hover:text-indigo-300"
                    >
                      interpretation ▾
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
