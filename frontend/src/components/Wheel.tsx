// Interactive SVG astrology wheel.
//
// Conventions (must match backend CONVENTIONS):
// - Ecliptic longitude 0-360, Aries = 0.
// - The Ascendant sits exactly at the left horizon (9 o'clock); zodiac
//   increases counter-clockwise.
import { useMemo } from "react";
import type { BodyPos, Chart } from "../types";
import { SIGN_GLYPHS, SIGN_ELEMENT, ELEMENT_COLORS, norm, angDiff, ordinalHouse } from "../lib/format";

const CX = 400;
const CY = 400;
const R_SIGN_OUT = 392;
const R_SIGN_IN = 344;
const R_CUSP_OUT = 344;
const R_HOUSE_NUM = 320;
const R_PLANET_OVERLAY = 296;
const R_PLANET_BASE = 252;
const R_ASPECT = 208;

function polar(r: number, degLon: number, asc: number): [number, number] {
  const a = ((180 + (degLon - asc)) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

/** Spread planet glyphs so overlapping degrees remain readable. */
function spread(bodies: BodyPos[], minSepDeg = 7): Map<number, number> {
  const sorted = [...bodies].sort((a, b) => a.lon - b.lon);
  const out = new Map<number, number>();
  // two passes over the ring to handle wrap-around clusters
  let prevLon = -Infinity;
  for (const b of sorted) {
    const lon = b.lon + (out.get(b.id) ?? 0);
    if (prevLon >= 0 && lon - prevLon < minSepDeg) {
      const newLon = prevLon + minSepDeg;
      out.set(b.id, newLon - b.lon);
      prevLon = newLon;
    } else {
      out.set(b.id, 0);
      prevLon = lon;
    }
  }
  // pull back the tail if it wrapped past 360+30
  const last = sorted[sorted.length - 1];
  const lastDrawn = last.lon + (out.get(last.id) ?? 0);
  if (lastDrawn > 360 && sorted.length > 1) {
    let nextMax = 360 + 30;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const b = sorted[i];
      let d = out.get(b.id) ?? 0;
      const maxHere = nextMax - minSepDeg;
      const drawn = b.lon + d;
      if (drawn > maxHere) {
        d = maxHere - b.lon;
        out.set(b.id, d);
        nextMax = maxHere;
      } else break;
    }
  }
  return out;
}

function PlanetGlyph({
  body,
  r,
  asc,
  shift,
  onClick,
  dim,
}: {
  body: BodyPos;
  r: number;
  asc: number;
  shift: number;
  onClick?: (b: BodyPos) => void;
  dim?: boolean;
}) {
  const [gx, gy] = polar(r, body.lon + shift, asc);
  const tickIn = polar(r - 14, body.lon, asc);
  const tickOut = polar(r + 14, body.lon, asc);
  return (
    <g
      className="cursor-pointer"
      opacity={dim ? 0.55 : 1}
      onClick={() => onClick?.(body)}
      data-testid={`planet-${body.name}`}
    >
      <line
        x1={tickIn[0]}
        y1={tickIn[1]}
        x2={tickOut[0]}
        y2={tickOut[1]}
        stroke="#71717a"
        strokeWidth={1}
      />
      <circle cx={gx} cy={gy} r={11} fill="#09090b" stroke="#3f3f46" strokeWidth={0.75} />
      <text
        x={gx}
        y={gy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        fill={dim ? "#a1a1aa" : "#f4f4f5"}
      >
        {body.glyph}
      </text>
      <title>{`${body.name} — ${body.position_str}${body.retrograde ? " Rx" : ""}${
        body.house ? `, ${ordinalHouse(body.house)} House` : ""
      }`}</title>
    </g>
  );
}

export interface WheelProps {
  base: Chart;
  /** Overlay bodies (transits / progressions / draconic), optional. */
  overlayBodies?: BodyPos[];
  overlayAnglesAsc?: number;
  overlayLabel?: string;
  /** Highlight an axis (e.g. lunar nodal axis for eclipses) — dashed line through center. */
  axisLon?: number;
  showAspects?: boolean;
  onSelectBody?: (b: BodyPos) => void;
  selected?: string | null;
}

export default function Wheel({
  base,
  overlayBodies,
  overlayAnglesAsc,
  overlayLabel,
  axisLon,
  showAspects = true,
  onSelectBody,
  selected,
}: WheelProps) {
  const asc = base.angles.asc;
  const mc = base.angles.mc;

  const baseShifts = useMemo(() => spread(base.bodies, 5), [base.bodies]);
  const overlayShifts = useMemo(
    () => (overlayBodies ? spread(overlayBodies, 5) : undefined),
    [overlayBodies],
  );

  // Overlay-to-base aspects for the bi-wheel (simple orb table).
  const crossAspects = useMemo(() => {
    if (!overlayBodies) return [];
    const ORBS: Record<string, { a: number; color: string; dash?: string }> = {
      conjunction: { a: 0, color: "#f97316" },
      opposition: { a: 180, color: "#a855f7" },
      trine: { a: 120, color: "#3b82f6" },
      square: { a: 90, color: "#ef4444", dash: "5 4" },
      sextile: { a: 60, color: "#22c55e", dash: "2 4" },
    };
    const out: { x1: number; y1: number; x2: number; y2: number; color: string; dash?: string; title: string }[] = [];
    for (const t of overlayBodies) {
      for (const n of base.bodies) {
        for (const [name, cfg] of Object.entries(ORBS)) {
          const orb = Math.abs(angDiff(t.lon, n.lon) - cfg.a);
          const limit = name === "conjunction" || name === "opposition" ? 8 : name === "sextile" ? 4 : 6;
          if (orb <= limit) {
            const [x1, y1] = polar(R_ASPECT, t.lon, overlayAnglesAsc ?? asc);
            const [x2, y2] = polar(R_ASPECT, n.lon, asc);
            out.push({
              x1, y1, x2, y2, color: cfg.color, dash: cfg.dash,
              title: `Transiting ${t.name} ${name} Natal ${n.name} (${orb.toFixed(1)}° orb)`,
            });
            break;
          }
        }
      }
    }
    return out;
  }, [overlayBodies, base.bodies, asc, overlayAnglesAsc]);

  return (
    <svg viewBox="0 0 800 800" className="h-full w-full select-none" data-testid="astro-wheel">
      {/* backdrop */}
      <circle cx={CX} cy={CY} r={R_SIGN_OUT} fill="#0c0c0f" stroke="#27272a" />

      {/* ---- highlighted axis (e.g. lunar nodes for eclipses) ---- */}
      {axisLon != null && (
        <g data-testid="axis-highlight">
          {[
            [polar(R_SIGN_IN, axisLon, asc), polar(R_ASPECT, axisLon, asc)],
            [polar(R_SIGN_IN, axisLon + 180, asc), polar(R_ASPECT, axisLon + 180, asc)],
          ].map(([a, b], i) => (
            <line
              key={i}
              x1={a[0]}
              y1={a[1]}
              x2={b[0]}
              y2={b[1]}
              stroke="#fbbf24"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              opacity={0.85}
            />
          ))}
          <title>{`nodal axis — ${Math.round(axisLon)}° ecliptic`}</title>
        </g>
      )}

      {/* ---- zodiac sign ring ---- */}
      {SIGN_GLYPHS.map((g, i) => {
        const startLon = i * 30;
        const [x1, y1] = polar(R_SIGN_OUT, startLon, asc);
        const [x2, y2] = polar(R_SIGN_IN, startLon, asc);
        const [mx, my] = polar((R_SIGN_OUT + R_SIGN_IN) / 2, startLon + 15, asc);
        const el = SIGN_ELEMENT[["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"][i]];
        // segment path (annular sector)
        const step = 0.5;
        let d = "";
        for (let l = startLon; l <= startLon + 30; l += step) {
          const [px, py] = polar(R_SIGN_OUT, Math.min(l, startLon + 30), asc);
          d += (d === "" ? "M" : "L") + px.toFixed(1) + " " + py.toFixed(1);
        }
        for (let l = startLon + 30; l >= startLon; l -= step) {
          const [px, py] = polar(R_SIGN_IN, Math.max(l, startLon), asc);
          d += "L" + px.toFixed(1) + " " + py.toFixed(1);
        }
        d += "Z";
        return (
          <g key={i}>
            <path d={d} fill={el ? ELEMENT_COLORS[el] : "#333"} opacity={0.08} />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3f3f46" strokeWidth={0.75} />
            <text
              x={mx}
              y={my}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={20}
              fill={ELEMENT_COLORS[el]}
              opacity={0.9}
            >
              {g}
            </text>
          </g>
        );
      })}
      <circle cx={CX} cy={CY} r={R_SIGN_IN} fill="none" stroke="#52525b" strokeWidth={1.25} />
      <circle cx={CX} cy={CY} r={R_SIGN_OUT} fill="none" stroke="#52525b" strokeWidth={1.25} />

      {/* ---- degree ticks every 5° ---- */}
      {Array.from({ length: 72 }, (_, i) => i * 5).map((l) => {
        const major = l % 30 === 0;
        if (major) return null;
        const [x1, y1] = polar(R_SIGN_OUT, l, asc);
        const [x2, y2] = polar(R_SIGN_OUT - (l % 10 === 0 ? 10 : 5), l, asc);
        return <line key={l} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#52525b" strokeWidth={0.5} />;
      })}

      {/* ---- house cusps + numbers ---- */}
      {base.cusps.map((cuspLon, i) => {
        const isAngle = i === 0 || i === 3 || i === 6 || i === 9;
        const [x1, y1] = polar(R_CUSP_OUT, cuspLon, asc);
        const [x2, y2] = polar(isAngle ? R_ASPECT : R_HOUSE_NUM + 24, cuspLon, asc);
        const [nx, ny] = polar((R_CUSP_OUT + R_HOUSE_NUM + 24) / 2, cuspLon + 15, asc);
        return (
          <g key={i}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isAngle ? "#e4e4e7" : "#3f3f46"}
              strokeWidth={isAngle ? 1.5 : 0.75}
              strokeDasharray={!isAngle ? "4 5" : undefined}
            />
            {!isAngle && (
              <text x={nx} y={ny} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#71717a">
                {i + 1}
              </text>
            )}
          </g>
        );
      })}
      {/* angle labels */}
      {(() => {
        const labels: Array<[string, number, string]> = [
          ["ASC", base.cusps[0], "#fafafa"],
          ["IC", base.cusps[3], "#d4d4d8"],
          ["DSC", base.cusps[6], "#fafafa"],
          ["MC", base.cusps[9], "#d4d4d8"],
        ];
        return labels.map(([txt, lon, fill]) => {
          const [x, y] = polar((R_SIGN_IN + R_CUSP_OUT) / 2 + 2, lon, asc);
          return (
            <text key={txt} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fill={fill}>
              {txt}
            </text>
          );
        });
      })()}

      {/* ---- aspect lines (base chart) ---- */}
      {showAspects &&
        base.aspects.map((a, i) => {
          const A = base.bodies.find((b) => b.id === a.a_id);
          const B = base.bodies.find((b) => b.id === a.b_id);
          if (!A || !B) return null;
          const [x1, y1] = polar(R_ASPECT, A.lon, asc);
          const [x2, y2] = polar(R_ASPECT, B.lon, asc);
          const dash =
            a.type === "square" ? "6 4" :
            a.type === "sextile" ? "2 5" :
            a.type === "opposition" ? undefined :
            undefined;
          const isSel =
            selected != null && (A.name === selected || B.name === selected);
          return (
            <line
              key={`asp-${i}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={a.color}
              strokeWidth={isSel ? 2 : 1}
              opacity={selected && !isSel ? 0.15 : 0.65}
              strokeDasharray={dash ?? (a.style === "dashed" ? "6 4" : undefined)}
            >
              <title>{`${a.label} — ${a.orb.toFixed(2)}° ${a.applying ? "applying" : "separating"}`}</title>
            </line>
          );
        })}

      {/* ---- cross-chart aspect lines (bi-wheel) ---- */}
      {crossAspects.map((c, i) => (
        <line key={`cross-${i}`} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={c.color} strokeWidth={0.9} opacity={0.5} strokeDasharray={"3 4"}>
          <title>{c.title}</title>
        </line>
      ))}

      {/* ---- base planets ---- */}
      {base.bodies.map((b) => (
        <PlanetGlyph
          key={`base-${b.id}`}
          body={b}
          r={R_PLANET_BASE}
          asc={asc}
          shift={baseShifts.get(b.id) ?? 0}
          onClick={onSelectBody}
          dim={selected != null && selected !== b.name}
        />
      ))}

      {/* ---- overlay planets (bi-wheel) ---- */}
      {overlayBodies?.map((b) => (
        <PlanetGlyph
          key={`ovl-${b.id}-${b.lon}`}
          body={b}
          r={R_PLANET_OVERLAY}
          asc={overlayAnglesAsc ?? asc}
          shift={overlayShifts?.get(b.id) ?? 0}
          onClick={onSelectBody}
        />
      ))}

      {/* ---- MC line marker through center ---- */}
      <line
        x1={polar(R_ASPECT, mc, asc)[0]}
        y1={polar(R_ASPECT, mc, asc)[1]}
        x2={polar(R_ASPECT, norm(mc + 180), asc)[0]}
        y2={polar(R_ASPECT, norm(mc + 180), asc)[1]}
        stroke="#3f3f46"
        strokeWidth={0.5}
      />
      <circle cx={CX} cy={CY} r={R_ASPECT} fill="none" stroke="#27272a" strokeWidth={0.75} />
      <circle cx={CX} cy={CY} r={3} fill="#52525b" />

      {overlayLabel && (
        <text x={CX} y={CY - R_ASPECT + 18} textAnchor="middle" fontSize={12} fill="#a1a1aa">
          {overlayLabel}
        </text>
      )}
    </svg>
  );
}
