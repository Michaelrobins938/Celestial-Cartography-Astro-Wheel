import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type BirthInputPayload } from "./api";
import type {
  Astrocartography,
  BodyPos,
  Chart,
  Profile,
  ProgressionChart,
  TimelineEvent,
  TransitPayload,
} from "./types";
import Wheel from "./components/Wheel";
import MapView from "./components/MapView";
import BirthForm, { type BirthFormValue } from "./components/BirthForm";
import PositionsTable from "./components/PositionsTable";
import TransitClock from "./components/TransitClock";
import InterpretationCard from "./components/InterpretationCard";
import CyclesView from "./components/CyclesView";
import HarmonicsView from "./components/HarmonicsView";
import ReportView from "./components/ReportView";
import ReadingsPanel from "./components/ReadingsPanel";
import { Markdown } from "./lib/markdown";
import { aspectText, lineText, planetText } from "./lib/interpretations";
import { fmtUTC, ordinalHouse } from "./lib/format";
import { decodeShare, encodeShare } from "./lib/share";
import { downloadBlob, svgToPngBlob } from "./lib/exportPng";

type ViewTab = "natal" | "transits" | "progressions" | "draconic" | "cycles" | "harmonics" | "report";

interface Selection {
  kind: "planet" | "aspect" | "line";
  title: string;
  subtitle?: string;
  text?: string;
}

const PLANET_ORDER = [0, 3, 4, 2, 1, 6, 5, 7, 8, 9]; // map legend order
const PLANET_NAME_BY_ID: Record<number, string> = {
  0: "Sun", 1: "Moon", 2: "Mercury", 3: "Venus", 4: "Mars",
  5: "Jupiter", 6: "Saturn", 7: "Uranus", 8: "Neptune", 9: "Pluto",
};

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [form, setForm] = useState<BirthFormValue & { house_system?: string }>({
    local_dt: "1995-08-31T07:08",
    place: "Fort Worth, US",
    lat: null,
    lon: null,
    tz_name: null,
    house_system: "P",
  });

  const [natal, setNatal] = useState<Chart | null>(null);
  const [relocated, setRelocated] = useState<Chart | null>(null);
  const [transits, setTransits] = useState<TransitPayload | null>(null);
  const [progressions, setProgressions] = useState<ProgressionChart | null>(null);
  const [draconic, setDraconic] = useState<Chart | null>(null);
  const [acg, setAcg] = useState<Astrocartography | null>(null);

  const [tab, setTab] = useState<ViewTab>("natal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acgLoading, setAcgLoading] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [enabledPlanets, setEnabledPlanets] = useState<Set<number>>(new Set(PLANET_ORDER));
  const [showParans, setShowParans] = useState(true);
  const [mapMarkers, setMapMarkers] = useState<Array<{ lat: number; lon: number; label: string; color: string }>>([]);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [sharedFromLink, setSharedFromLink] = useState<string | null>(null);
  const [showJournal, setShowJournal] = useState(false);

  const payload: BirthInputPayload = useMemo(
    () => ({
      local_dt: form.local_dt,
      place: form.lat != null ? null : form.place,
      lat: form.lat ?? null,
      lon: form.lon ?? null,
      tz_name: form.tz_name ?? null,
      house_system: form.house_system ?? "P",
    }),
    [form],
  );

  useEffect(() => {
    api.profiles().then((ps) => {
      setProfiles(ps);
      if (ps.length) setProfileId(ps[0].id);
    });
  }, []);

  const castAll = useCallback(
    async (p: BirthInputPayload) => {
      setBusy(true);
      setError(null);
      try {
        const n = await api.natal(p);
        setNatal(n);
        setRelocated(null);
        setMapMarkers([{ lat: n.lat, lon: n.lon, label: "birthplace", color: "#fafafa" }]);
        // parallel secondary fetches
        api.transits(p).then(setTransits).catch(() => {});
        api.progressions(p).then(setProgressions).catch(() => {});
        api.draconic(p).then(setDraconic).catch(() => {});
        setAcgLoading(true);
        api
          .astrocartography(p)
          .then((a) => setAcg(a))
          .catch(() => {})
          .finally(() => setAcgLoading(false));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // auto-cast on first load: a shared #p= permalink wins over the seed profile
  useEffect(() => {
    if (natal || busy) return;
    const h = window.location.hash;
    const dec = h.startsWith("#p=") ? decodeShare(h.slice(3)) : null;
    if (!dec) {
      castAll(payload);
      return;
    }
    const shared: BirthInputPayload = {
      local_dt: dec.d,
      place: dec.n,
      lat: dec.la,
      lon: dec.lo,
      tz_name: dec.tz,
      house_system: dec.house_system,
    };
    setForm({
      local_dt: dec.d,
      place: dec.n ?? "",
      lat: dec.la,
      lon: dec.lo,
      tz_name: dec.tz,
      house_system: dec.house_system,
    });
    setSharedFromLink(dec.n);
    castAll(shared);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfile = async (id: number) => {
    setProfileId(id);
    const p = profiles.find((pr) => pr.id === id);
    if (!p) return;
    const v: BirthFormValue & { house_system?: string } = {
      local_dt: p.birth_local.slice(0, 16),
      place: p.place_name,
      lat: p.lat,
      lon: p.lon,
      tz_name: p.tz_name,
      house_system: p.house_system,
    };
    setForm(v);
    await castAll({
      local_dt: v.local_dt,
      place: null,
      lat: v.lat,
      lon: v.lon,
      tz_name: v.tz_name,
      house_system: v.house_system ?? "P",
    });
  };

  const saveProfile = async () => {
    const name = window.prompt("Profile name:", form.place?.split(",")[0] ?? "New profile");
    if (!name) return;
    const created = await api.createProfile(name, payload);
    setProfileId(created.id); // journal targets the profile just saved
    const ps = await api.profiles();
    setProfiles(ps);
  };

  const deleteProfile = async () => {
    if (profileId == null) return;
    await api.deleteProfile(profileId);
    const ps = await api.profiles();
    setProfiles(ps);
    setProfileId(ps[0]?.id ?? null);
  };

  const handleMapClick = async (lat: number, lon: number) => {
    if (!natal) return;
    try {
      const rc = await api.relocate(natal.utc, lat, lon, natal.house_system);
      setRelocated(rc);
      setMapMarkers((m) => [
        m[0],
        { lat, lon, label: "relocation", color: "#f472b6" },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const refreshTransits = () => {
    if (!natal) return;
    setSelectedEvent(null);
    api.transits(payload).then(setTransits).catch(() => {});
  };

  /** Click a timeline event → cast the sky at that exact moment as a bi-wheel. */
  const handleSelectEvent = async (e: TimelineEvent) => {
    if (!natal) return;
    try {
      const t = await api.transits(payload, e.timestamp_utc);
      setTransits(t);
      setSelectedEvent(e);
      setTab("transits");
      if (e.event_type === "ECLIPSE") {
        const node = t.bodies.find((b) => b.name === "North Node");
        if (node) {
          setSelection({
            kind: "aspect",
            title: `${e.event} — ${e.date.slice(0, 16)} UTC`,
            subtitle: e.position_str ?? undefined,
            text: `${e.interpretation}\n\nThe dashed golden axis marks the lunar nodes: an eclipse occurs only when Sun and Moon align **at the node** — the intersection of the Moon's orbit with the ecliptic.`,
          });
        }
      } else {
        setSelection({
          kind: "aspect",
          title: `${e.event} — ${e.date.slice(0, 16)} UTC`,
          subtitle: e.position_str ?? undefined,
          text: e.interpretation,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const displayedBase = relocated ?? natal;

  const bodiesForTable = (): { bodies: BodyPos[]; title: string } => {
    switch (tab) {
      case "progressions":
        return progressions
          ? { bodies: progressions.bodies, title: "Progressed positions" }
          : { bodies: [], title: "Progressions" };
      case "draconic":
        return draconic ? { bodies: draconic.bodies, title: "Draconic positions" } : { bodies: [], title: "Draconic" };
      default:
        return displayedBase
          ? { bodies: displayedBase.bodies, title: relocated ? "Relocated natal" : "Natal positions" }
          : { bodies: [], title: "Positions" };
    }
  };

  const tableData = bodiesForTable();

  const overlayForWheel = (): { bodies?: BodyPos[]; asc?: number; label?: string } => {
    if (tab === "transits") {
      if (transits && selectedEvent) {
        return {
          bodies: transits.bodies,
          label: `outer ring: sky at ${selectedEvent.event} · ${fmtUTC(transits.transit_utc)}`,
        };
      }
      return transits
        ? { bodies: transits.bodies, label: `outer ring: transits ${fmtUTC(transits.transit_utc)}` }
        : {};
    }
    if (tab === "progressions" && progressions) {
      return { bodies: progressions.bodies, asc: progressions.angles.asc, label: "outer ring: secondary progressions" };
    }
    if (tab === "draconic" && draconic) {
      return { bodies: draconic.bodies, label: "outer ring: draconic (node-shifted)" };
    }
    return {};
  };

  const overlay = overlayForWheel();

  // Nodal axis highlight: only when an eclipse event is being viewed.
  const axisLon =
    tab === "transits" && selectedEvent?.event_type === "ECLIPSE"
      ? transits?.bodies.find((b) => b.name === "North Node")?.lon
      : undefined;

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* ---------- header ---------- */}
      <header className="no-print flex items-center gap-4 border-b border-zinc-800 px-4 py-2.5">
        <h1 className="text-sm font-semibold tracking-wide text-zinc-100">
          ✦ CELESTIAL BLUEPRINT
          <span className="ml-2 hidden text-[11px] font-normal text-zinc-500 md:inline">
            The Astro-Mapper &amp; Transit Synthesizer
          </span>
        </h1>

        <select
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
          value={profileId ?? ""}
          onChange={(e) => e.target.value && loadProfile(Number(e.target.value))}
        >
          <option value="">— profiles —</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={saveProfile} className="text-xs text-zinc-400 hover:text-indigo-300">
          save
        </button>
        <button onClick={deleteProfile} className="text-xs text-zinc-400 hover:text-red-400">
          delete
        </button>
        <button
          onClick={() => {
            const url = `${window.location.origin}${window.location.pathname}#p=${encodeShare(form, payload.place ?? undefined)}`;
            navigator.clipboard.writeText(url).then(
              () => setSharedFromLink(`link copied — ${url.slice(0, 48)}…`),
              () => setError("clipboard blocked"),
            );
          }}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-100"
        >
          copy link
        </button>
        <button
          onClick={async () => {
            const svg = document.querySelector<SVGSVGElement>('svg[data-testid="astro-wheel"]');
            if (!svg) return setError("no wheel on screen");
            try {
              const blob = await svgToPngBlob(svg, 2);
              downloadBlob(blob, `chart-${payload.place?.replace(/\W+/g, "-").toLowerCase() ?? "chart"}-${Date.now()}.png`);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-100"
        >
          png ⤓
        </button>
        {sharedFromLink && (
          <button
            onClick={() => setSharedFromLink(null)}
            className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300"
            title="click to dismiss"
          >
            ⤿ {sharedFromLink} ✕
          </button>
        )}

        <div className="ml-auto">
          <BirthForm
            value={form}
            onChange={(v) => setForm(v)}
            onSubmit={() => {
              setProfileId(null);
              castAll(payload);
            }}
            busy={busy}
          />
        </div>
      </header>

      {error && (
        <div className="border-b border-red-900 bg-red-950/60 px-4 py-1.5 text-xs text-red-300">{error}</div>
      )}

      {/* ---------- main ---------- */}
      <main className="flex min-h-0 flex-1">
        {/* left sidebar */}
        <aside className="no-print w-80 shrink-0 border-r border-zinc-800 bg-zinc-950">
          {tableData.bodies.length > 0 || true ? (
            <PositionsTable
              bodies={tableData.bodies}
              title={tableData.title}
              onSelect={(b) =>
                setSelection({ kind: "planet", title: `${b.name} — ${b.position_str}`, subtitle: b.house ? `${ordinalHouse(b.house)} House${b.retrograde ? ", retrograde" : ""}` : undefined, text: planetText(b.name) })
              }
              selectedName={selection?.kind === "planet" ? selection.title.split(" — ")[0] : null}
            />
          ) : null}
        </aside>

        {/* center */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* tabs */}
          <nav className="no-print flex items-center gap-1 border-b border-zinc-800 px-3 pt-1.5">
            {(
              [
                ["natal", "Natal"],
                ["transits", "Transits"],
                ["progressions", "Progressions"],
                ["draconic", "Draconic"],
                ["cycles", "Cycles ⟳"],
                ["harmonics", "Harmonics ∿"],
                ["report", "Report ⎙"],
              ] as Array<[ViewTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-t-md px-3 py-1.5 text-xs transition ${
                  tab === key
                    ? "bg-zinc-900 font-medium text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setShowJournal(!showJournal)}
              className={`rounded-t-md px-2 py-1.5 text-xs transition ${showJournal ? "bg-zinc-900 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Journal ✎
            </button>
            {selectedEvent && (
              <button
                onClick={() => setSelectedEvent(null)}
                className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300 hover:bg-amber-500/25"
                title="viewing the sky at this event — click to return to now"
              >
                ⤿ {selectedEvent.event} · {selectedEvent.date.slice(0, 10)} — click to exit ✕
              </button>
            )}
            {displayedBase && (
              <div className="ml-auto pb-1 pr-1 text-[11px] text-zinc-500">
                {displayedBase.house_system_label}
                {(displayedBase as Chart).fallback_applied && (
                  <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-400" title="Placidus/Koch undefined at this latitude — fell back to Whole Sign">
                    polar fallback → Whole Sign
                  </span>
                )}
                {relocated && (
                  <button onClick={() => setRelocated(null)} className="ml-2 rounded bg-pink-500/15 px-1.5 py-0.5 text-pink-300 hover:bg-pink-500/25">
                    viewing RELOCATED chart — click to exit ✕
                  </button>
                )}
              </div>
            )}
          </nav>

          {/* wheel / cycles */}
          <div className="relative min-h-0 flex-1 bg-zinc-950 p-2">
{tab === "cycles" ? (
              <CyclesView
                onSelectEvent={handleSelectEvent}
                selectedEventId={selectedEvent?.event_id}
              />
            ) : tab === "harmonics" ? (
              <div className="mx-auto h-full w-full max-w-4xl overflow-hidden">
                <HarmonicsView />
              </div>
            ) : tab === "report" ? (
              <ReportView payload={payload} />
            ) : displayedBase ? (
              <div className="mx-auto h-full max-h-[720px]" style={{ aspectRatio: "1 / 1" }}>
                <Wheel
                  base={displayedBase}
                  overlayBodies={tab === "natal" && !relocated ? undefined : overlay.bodies}
                  overlayAnglesAsc={overlay.asc}
                  overlayLabel={overlay.label}
                  axisLon={axisLon}
                  onSelectBody={(b) =>
                    setSelection({ kind: "planet", title: `${b.name} — ${b.position_str}`, subtitle: b.house ? `${ordinalHouse(b.house)} House` : undefined, text: planetText(b.name) })
                  }
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-600">Cast a chart to begin.</div>
            )}
            {selection && (
              <div className="pointer-events-none absolute right-4 top-4">
                <InterpretationCard title={selection.title} subtitle={selection.subtitle} onClose={() => setSelection(null)}>
                  {selection.text ? <Markdown text={selection.text} /> : <p className="text-xs text-zinc-500">No delineation available.</p>}
                </InterpretationCard>
              </div>
            )}
            {showJournal && (
              <aside className="absolute inset-y-0 right-0 z-20 w-80 border-l border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur">
                <ReadingsPanel
                  profileId={profileId}
                  currentTransits={tab === "transits" || selectedEvent ? transits : null}
                  selectedEvent={selectedEvent}
                />
              </aside>
            )}
          </div>

          {/* ---------- map ---------- */}
          {tab !== "cycles" && tab !== "harmonics" && tab !== "report" && (
          <div className="no-print flex h-[42%] min-h-0 shrink-0 flex-col border-t border-zinc-800">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Astrocartography</h2>
              {acgLoading && <span className="text-[11px] text-indigo-400">solving lines…</span>}
              {!acgLoading && acg && (
                <span className="text-[11px] text-zinc-600">{Object.keys(acg.parans).length > -1 ? `${acg.parans.length} parans` : ""}</span>
              )}
              <label className="ml-auto flex cursor-pointer items-center gap-1 text-[11px] text-zinc-400">
                <input type="checkbox" checked={showParans} onChange={(e) => setShowParans(e.target.checked)} />
                paran crossings
              </label>
              <span className="text-[11px] text-zinc-500">·</span>
              <span className="text-[11px] text-zinc-500">click map → relocated chart at original UTC moment</span>
            </div>

            {/* planet color legend / toggles */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 pb-1">
              {acg &&
                PLANET_ORDER.map((pid) => {
                  const pl = acg.planets[String(pid)];
                  if (!pl) return null;
                  const on = enabledPlanets.has(pid);
                  return (
                    <button
                      key={pid}
                      onClick={() => {
                        const next = new Set(enabledPlanets);
                        if (on) next.delete(pid);
                        else next.add(pid);
                        setEnabledPlanets(next);
                      }}
                      onMouseEnter={() =>
                        setSelection({ kind: "line", title: `${pl.name} lines`, text: Object.values({ asc: lineText("asc"), dsc: lineText("dsc"), mc: lineText("mc"), ic: lineText("ic") }).join("\n\n").replace(/\*\*/g, "") })
                      }
                      className={`flex items-center gap-1 text-[11px] capitalize transition ${on ? "text-zinc-200" : "text-zinc-600"}`}
                    >
                      <span className="inline-block h-1.5 w-4 rounded-full" style={{ background: on ? pl.color : "#3f3f46" }} />
                      {pl.name.toLowerCase()}
                    </button>
                  );
                })}
              {acg &&
                ["asc", "dsc", "mc", "ic"].map((k) => (
                  <button key={k} onClick={() => setSelection({ kind: "line", title: k.toUpperCase() + " line", text: lineText(k) })} className="text-[10px] uppercase tracking-wider text-zinc-600 underline decoration-dotted hover:text-zinc-300">
                    {k}
                  </button>
                ))}
            </div>

            <div className="min-h-0 flex-1">
              <MapView
                acg={acg}
                enabledPlanets={enabledPlanets}
                showParans={showParans}
                onMapClick={handleMapClick}
                markers={mapMarkers}
              />
            </div>
          </div>
          )}
        </section>

        {/* right sidebar */}
        <aside className="no-print w-72 shrink-0 border-l border-zinc-800 bg-zinc-950">
          <TransitClock
            triggers={transits?.triggers ?? []}
            transitUtc={transits?.transit_utc ?? null}
            onRefresh={refreshTransits}
            onSelectTrigger={(t) =>
              setSelection({
                kind: "aspect",
                title: `Tr. ${t.transit} ${t.aspect} Nat. ${t.natal}`,
                subtitle: `${t.orb.toFixed(1)}° orb`,
                text: aspectText(t.aspect),
              })
            }
          />
        </aside>
      </main>
    </div>
  );
}
