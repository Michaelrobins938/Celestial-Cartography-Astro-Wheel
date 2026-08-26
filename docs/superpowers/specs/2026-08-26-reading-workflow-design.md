# Reading Workflow — Design Spec

**Date:** 2026-08-26 · **Status:** approved · **Hallmark:** Long Document / Almanac / editorial-almanac tone

## Goal

Turn the Celestial Blueprint from a live instrument into a tool that produces durable artifacts:
a comprehensive printed reading (PDF), instant wheel PNGs, a dated readings journal with
reproducible sky snapshots, and stateless shareable chart links. Single-user; no auth.

## Decisions locked during brainstorming

| Question | Decision |
| --- | --- |
| "Better" axis | Reading workflow (export, notes, sharing) |
| Export audience | Both: client-ready PDF **and** personal reference sheets |
| Sharing model | Stateless URL hash (birth data base64url in `#p=…`) |
| Report scope | Comprehensive: natal core + current-sky forecast |
| Notes model | Most detailed: structured fields + markdown body + sky snapshot |
| Tone (report document) | Almanac — warm paper, roman-serif, ephemeris-book character |

## 1. ReportView (`Report ⎙` tab)

Long Document macrostructure rendered as an A4 paper sheet inside the existing dark chrome.
Screen shows exactly what prints.

- **Sections (DOM order):** Masthead (name, birth data) → Wheel plate (inline figure,
  sized to measure) → Positions & Houses → Aspects → The Sky Now (transits table) →
  Coming Attractions (timeline events, curated ★ interpretations) → Stations & Eclipses →
  Harmonic Resonance summary → Colophon.
- **Data:** existing endpoints only — `/api/chart`, `/api/transits`, `/api/timeline`,
  `/api/harmonics`. Interpretations from existing libs + curated seed text.
- **Type:** system serif stack (`Iowan Old Style, Palatino Linotype, Georgia, serif`);
  measure 60–65ch; line-height ≥1.65; inline small-cap section heads per Long Document.
- **Tokens (Almanac):** paper `oklch(96% 0.012 85)` · ink `oklch(24% 0.012 85)` ·
  accent ochre `oklch(55% 0.11 65)` · hairline rule `oklch(80% 0.02 85)` · muted `oklch(45% 0.015 85)`.
- **Print:** `@page { size: A4; margin: 18mm }`; print CSS hides app chrome, forces paper
  colors; "Export PDF" = `window.print()`.
- **Motion:** none (reveal: none). App chrome stays motion-cut.

## 2. Wheel PNG export

Serialize live wheel `<svg>` → `XMLSerializer` → blob URL → `<img>` → canvas @2× →
`canvas.toBlob` → download `chart-{profile}-{date}.png`. Button available on every chart tab.
No new dependencies.

## 3. Readings journal

New table:

```sql
CREATE TABLE readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,          -- ISO UTC
  title TEXT NOT NULL,
  focus TEXT,                        -- free tag: career / love / eclipse …
  body_md TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT                 -- frozen transits payload + selected timeline event(s)
);
```

- Endpoints: `GET/POST /api/profiles/{pid}/readings`, `PUT/DELETE /api/readings/{id}`.
- Snapshot button freezes the *current* transits payload (+ any selected timeline event)
  into `snapshot_json` so any reading can be re-rendered exactly later.
- UI: collapsible right-rail panel on chart tabs; list of entries (date, title, focus);
  entry view = markdown body + re-rendered snapshot section. Existing dark chrome preserved.

## 4. Stateless permalinks

- Birth form writes `#p=<base64url(JSON{name,date,time,tz,lat,lon,place,house_system})>`.
- On boot: if hash present, it wins over the stored last-profile; show dismissible
  "shared chart" badge. Copy-link button beside Save.
- Encoder lives in `frontend/src/lib/share.ts`; round-trip unit-tested.

## 5. Deployment topology

- Frontend: Vercel static build. All API calls go through `const API_BASE =
  import.meta.env.VITE_API_BASE ?? ""` so the deployed site can point at a hosted backend;
  local dev keeps the vite proxy (`/api` → `localhost:8777`).
- Backend: not in this deploy (FastAPI + pyswisseph needs a long-running host — Render/Fly).
  Documented in README.

## Error handling & tests

- Backend: readings CRUD happy-path + validation tests; share-code round-trip covered by
  frontend unit test.
- Frontend: `tsc -b` clean; manual verification of PNG export + print preview at A4.
- Graceful states: report renders a clear inline notice if any endpoint fails mid-assembly;
  journal handles empty state.

## Out of scope

Auth/multi-user, server-side PDF generation, synastry/composites, LLM interpretations.
