# Celestial Blueprint — Design

**Date:** 2026-08-25
**Status:** Approved (user green-lit Approach 1, end-to-end sprint)

## Overview

"Celestial Blueprint: The Astro-Mapper & Transit Synthesizer" — a full-stack, local,
interactive astrology charting, transit tracking, and astrocartography mapping tool.
Built for professional astrologers and personal synthesis. Fully offline-capable.

## Architecture

Monorepo, API-first. Backend FastAPI + `pyswisseph`; frontend React (Vite) + TypeScript +
Tailwind; custom SVG wheel; Leaflet + bundled Natural Earth GeoJSON vector basemap;
SQLite via SQLAlchemy. OpenAPI schema auto-generates TS types.

```
/backend
  app/
    main.py            # FastAPI app, OpenAPI schema
    ephemeris/         # pyswisseph wrapper (positions, houses, aspects)
    charts/            # natal, transits, progressions, draconic services
    astrocartography/  # ACG line solver + parans
    geo/               # gazetteer lookup + historical tz resolution
    models.py          # SQLAlchemy (profiles, saved locations)
    schemas.py         # Pydantic response models
  data/                # bundled .se1 ephemeris files, gazetteer
  tests/
/frontend              # Vite + React + TS + Tailwind
  src/
    api/               # generated TS types from OpenAPI
    components/wheel/  # SVG natal wheel (custom trig)
    components/map/    # Leaflet + vector basemap + ACG lines
    components/dash/   # sidebar, transit clock, interpretive text
CONVENTIONS.md         # §0 decisions (see file)
```

## Conventions

See `CONVENTIONS.md`. Key pins: Tropical zodiac; Placidus default (Whole Sign + Koch
toggles, Whole Sign fallback on polar latitudes with UI warning); ecliptic longitude for
planets, RAMC for houses; Aries=0°, 0–360°; UTC storage; retrograde from speed sign;
Naibod-arc-in-RA progressed angles (labeled in UI); Draconic = tropical − mean node.

## Input pipeline

Local civil date/time + place → gazetteer geocode → `timezonefinder`+`tzdata` historical
offset → UTC → ephemeris. Direct UTC + lat/long bypass available.

## Calculation engine

- **Positions:** Sun→Pluto, Chiron, mean Node, Ceres/Pallas/Vesta/Juno, Lilith, Part of
  Fortune, Vertex — ecliptic lon/lat, speed, house.
- **Houses:** Placidus/Koch/Whole Sign from RAMC; monotonicity + wraparound-safe; polar
  fallback.
- **Aspects:** full orb table (spec §4); symmetric grid; color-coded lines.
- **Astrocartography:** ASC/DSC/MC/IC lines solved at ~hundreds of longitude steps (denser
  near poles); paran crossings as togglable overlay; click-to-relocate recomputes house
  cusps at clicked lat/long (distinct from local-space chart).
- **Transits/progressions:** slider + real-time overlay; progression date selectable
  (default now).

## Frontend

- **Wheel:** custom SVG — outer sign ring (glyphs + element colors), middle house-cusp
  ring (ASC at 9 o'clock), inner planet glyphs (hover coordinates), aspect lines
  (Blue/Red/Orange/Purple + line-style fallback for a11y), dual-wheel overlay toggle.
- **Map:** Leaflet + Natural Earth GeoJSON vector basemap (offline), planet-colored ACG
  lines, paran overlay, click-to-relocate.
- **Dashboard:** sortable sidebar (natal/minor/progressed/draconic toggles), transit clock
  + active-trigger list, markdown interpretive text on click.
- **Theme:** Tailwind slate/zinc dark, "astronomical dashboard" vibe.

## Testing & validation gate

Unit tests: sign-boundary handling (29°59′ vs 0°00′), house-cusp monotonicity,
retrograde-vs-speed-sign, aspect symmetry, house-assignment regression (Sun 12th / Mercury
1st given the seed). Round-trip test: compute chart from the seed input and diff against
the seed profile's degrees.

## Error handling

Polar-latitude Placidus failure → fallback + warning; missing ephemeris file → clear setup
error; unknown place → nearest gazetteer match; timezone edge cases via tzdata.