// Offline vector basemap: renders embedded world land polygons as an SVG
// overlay so the map needs zero network tile requests (spec §5 Offline Mode).
import { useMemo } from "react";
import { GeoJSON } from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { feature } from "topojson-client";
import land110m from "world-atlas/land-110m.json";

let _land: FeatureCollection | null = null;

export function useLandLayer(): FeatureCollection | null {
  return useMemo(() => {
    if (_land) return _land;
    try {
      const topo = land110m as unknown as Parameters<typeof feature>[0];
      const fc = feature(topo, (land110m as unknown as { objects: { land: never } }).objects.land) as unknown as FeatureCollection;
      _land = fc;
      return fc;
    } catch (e) {
      console.error("basemap load failed", e);
      return null;
    }
  }, []);
}

const STYLE = {
  color: "#3f3f46",
  weight: 0.6,
  fillColor: "#1c1c21",
  fillOpacity: 0.92,
};

export function LandBasemap() {
  const land = useLandLayer();
  if (!land) return null;
  return <GeoJSON key="land" data={land} style={STYLE} interactive={false} />;
}
