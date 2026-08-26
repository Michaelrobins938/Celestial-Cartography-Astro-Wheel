# Celestial Blueprint

<p align="center">
  <a href="https://celestial-blueprint-xi.vercel.app"><img src="https://img.shields.io/badge/Live%20demo%20%E2%80%94%20Vercel-000000?logo=vercel&logoColor=white" alt="Live demo on Vercel"/></a>
  <img src="https://img.shields.io/badge/deploys%20via-GitHub%20%E2%86%92%20Vercel-6600cc" alt="Deploys via GitHub to Vercel"/>
</p>

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

Everything runs on **Vercel** — pushes to `master` deploy automatically
(GitHub → Vercel integration).

| Piece | How it runs | Notes |
| --- | --- | --- |
| Frontend | static build (`frontend/dist`) | `vercel.json` drives the build |
| Backend | serverless Python fn (`api/index.py` mounts FastAPI) | `/api/*` rewritten same-origin; ephemeris bundled from `backend/data` |

**Data persistence:** charting is stateless, but profiles + readings journal are stored
in **browser localStorage** (per device/browser). The backend's SQLite endpoints remain
available for self-hosted deployments with a durable database — on Vercel the function
filesystem is ephemeral, so `CELESTIAL_DB=/tmp/celestial.db` only survives per warm
instance and is not used for durable storage.

### Self-hosting alternatives

- `render.yaml` (repo root) deploys the backend as a Render web service — set
  `VITE_API_BASE` on the frontend to its URL if you prefer a long-running process.
- Any host running `uvicorn app.main:app` works; point the frontend at it via
  `VITE_API_BASE`.

## Design docs

- `docs/superpowers/specs/2026-08-26-reading-workflow-design.md` — reading workflow
  (PDF report, PNG export, readings journal, stateless share links)
- `astrology_timeline.xlsx` — source of the curated interpretation seed

_Deploys automatically from `master` via the GitHub → Vercel integration._
