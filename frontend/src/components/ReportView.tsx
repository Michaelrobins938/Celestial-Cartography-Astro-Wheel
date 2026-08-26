// ReportView: printable A4 "Almanac" reading document, composed from live endpoints
// and rendered as a paper sheet inside the dark app chrome.
import { useEffect, useState } from "react";
import { api, type BirthInputPayload } from "../api";
import type {
  AspectHit,
  Chart,
  HarmonicsPayload,
  TimelineEvent,
  TimelinePayload,
  TransitPayload,
} from "../types";
import { fmtUTC, ordinalHouse } from "../lib/format";
import { Markdown } from "../lib/markdown";
import { aspectText } from "../lib/interpretations";

type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | {
      state: "ready";
      natal: Chart;
      transits: TransitPayload;
      timeline: TimelinePayload;
      harmonics: HarmonicsPayload;
    };

const STATION_BODIES = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"];

export default function ReportView({ payload }: { payload: BirthInputPayload }) {
  const [doc, setDoc] = useState<Loaded>({ state: "loading" });

  useEffect(() => {
    let alive = true;
    Promise.all([api.natal(payload), api.transits(payload), api.timeline(365), api.harmonics()])
      .then(
        ([natal, transits, timeline, harmonics]) =>
          alive && setDoc({ state: "ready", natal, transits, timeline, harmonics }),
      )
      .catch((e) => alive && setDoc({ state: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [payload]);

  return (
    <div className="report-wrap">
      <div className="no-print mb-2 flex items-center justify-end gap-2">
        <span className="text-[11px] text-zinc-500">client-ready reading</span>
        <button
          onClick={() => window.print()}
          disabled={doc.state !== "ready"}
          title="Opens the print dialog — choose “Save as PDF”"
          className="rounded border border-zinc-600 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-200 hover:text-white disabled:opacity-40"
        >
          ⤓ export pdf
        </button>
      </div>
      <article id="report-sheet" className="almanac">
        {doc.state === "loading" && <p>Composing the document…</p>}
        {doc.state === "error" && <p role="alert">Could not assemble the report: {doc.message}</p>}
        {doc.state === "ready" && <ReportBody {...doc} payload={payload} />}
      </article>
    </div>
  );
}

function ReportBody({
  natal,
  transits,
  timeline,
  harmonics,
  payload,
}: {
  natal: Chart;
  transits: TransitPayload;
  timeline: TimelinePayload;
  harmonics: HarmonicsPayload;
  payload: BirthInputPayload;
}) {
  const curated = timeline.events.filter((e) => e.curated);
  const eclipses = timeline.events.filter((e) => e.event_type === "ECLIPSE");
  const stations = timeline.events.filter(
    (e) => e.event_type === "STATION" && STATION_BODIES.includes(e.primary_body.name),
  );
  const worstOmega =
    harmonics.links.length > 0 ? Math.max(...harmonics.links.map((l) => l.omega)) : 0;

  return (
    <>
      {/* Masthead */}
      <header style={{ textAlign: "center", marginBottom: "2.4rem" }}>
        <div
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--alm-accent)",
          }}
        >
          Celestial Blueprint · Natal Reading
        </div>
        <h1 style={{ fontSize: "2rem", margin: "0.5rem 0 0.3rem" }}>
          {payload.place ?? natal.place ?? "Untitled nativity"}
        </h1>
        <p style={{ color: "var(--alm-muted)", fontSize: "0.85rem" }}>
          {payload.local_dt.replace("T", " · ")} local
          {payload.lat != null && payload.lon != null ? ` · ${payload.lat}°, ${payload.lon}°` : ""}
          {payload.tz_name ? ` · ${payload.tz_name}` : ""}
        </p>
      </header>

      {/* Wheel plate */}
      <figure className="alm-figure">
        <NatalPlate natal={natal} />
        <figcaption>The natal wheel — inner ring nativity, drawn to measure.</figcaption>
      </figure>

      <hr className="alm-rule" />

      {/* Positions & Houses */}
      <h2 className="alm-head">Positions &amp; Houses</h2>
      <table>
        <thead>
          <tr>
            <th>Body</th>
            <th>Position</th>
            <th>Motion</th>
            <th>House</th>
          </tr>
        </thead>
        <tbody>
          {natal.bodies.map((b) => (
            <tr key={b.name}>
              <td>
                {b.glyph} {b.name}
              </td>
              <td>
                {b.sign} {b.degree_str}
              </td>
              <td>{b.retrograde ? "℞ retrograde" : "direct"}</td>
              <td>{ordinalHouse(b.house)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Aspects */}
      <h2 className="alm-head">Aspects</h2>
      {natal.aspects.map((a, i) => {
        const text = aspectText(a.type);
        return (
          <details key={i} style={{ marginBottom: "0.35rem" }}>
            <summary style={{ cursor: "pointer", fontSize: "0.86rem" }}>
              {a.a_name} {a.glyph} {a.b_name} · orb {a.orb.toFixed(1)}°
            </summary>
            {text && (
              <div className="prose-paper" style={{ padding: "0.4rem 0.8rem", fontSize: "0.84rem" }}>
                <Markdown text={text} />
              </div>
            )}
          </details>
        );
      })}

      <hr className="alm-rule" />

      {/* The Sky Now */}
      <h2 className="alm-head">The Sky Now</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--alm-muted)" }}>
        Computed {fmtUTC(transits.transit_utc)}. Tightest five contacts:
      </p>
      <table>
        <tbody>
          {[...transits.triggers]
            .sort((a, b) => a.orb - b.orb)
            .slice(0, 5)
            .map((t, i) => (
              <tr key={i}>
                <td>
                  transiting {t.transit} {t.transit_sign} {t.transit_degree}
                  {t.transit_retrograde ? " ℞" : ""}
                </td>
                <td>{t.aspect}</td>
                <td>
                  natal {t.natal} {t.natal_sign} {t.natal_degree}
                </td>
                <td>orb {t.orb.toFixed(1)}°</td>
              </tr>
            ))}
        </tbody>
      </table>

      {/* Coming Attractions */}
      <h2 className="alm-head">Coming Attractions</h2>
      {curated.length === 0 && (
        <p style={{ fontSize: "0.85rem", color: "var(--alm-muted)" }}>Nothing flagged for the year ahead.</p>
      )}
      {curated.map((e: TimelineEvent) => (
        <section key={e.event_id} style={{ marginBottom: "1.1rem" }}>
          <p style={{ fontSize: "0.86rem" }}>
            <strong>
              {e.date.slice(0, 10)} — {e.event}
            </strong>
            {e.position_str ? `, ${e.position_str}` : ""}
            <span style={{ color: "var(--alm-accent)" }}> ★</span>
          </p>
          <p style={{ fontSize: "0.84rem", color: "var(--alm-muted)" }}>{e.interpretation}</p>
        </section>
      ))}

      {/* Stations & Eclipses */}
      <h2 className="alm-head">Stations &amp; Eclipses</h2>
      <ul style={{ fontSize: "0.85rem" }}>
        {stations.map((e) => (
          <li key={e.event_id}>{e.date.slice(0, 10)} — {e.event}</li>
        ))}
        {eclipses.map((e) => (
          <li key={e.event_id}>
            {e.date.slice(0, 10)} — {e.event}
            {e.position_str ? `, ${e.position_str}` : ""} ☊ axis
          </li>
        ))}
      </ul>

      {/* Harmonic Resonance summary */}
      <h2 className="alm-head">Harmonic Resonance</h2>
      <p style={{ fontSize: "0.85rem" }}>
        Adjacent planetary periods fall on small-integer ratios (mean deviation ω ≈{" "}
        {worstOmega.toFixed(3)} worst-case) — the same commensurabilities the tradition formalized as
        trine (3:1) and opposition (2:1). Titius–Bode, by contrast, mispredicts Pluto by ×
        {harmonics.summary.tb_pluto_fail.toFixed(2)}.
      </p>

      {/* Colophon */}
      <footer style={{ marginTop: "3rem", fontSize: "0.72rem", color: "var(--alm-muted)", textAlign: "center" }}>
        Set in the system&rsquo;s old-style serif · computed with Swiss Ephemeris ·{" "}
        {new Date().getFullYear()}
      </footer>
    </>
  );
}

/** Inline SVG plate: simplified natal wheel (rings + glyphs), print-safe and self-contained. */
function NatalPlate({ natal }: { natal: Chart }) {
  const C = 200;
  const R = 180;
  const asc = natal.angles.asc;
  const pol = (lonDeg: number, r: number): [number, number] => {
    const a = ((180 + (lonDeg - asc)) * Math.PI) / 180;
    return [C + r * Math.cos(a), C - r * Math.sin(a)];
  };
  return (
    <svg viewBox="0 0 400 400" width="100%" role="img" aria-label="Natal wheel plate">
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--alm-rule)" strokeWidth="1" />
      <circle cx={C} cy={C} r={R - 36} fill="none" stroke="var(--alm-rule)" strokeWidth="0.5" />
      {Array.from({ length: 12 }, (_, i) => i * 30).map((l) => {
        const [x1, y1] = pol(l, R);
        const [x2, y2] = pol(l, R - 36);
        return (
          <line key={l} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--alm-rule)" strokeWidth="0.5" />
        );
      })}
      {natal.aspects
        .filter((a) => a.orb <= 3)
        .map((a, i) => {
          const p1 = natal.bodies.find((b) => b.name === a.a_name);
          const p2 = natal.bodies.find((b) => b.name === a.b_name);
          if (!p1 || !p2) return null;
          const [x1, y1] = pol(p1.lon, R - 36);
          const [x2, y2] = pol(p2.lon, R - 36);
          const soft = [0, 60, 120].includes(Math.round(a.angle));
          return (
            <line
              key={`asp-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={soft ? "var(--alm-accent)" : "var(--alm-muted)"}
              strokeWidth="0.6"
              opacity="0.55"
            />
          );
        })}
      {natal.bodies.map((b) => {
        const [x, y] = pol(b.lon, R - 18);
        return (
          <text
            key={b.name}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="13"
            fill="currentColor"
          >
            {b.glyph}
          </text>
        );
      })}
    </svg>
  );
}
