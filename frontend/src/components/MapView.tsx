// Astrocartography map: ASC/DSC/MC/IC lines per planet + paran crossings.
// Clicking the map computes a relocated natal chart (house cusps recomputed
// for the clicked coordinate at the original UTC birth moment).
import { useMemo } from "react";
import { MapContainer, CircleMarker, Tooltip, useMapEvents, Polyline } from "react-leaflet";
import type { Astrocartography, LineKind } from "../types";
import { LandBasemap } from "./LandBasemap";

const LINE_LABEL: Record<LineKind, string> = {
  asc: "Rising",
  dsc: "Setting",
  mc: "Culminating",
  ic: "Anti-culm.",
};

const PLANET_NAMES: Record<number, string> = {
  0: "Sun", 1: "Moon", 2: "Mercury", 3: "Venus", 4: "Mars",
  5: "Jupiter", 6: "Saturn", 7: "Uranus", 8: "Neptune", 9: "Pluto",
};

function ClickCatcher({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export interface MapViewProps {
  acg: Astrocartography | null;
  enabledPlanets: Set<number>;
  showParans: boolean;
  onMapClick: (lat: number, lon: number) => void;
  markers: Array<{ lat: number; lon: number; label: string; color: string }>;
}

export default function MapView({ acg, enabledPlanets, showParans, onMapClick, markers }: MapViewProps) {
  const planetLines = useMemo(() => {
    if (!acg) return [];
    const out: Array<{ key: string; color: string; positions: [number, number][]; title: string }> = [];
    for (const p of Object.values(acg.planets)) {
      if (!enabledPlanets.has(p.id)) continue;
      for (const kind of ["mc", "ic"] as LineKind[]) {
        // meridians may cross the antimeridian — split on big jumps
        let seg: [number, number][] = [];
        let prevLon: number | null = null;
        const flush = () => {
          if (seg.length > 1) out.push({ key: `${p.id}-${kind}-${out.length}`, color: p.color, positions: seg, title: `${p.name} ${LINE_LABEL[kind]} line` });
          seg = [];
        };
        for (const pt of p.lines[kind]) {
          if (prevLon !== null && Math.abs(pt.lon - prevLon) > 180) flush();
          seg.push([pt.lat, pt.lon]);
          prevLon = pt.lon;
        }
        flush();
      }
      for (const kind of ["asc", "dsc"] as LineKind[]) {
        let seg: [number, number][] = [];
        let prevLat: number | null = null;
        const flush = () => {
          if (seg.length > 1) out.push({ key: `${p.id}-${kind}-${out.length}`, color: p.color, positions: seg, title: `${p.name} ${LINE_LABEL[kind]} line` });
          seg = [];
        };
        for (const pt of p.lines[kind]) {
          if (prevLat !== null && Math.abs(pt.lat - prevLat) > 40) flush();
          seg.push([pt.lat, pt.lon]);
          prevLat = pt.lat;
        }
        flush();
      }
    }
    return out;
  }, [acg, enabledPlanets]);

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      minZoom={1}
      maxZoom={8}
      worldCopyJump
      preferCanvas
      className="h-full w-full"
      data-testid="acg-map"
    >
      <LandBasemap />
      {planetLines.map((l) => (
        <Polyline key={l.key} positions={l.positions} pathOptions={{ color: l.color, weight: 1.6, opacity: 0.75 }}>
          <Tooltip sticky>{l.title}</Tooltip>
        </Polyline>
      ))}
      {showParans &&
        acg?.parans.map((par, i) => (
          <CircleMarker
            key={`paran-${i}`}
            center={[par.lat, par.lon]}
            radius={4}
            pathOptions={{ color: "#fafafa", weight: 1, fillColor: "#facc15", fillOpacity: 0.9 }}
          >
            <Tooltip>
              {`${PLANET_NAMES[par.a_id] ?? par.a_id} ${LINE_LABEL[par.a_angle]} × ${
                PLANET_NAMES[par.b_id] ?? par.b_id
              } ${LINE_LABEL[par.b_angle]} — ${par.lat.toFixed(1)}°, ${par.lon.toFixed(1)}°`}
            </Tooltip>
          </CircleMarker>
        ))}
      {markers.map((mk, i) => (
        <CircleMarker
          key={`mk-${i}`}
          center={[mk.lat, mk.lon]}
          radius={6}
          pathOptions={{ color: mk.color, weight: 2, fillColor: mk.color, fillOpacity: 0.35 }}
        >
          <Tooltip permanent direction="top">{mk.label}</Tooltip>
        </CircleMarker>
      ))}
      <ClickCatcher onClick={onMapClick} />
    </MapContainer>
  );
}
