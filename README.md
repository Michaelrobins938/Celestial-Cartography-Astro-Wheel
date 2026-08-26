# Celestial Blueprint

Full-stack astrology charting tool — Swiss Ephemeris precision, bi-wheel visualization,
transit timeline with curated interpretations, and harmonic orbit resonance analysis.

## Architecture

- **`backend/`** — FastAPI + pyswisseph (Python). Natal / transits / secondary progressions /
  draconic charts, Placidus · Koch · Whole Sign · Equal houses, astrocartography lines +
  parans, cycles engine (retrograde stations, ingresses, lunations, eclipses), xlsx-seeded
  curated timeline interpretations, harmonic orbit resonance analysis. SQLite for profiles.
  Ephemeris files bundled in `backend/data/`.
- **`frontend/`** — React 19 + Vite 7 + Tailwind v4. Bi-wheel SVG chart with overlay rings
  (transits / progressions / draconic), clickable event timeline → bi-wheel at that moment,
  nodal-axis eclipse highlighting, ACG map (Leaflet), transit clock, Cycles + Harmonics tabs.

## Local development

```bash
# backend — port 8777
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --port 8777

# frontend — port 5173 (proxies /api → localhost:8777)
cd frontend
npm install && npm run dev
```

Seed profile: 1995-08-31 07:08, Fort Worth TX.

## Deployment

| Piece | Host | Notes |
| --- | --- | --- |
| Frontend | Vercel | live; repo-connected or CLI deploys |
| Backend | Render | `render.yaml` blueprint in repo root |

After the Render service exists:

1. Copy its URL (e.g. `https://celestial-blueprint-api.onrender.com`).
2. In Vercel → project → Settings → Environment Variables, set
   `VITE_API_BASE = https://celestial-blueprint-api.onrender.com`.
3. Redeploy the frontend.

Until `VITE_API_BASE` is set, deployed builds call same-origin `/api/*` and show errors —
local dev is unaffected (vite proxy).

⚠️ Render free tier: SQLite resets on deploy/restart (ephemeral disk). Attach a disk for
persistence, or treat profiles as disposable.

## Design docs

- `docs/superpowers/specs/2026-08-26-reading-workflow-design.md` — reading workflow
  (PDF report, PNG export, readings journal, stateless share links)
- `astrology_timeline.xlsx` — source of the curated interpretation seed
