# Reading Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved reading-workflow spec: readings journal (backend + UI), stateless share permalinks, wheel PNG export, and the comprehensive Almanac PDF report view.

**Architecture:** Four vertical slices, each independently shippable: (1) SQLite `readings` table + CRUD endpoints following the existing plain-function endpoint style; (2) base64url share codec in a new `lib/share.ts` wired into `App.tsx`'s boot path; (3) SVG→canvas PNG export utility; (4) a `ReportView` that composes existing endpoints into an A4 print document styled with Hallmark-Almanac tokens. The journal panel snapshots live transit payloads as JSON strings — reproducible readings without any new backend compute.

**Tech Stack:** FastAPI + SQLAlchemy (existing), React 19 + TypeScript + Tailwind v4 (existing). **Zero new dependencies** on either side.

## Global Constraints

- Offline-first: NO new npm packages, NO new pip packages, NO webfont downloads.
- Backend port 8777, frontend dev port 5173 (vite proxy `/api` → 8777).
- Backend tests follow the existing plain-assert script style (`backend/tests/test_validation.py` pattern), run with `.venv/bin/python tests/test_X.py`.
- Frontend gate: `cd frontend && npx tsc -b --force` exits clean; production build `npm run build` succeeds.
- Preserve the dark zinc/indigo app chrome and the glyph font stack in `frontend/src/index.css`. Almanac paper tokens apply ONLY inside the report sheet (scoped `.almanac` class).
- All API calls go through the `u()` helper / `API_BASE` in `frontend/src/api.ts` (already deployed wiring).
- Commit after every task. Messages match repo style (imperative, descriptive first line).
- Spec: `docs/superpowers/specs/2026-08-26-reading-workflow-design.md`.

---

### Task 1: Backend — `Reading` model + CRUD endpoints

**Files:**
- Modify: `backend/app/models.py` (add model after `EventInterpretation`, ~line 62)
- Modify: `backend/app/main.py` (add schemas near other request models ~line 60; add endpoints after the profiles block ~line 215)
- Create: `backend/tests/test_readings.py`

**Interfaces:**
- Consumes: `models.SessionLocal`, `models.Base`, `HTTPException`, `BaseModel` (all existing).
- Produces: `models.Reading`; endpoints `list_readings(pid)`, `create_reading(pid, req)`, `update_reading(rid, req)`, `delete_reading(rid)`; pydantic `ReadingCreate`, `ReadingUpdate`. Reading dict shape consumed by Task 5:
  `{id, profile_id, created_at (ISO str|null), title, focus, body_md, snapshot_json}`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_readings.py`:

```python
"""Readings CRUD tests. Run: cd backend && .venv/bin/python tests/test_readings.py

Swaps models.engine/SessionLocal onto a temp-file SQLite BEFORE importing app.main
(main calls models.init_db() at import time; endpoint fns resolve SessionLocal at
call time, so the swap isolates the real celestial.db completely).
"""

from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_tmp = tempfile.mkdtemp()

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: E402

_test_engine = create_engine(
    f"sqlite:///{_tmp}/test.db", connect_args={"check_same_thread": False}
)
models.engine = _test_engine
models.SessionLocal = sessionmaker(bind=_test_engine, autoflush=False, autocommit=False)
models.init_db()

# Seed one profile directly.
with models.SessionLocal() as s:
    p = models.Profile(name="Test Native", birth_local="1995-08-31T07:08:00",
                       place_name="Fort Worth", lat=32.7555, lon=-97.3308,
                       tz_name="America/Chicago", house_system="P")
    s.add(p)
    s.commit()
    PID = p.id

import importlib  # noqa: E402

from fastapi import HTTPException  # noqa: E402

main = importlib.import_module("app.main")

# CREATE
r = main.create_reading(PID, main.ReadingCreate(
    title="Saturn opposition debrief", focus="career",
    body_md="Strong Saturn themes.\n\n- delayed gratification\n- structure holds"))
assert isinstance(r["id"], int) and r["title"].startswith("Saturn"), r
RID = r["id"]
assert r["created_at"] is not None and r["created_at"].endswith("Z"), r

# LIST (ordered newest first)
rows = main.list_readings(PID)
assert len(rows) == 1 and rows[0]["id"] == RID, rows

# UPDATE (partial)
upd = main.update_reading(RID, main.ReadingUpdate(body_md="revised after session"))
assert upd["body_md"] == "revised after session"
assert upd["title"].startswith("Saturn"), upd  # untouched field preserved

# DELETE
assert main.delete_reading(RID) == {"ok": True}
assert main.list_readings(PID) == []

# UNKNOWN PROFILE -> 404
try:
    main.create_reading(99999, main.ReadingCreate(title="ghost"))
    raise SystemExit("FAIL: expected HTTPException 404 for unknown profile")
except HTTPException as e:
    assert e.status_code == 404, e.status_code

# UNKNOWN READING -> 404
try:
    main.delete_reading(99999)
    raise SystemExit("FAIL: expected HTTPException 404 for unknown reading")
except HTTPException as e:
    assert e.status_code == 404, e.status_code

print("readings CRUD: all assertions passed")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python tests/test_readings.py`
Expected: FAIL — `AttributeError: module 'app.models' has no attribute 'Reading'` (or similar).

- [ ] **Step 3: Implement the model**

In `backend/app/models.py`, add after the `EventInterpretation` class:

```python
class Reading(Base):
    """A dated session note attached to a profile, with optional frozen sky snapshot."""

    __tablename__ = "readings"

    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    title = Column(String, nullable=False)
    focus = Column(String)                      # free tag: career / love / eclipse …
    body_md = Column(String, default="")
    snapshot_json = Column(Text)                # frozen TransitsPayload + selected timeline event
```

Also extend the SQLAlchemy import at line 9 to include `Text`:

```python
from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine
```

- [ ] **Step 4: Implement the endpoints**

In `backend/app/main.py`, add request models next to `ProfileCreate`:

```python
class ReadingCreate(BaseModel):
    title: str = Field(..., min_length=1)
    focus: str | None = None
    body_md: str = ""
    snapshot_json: str | None = None


class ReadingUpdate(BaseModel):
    title: str | None = None
    focus: str | None = None
    body_md: str | None = None
    snapshot_json: str | None = None
```

Add endpoints after the `delete_profile` function:

```python
def _reading_dict(r: models.Reading) -> dict:
    return {
        "id": r.id,
        "profile_id": r.profile_id,
        "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
        "title": r.title,
        "focus": r.focus,
        "body_md": r.body_md,
        "snapshot_json": r.snapshot_json,
    }


@app.get("/api/profiles/{pid}/readings")
def list_readings(pid: int):
    with models.SessionLocal() as s:
        rows = (
            s.query(models.Reading)
            .filter_by(profile_id=pid)
            .order_by(models.Reading.created_at.desc(), models.Reading.id.desc())
            .all()
        )
        return [_reading_dict(r) for r in rows]


@app.post("/api/profiles/{pid}/readings", status_code=201)
def create_reading(pid: int, req: ReadingCreate):
    with models.SessionLocal() as s:
        if not s.query(models.Profile).get(pid):
            raise HTTPException(404, "Profile not found")
        r = models.Reading(
            profile_id=pid, title=req.title, focus=req.focus,
            body_md=req.body_md, snapshot_json=req.snapshot_json,
        )
        s.add(r)
        s.commit()
        s.refresh(r)
        return _reading_dict(r)


@app.put("/api/readings/{rid}")
def update_reading(rid: int, req: ReadingUpdate):
    with models.SessionLocal() as s:
        r = s.query(models.Reading).get(rid)
        if not r:
            raise HTTPException(404, "Reading not found")
        for k, v in req.model_dump(exclude_none=True).items():
            setattr(r, k, v)
        s.commit()
        s.refresh(r)
        return _reading_dict(r)


@app.delete("/api/readings/{rid}")
def delete_reading(rid: int):
    with models.SessionLocal() as s:
        r = s.query(models.Reading).get(rid)
        if not r:
            raise HTTPException(404, "Reading not found")
        s.delete(r)
        s.commit()
        return {"ok": True}
```

Note: `update_reading` uses `exclude_none=True`, so `null` cannot clear a field — acceptable for v1 (the UI never sends null patches).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/python tests/test_readings.py`
Expected: `readings CRUD: all assertions passed`

Also confirm the validation suite still passes: `cd backend && .venv/bin/python tests/test_validation.py` (expect its existing pass output).

- [ ] **Step 6: Restart backend and smoke-test over HTTP**

Kill and relaunch uvicorn exactly as during development (`pkill -9 -f 'python -m uvi[c]orn'` then setsid launch), then:

```bash
curl -s http://localhost:8777/api/profiles | python3 -m json.tool | head -5
curl -s -X POST http://localhost:8777/api/profiles/1/readings -H 'content-type: application/json' -d '{"title":"smoke"}'
curl -s -X DELETE http://localhost:8777/api/readings/$(curl -s -X POST http://localhost:8777/api/profiles/1/readings -H 'content-type: application/json' -d '{"title":"smoke2"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
```

Expected: profile JSON, created reading dict, `{"ok": true}`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py backend/app/main.py backend/tests/test_readings.py
git commit -m "readings: SQLite model + CRUD endpoints with isolated test suite"
```

---

### Task 2: Stateless share permalinks (`lib/share.ts` + App wiring)

**Files:**
- Create: `frontend/src/lib/share.ts`
- Modify: `frontend/src/App.tsx` (boot effect + Copy-link button + shared-chart badge)

**Interfaces:**
- Consumes: `BirthFormValue` (from `./components/BirthForm`); `payload` state (BirthInputPayload shape: `{local_dt, place?, lat?, lon?, tz_name?, house_system}`) already in `App.tsx`.
- Produces: `encodeShare(v: BirthFormValue, name?: string): string`; `decodeShare(hash: string): DecodedShare | null` where `DecodedShare = { n: string; d: string; la: number; lo: number; tz: string | null; house_system: string }`.

- [ ] **Step 1: Create the codec**

`frontend/src/lib/share.ts`:

```ts
import type { BirthFormValue } from "../components/BirthForm";

interface SharePayload {
  n: string; // place label
  d: string; // local_dt yyyy-MM-ddTHH:mm
  la: number;
  lo: number;
  tz: string | null;
  h: string; // house system code
}

export interface DecodedShare {
  n: string;
  d: string;
  la: number;
  lo: number;
  tz: string | null;
  house_system: string;
}

export function encodeShare(v: BirthFormValue, name?: string): string {
  const p: SharePayload = {
    n: name ?? v.place ?? "",
    d: v.local_dt,
    la: v.lat ?? 0,
    lo: v.lon ?? 0,
    tz: v.tz_name ?? null,
    h: v.house_system ?? "P",
  };
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShare(hash: string): DecodedShare | null {
  try {
    const b64 = hash.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
    if (!p.d || typeof p.la !== "number" || typeof p.lo !== "number") return null;
    return { n: p.n, d: p.d, la: p.la, lo: p.lo, tz: p.tz, house_system: p.h || "P" };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc -b --force`
Expected: clean.

- [ ] **Step 3: Wire into App.tsx**

Three changes in `frontend/src/App.tsx`:

a) Import at top:

```ts
import { decodeShare, encodeShare } from "./lib/share";
```

b) Shared-link badge state next to `selectedEvent`:

```ts
const [sharedFromLink, setSharedFromLink] = useState<string | null>(null);
```

c) Boot effect placed after the state declarations (runs once):

```ts
useEffect(() => {
  const h = window.location.hash;
  if (!h.startsWith("#p=")) return;
  const dec = decodeShare(h.slice(3));
  if (!dec) return;
  setPayload({
    local_dt: dec.d,
    place: dec.n,
    lat: dec.la,
    lon: dec.lo,
    tz_name: dec.tz,
    house_system: dec.house_system,
  });
  setSharedFromLink(dec.n);
}, []);
```

(If the existing boot effect already loads the last-used profile, this effect must run AFTER it so the hash wins — append it below that effect.)

d) In the header actions row (next to the existing save/delete buttons), add Copy-link:

```tsx
<button
  onClick={() => {
    const url = `${window.location.origin}${window.location.pathname}#p=${encodeShare(value, payload.place ?? undefined)}`;
    navigator.clipboard.writeText(url).then(
      () => setSharedFromLink(`link copied — ${url.slice(0, 48)}…`),
      () => setError("clipboard blocked"),
    );
  }}
  className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-100"
>
  copy link
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
```

Adjust `value`/`setError` names to whatever the form state variables are actually called in App.tsx (inspect before editing — the form value lives in the `BirthForm` binding).

- [ ] **Step 4: Browser round-trip verification**

With both servers running: cast a chart, click **copy link**, then paste the URL into a NEW browser tab (via chrome-devtools `new_page`). Expected: chart boots directly from the hash with the badge visible; positions table matches the source chart. Also test a corrupted hash (`#p=!!!`) — expected: app boots normally, no crash.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/share.ts frontend/src/App.tsx
git commit -m "share: stateless birth-data permalinks (#p=base64url) with copy-link + badge"
```

---

### Task 3: Wheel PNG export

**Files:**
- Create: `frontend/src/lib/exportPng.ts`
- Modify: `frontend/src/App.tsx` (header button)

**Interfaces:**
- Consumes: the wheel `<svg data-testid="astro-wheel">` (existing stable selector in `Wheel.tsx`).
- Produces: `svgToPngBlob(svg: SVGSVGElement, scale?: number): Promise<Blob>`; `downloadBlob(blob: Blob, filename: string): void`.

- [ ] **Step 1: Create the utility**

`frontend/src/lib/exportPng.ts`:

```ts
/** Rasterize a live inline <svg> to a PNG blob. Pure DOM APIs — no dependencies. */
export async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const xml = new XMLSerializer().serializeToString(svg);
  const rect = svg.getBoundingClientRect();
  const w = Math.max(rect.width, 1);
  const h = Math.max(rect.height, 1);

  const b64 = btoa(unescape(encodeURIComponent(xml)));
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("SVG rasterization failed"));
    img.src = `data:image/svg+xml;base64,${b64}`;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))), "image/png"),
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
```

- [ ] **Step 2: Wire the button in App.tsx**

Import:

```ts
import { downloadBlob, svgToPngBlob } from "./lib/exportPng";
```

Header button (next to copy link):

```tsx
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
```

- [ ] **Step 3: Verify in browser**

Cast chart → click **png ⤓**. Expected: a downloaded PNG at 2× resolution showing the complete wheel including zodiac ring, glyphs, aspect lines, and overlay ring when a transit tab is active. Open the file to confirm glyphs render (not tofu boxes).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/exportPng.ts frontend/src/App.tsx
git commit -m "export: wheel PNG download via SVG rasterization (2x)"
```

---

### Task 4: ReportView — the Almanac document

**Files:**
- Create: `frontend/src/components/ReportView.tsx`
- Modify: `frontend/src/index.css` (Almanac tokens + print rules, appended — never overwrite Tailwind imports)
- Modify: `frontend/src/App.tsx` (tab entry `"report"` + render branch + `.no-print` classes on chrome)

**Interfaces:**
- Consumes: `api.natal/transits/timeline/harmonics` (exact signatures in `api.ts`); `Markdown` component (`./lib/markdown`); `TimelineEvent`, `TransitPayload`, `Chart`, `HarmonicsPayload` types.
- Produces: `ReportView({ payload }: { payload: BirthInputPayload })`. Tab key `"report"` added to `ViewTab`.

- [ ] **Step 1: Append Almanac tokens + print CSS to index.css**

Append to `frontend/src/index.css` (keep every existing rule above intact):

```css
/* ---------- Hallmark · macrostructure: Long Document · tone: almanac · anchor hue: 65 ----------
 * Almanac theme: light warm paper / roman-serif display / ochre accent.
 * Scoped to .almanac — the app chrome keeps its own zinc/indigo identity. */

.almanac {
  --alm-paper: oklch(96% 0.012 85);
  --alm-paper-deep: oklch(93% 0.016 85);
  --alm-ink: oklch(26% 0.014 85);
  --alm-muted: oklch(46% 0.016 85);
  --alm-accent: oklch(52% 0.11 65);
  --alm-rule: oklch(80% 0.02 85);
  --alm-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  background: var(--alm-paper);
  color: var(--alm-ink);
  font-family: var(--alm-display);
  line-height: 1.68;
}

.almanac h1, .almanac h2, .almanac h3 { font-style: normal; font-weight: 600; }
.almanac .alm-head {
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--alm-accent);
  margin-top: 2.2rem;
  margin-bottom: 0.55rem;
}
.almanac .alm-rule { border: 0; border-top: 1px solid var(--alm-rule); margin: 2rem 0; }
.almanac table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.almanac th { text-align: left; font-weight: 600; padding: 0.28rem 0.5rem;
  border-bottom: 1px solid var(--alm-rule); font-variant: small-caps; }
.almanac td { padding: 0.24rem 0.5rem; border-bottom: 1px solid var(--alm-paper-deep); }
.almanac .alm-figure { margin: 1.6rem auto; max-width: 30rem; }
.almanac .alm-figure figcaption { font-size: 0.75rem; color: var(--alm-muted);
  text-align: center; margin-top: 0.4rem; }

/* Screen-only paper sheet framing */
.report-wrap { overflow-y: auto; height: 100%; display: flex; justify-content: center; padding: 1rem; }
#report-sheet { width: 210mm; max-width: 96vw; padding: 18mm; box-shadow: 0 2px 24px rgb(0 0 0 / 0.45); }

/* ---------- print: A4, hide everything but the sheet ---------- */
.no-print { /* marker class; screen shows chrome normally */ }
@media print {
  @page { size: A4; margin: 18mm; }
  body { background: white !important; }
  .no-print { display: none !important; }
  .report-wrap { padding: 0; overflow: visible; display: block; height: auto; }
  #report-sheet { width: auto; max-width: none; padding: 0; box-shadow: none; }
}
```

- [ ] **Step 2: Create ReportView.tsx**

```tsx
import { useEffect, useState } from "react";
import { api } from "../api";
import type { BirthInputPayload } from "../api";
import type { Chart, HarmonicsPayload, TimelineEvent, TimelinePayload, TransitPayload } from "../types";
import { fmtUTC, ordinalHouse } from "../lib/format";
import { Markdown } from "../lib/markdown";
import { planetText } from "../lib/interpretations";

type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; natal: Chart; transits: TransitPayload; timeline: TimelinePayload; harmonics: HarmonicsPayload };

const SIGN_ORDER = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

function signOf(lon: number): string {
  const i = Math.floor(((lon % 360) + 360) % 360 / 30);
  return SIGN_ORDER[i];
}

function degStr(lon: number): string {
  const within = ((lon % 360) + 360) % 360 % 30;
  const d = Math.floor(within);
  const m = Math.floor((within - d) * 60);
  return `${d}°${String(m).padStart(2, "0")}′`;
}

export default function ReportView({ payload }: { payload: BirthInputPayload }) {
  const [doc, setDoc] = useState<Loaded>({ state: "loading" });

  useEffect(() => {
    let alive = true;
    Promise.all([api.natal(payload), api.transits(payload), api.timeline(365), api.harmonics()])
      .then(([natal, transits, timeline, harmonics]) => alive && setDoc({ state: "ready", natal, transits, timeline, harmonics }))
      .catch((e) => alive && setDoc({ state: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => { alive = false; };
  }, [payload]);

  return (
    <div className="report-wrap">
      <article id="report-sheet" className="almanac">
        {doc.state === "loading" && <p>Composing the document…</p>}
        {doc.state === "error" && <p role="alert">Could not assemble the report: {doc.message}</p>}
        {doc.state === "ready" && <ReportBody {...doc} payload={payload} />}
      </article>
    </div>
  );
}

function ReportBody({ natal, transits, timeline, harmonics, payload }: {
  natal: Chart; transits: TransitPayload; timeline: TimelinePayload; harmonics: HarmonicsPayload;
  payload: BirthInputPayload;
}) {
  const curated = timeline.events.filter((e) => e.curated);
  const eclipses = timeline.events.filter((e) => e.event_type === "ECLIPSE");
  return (
    <>
      {/* Masthead */}
      <header style={{ textAlign: "center", marginBottom: "2.4rem" }}>
        <div style={{ fontSize: "0.72rem", letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--alm-accent)" }}>
          Celestial Blueprint · Natal Reading
        </div>
        <h1 style={{ fontSize: "2rem", margin: "0.5rem 0 0.3rem" }}>{payload.place}</h1>
        <p style={{ color: "var(--alm-muted)", fontSize: "0.85rem" }}>
          {payload.local_dt.replace("T", " · ")} local · {payload.lat}°, {payload.lon}°
          {" "}{payload.tz_name ? `· ${payload.tz_name}` : ""}
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
        <thead><tr><th>Body</th><th>Position</th><th>Motion</th><th>House</th></tr></thead>
        <tbody>
          {natal.bodies.map((b) => (
            <tr key={b.name}>
              <td>{b.glyph} {b.name}</td>
              <td>{signOf(b.lon)} {degStr(b.lon)}</td>
              <td>{b.retrograde ? "retrograde" : "direct"}</td>
              <td>{b.house ? ordinalHouse(b.house) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Aspects */}
      <h2 className="alm-head">Aspects</h2>
      {natal.aspects.map((a, i) => (
        <details key={i} style={{ marginBottom: "0.35rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.86rem" }}>
            {a.p1_name} {a.glyph} {a.p2_name} · orb {a.orb.toFixed(1)}°
          </summary>
          <div style={{ padding: "0.4rem 0.8rem", fontSize: "0.84rem", color: "var(--alm-muted)" }}>
            <Markdown text={aspectOrFallback(a.p1_name, a.aspect, a.p2_name)} />
          </div>
        </details>
      ))}

      <hr className="alm-rule" />

      {/* The Sky Now */}
      <h2 className="alm-head">The Sky Now</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--alm-muted)" }}>
        Computed {fmtUTC(transits.transit_utc)}. Tightest five contacts:
      </p>
      <table>
        <tbody>
          {transits.aspects.slice(0, 5).map((a, i) => (
            <tr key={i}>
              <td>transiting {a.t_name} {signOf(a.t_lon)} {degStr(a.t_lon)}</td>
              <td>{a.aspect}</td>
              <td>natal {a.n_name}</td>
              <td>orb {a.orb.toFixed(1)}°</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Coming Attractions */}
      <h2 className="alm-head">Coming Attractions</h2>
      {curated.map((e: TimelineEvent) => (
        <section key={e.event_id} style={{ marginBottom: "1.1rem" }}>
          <p style={{ fontSize: "0.86rem" }}>
            <strong>{e.date.slice(0, 10)} — {e.event}</strong>
            {e.position_str ? `, ${e.position_str}` : ""}
            <span style={{ color: "var(--alm-accent)" }}> ★</span>
          </p>
          <p style={{ fontSize: "0.84rem", color: "var(--alm-muted)" }}>{e.interpretation}</p>
        </section>
      ))}

      {/* Stations & Eclipses */}
      <h2 className="alm-head">Stations &amp; Eclipses</h2>
      <ul style={{ fontSize: "0.85rem" }}>
        {timeline.events.filter((e) => e.event_type === "STATION" && ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"].includes(e.primary_body.name)).map((e) => (
          <li key={e.event_id}>{e.date.slice(0, 10)} — {e.event}</li>
        ))}
        {eclipses.map((e) => (
          <li key={e.event_id}>{e.date.slice(0, 10)} — {e.event}, {e.position_str} ☊ axis</li>
        ))}
      </ul>

      {/* Harmonic Resonance summary */}
      <h2 className="alm-head">Harmonic Resonance</h2>
      <p style={{ fontSize: "0.85rem" }}>
        Adjacent planetary periods fall on small-integer ratios (mean deviation ω ≈{" "}
        {Math.max(...harmonics.links.map((l) => l.omega)).toFixed(3)} worst-case) — the same
        commensurabilities the tradition formalized as trine (3:1) and opposition (2:1).
        Titius–Bode, by contrast, mispredicts Pluto by ×{harmonics.summary.tb_pluto_fail.toFixed(2)}.
      </p>

      {/* Colophon */}
      <footer style={{ marginTop: "3rem", fontSize: "0.72rem", color: "var(--alm-muted)", textAlign: "center" }}>
        Set in the system's old-style serif · computed with Swiss Ephemeris · {new Date().getFullYear()}
      </footer>
    </>
  );
}

/** Inline SVG plate: simplified natal wheel (rings + glyphs), print-safe. */
function NatalPlate({ natal }: { natal: Chart }) {
  const C = 200, R = 180;
  const pol = (lonDeg: number, r: number): [number, number] => {
    const a = ((lonDeg - natal.angles.asc + 90) * Math.PI) / 180;
    return [C + r * Math.cos(-a), C - r * Math.sin(-a)];
  };
  return (
    <svg viewBox="0 0 400 400" width="100%">
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--alm-rule)" />
      <circle cx={C} cy={C} r={R - 36} fill="none" stroke="var(--alm-rule)" strokeWidth="0.5" />
      {Array.from({ length: 12 }, (_, i) => i * 30).map((l) => {
        const [x1, y1] = pol(l, R); const [x2, y2] = pol(l, R - 36);
        return <line key={l} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--alm-rule)" strokeWidth="0.5" />;
      })}
      {natal.bodies.map((b) => {
        const [x, y] = pol(b.lon, R - 18);
        return (
          <text key={b.name} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="13">
            {b.glyph}
          </text>
        );
      })}
      {natal.aspects.filter((a) => a.orb <= 3).map((a, i) => {
        const p1 = natal.bodies.find((b) => b.name === a.p1_name);
        const p2 = natal.bodies.find((b) => b.name === a.p2_name);
        if (!p1 || !p2) return null;
        const [x1, y1] = pol(p1.lon, R - 36); const [x2, y2] = pol(p2.lon, R - 36);
        const soft = [0, 60, 120].includes(Math.round(a.exact_angle));
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={soft ? "var(--alm-accent)" : "var(--alm-muted)"} strokeWidth="0.6" opacity="0.55" />;
      })}
    </svg>
  );
}
```

**Field-name caveat (verify before finalizing):** `Chart.body/aspects` property names (`p1_name`, `aspect`, `orb`, `exact_angle`, `t_name`, `t_lon`, `n_name`) MUST be cross-checked against `frontend/src/types.ts` and adjusted to the real names — read the file first; do not invent accessors. The `aspectOrFallback` helper referenced above should be implemented as a thin wrapper around the existing `aspectText(p1, aspectName, p2)` from `./lib/interpretations`; if `aspectText` covers it, delete the wrapper and call `aspectText` directly.

- [ ] **Step 3: Register the tab in App.tsx**

- Add `"report"` to the `ViewTab` union.
- Add `["report", "Report ⎙"]` to the tabs array (last position).
- Render branch alongside cycles/harmonics:

```tsx
) : tab === "report" ? (
  <ReportView payload={payload} />
) : displayedBase ? (
```

- Import `ReportView`.
- Add `className="no-print"` to: the `<header>` banner, left sidebar `<aside>` (positions table), `<nav>` tab strip, the Astrocartography map section, and the TransitClock aside. Leave the wheel/report pane unmarked.
- Map stays visible on the report tab? No — add `tab !== "report"` to the map's render condition.

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npx tsc -b --force && npm run build`
Expected: clean, bundle grows modestly (<20 kB).

- [ ] **Step 5: Browser verification (screen + print)**

Open Report tab: expect warm-paper sheet centered on the dark chrome, masthead, wheel plate with glyphs, four data sections, colophon. Then press Ctrl+P (or chrome-devtools `evaluate_script` `() => window.print()` — dismiss the dialog): the preview must show ONLY the sheet, paginated A4, no dark chrome, no map.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ReportView.tsx frontend/src/index.css frontend/src/App.tsx
git commit -m "report: Almanac A4 reading document (Long Document macrostructure) with print pipeline"
```

---

### Task 5: Readings journal UI

**Files:**
- Modify: `frontend/src/types.ts` (append `Reading`)
- Modify: `frontend/src/api.ts` (four methods on `api`)
- Create: `frontend/src/components/ReadingsPanel.tsx`
- Modify: `frontend/src/App.tsx` (rail toggle + mount)

**Interfaces:**
- Consumes: Task 1 endpoints; `payload` + `transits` + `selectedEvent` state in App; `Markdown` component.
- Produces: `Reading` type; `ReadingsPanel({ profileId, payload, currentTransits, selectedEvent })` — `profileId: number | null` (profiles carry numeric ids from `api.profiles()`).

- [ ] **Step 1: Types + API methods**

In `types.ts`:

```ts
export interface Reading {
  id: number;
  profile_id: number;
  created_at: string | null;
  title: string;
  focus: string | null;
  body_md: string;
  snapshot_json: string | null;
}
```

In `api.ts` (inside the `api` object; `Reading` added to the type import):

```ts
  readings: (pid: number): Promise<Reading[]> =>
    fetch(u(`/api/profiles/${pid}/readings`)).then(async (r) => {
      if (!r.ok) throw new Error("readings fetch failed");
      return r.json() as Promise<Reading[]>;
    }),

  createReading: (pid: number, data: { title: string; focus?: string | null; body_md?: string; snapshot_json?: string | null }): Promise<Reading> =>
    post(u(`/api/profiles/${pid}/readings`), data),

  updateReading: (id: number, patch: Partial<Pick<Reading, "title" | "focus" | "body_md" | "snapshot_json">>): Promise<Reading> =>
    post(u(`/api/readings/${id}`), patch), // replaced by PUT below if post<T> is method-fixed
```

`post()` is hardwired to POST — add a `put` sibling next to it (copy of `post` with `method: "PUT"`), and use it for `updateReading`. `deleteReading` mirrors `deleteProfile`:

```ts
  deleteReading: (id: number) =>
    fetch(u(`/api/readings/${id}`), { method: "DELETE" }).then((r) => r.json()),
```

- [ ] **Step 2: ReadingsPanel.tsx**

```tsx
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Reading, TimelineEvent, TransitPayload } from "../types";
import type { BirthInputPayload } from "../api";
import { Markdown } from "../lib/markdown";

export default function ReadingsPanel({
  profileId,
  currentTransits,
  selectedEvent,
}: {
  profileId: number | null;
  currentTransits: TransitPayload | null;
  selectedEvent: TimelineEvent | null;
}) {
  const [entries, setEntries] = useState<Reading[]>([]);
  const [editing, setEditing] = useState<{ title: string; focus: string; body_md: string } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    if (profileId == null) return setEntries([]);
    api.readings(profileId).then(setEntries).catch(() => setEntries([]));
  }, [profileId]);
  useEffect(reload, [reload]);

  if (profileId == null) {
    return <p className="p-3 text-xs text-zinc-600">Save the profile first to keep a journal.</p>;
  }

  const snapshot = (): string | null => {
    if (!currentTransits && !selectedEvent) return null;
    return JSON.stringify({ transits: currentTransits, event: selectedEvent });
  };

  const save = async () => {
    if (!editing || !editing.title.trim()) return;
    setBusy(true);
    try {
      await api.createReading(profileId, {
        title: editing.title.trim(),
        focus: editing.focus.trim() || null,
        body_md: editing.body_md,
        snapshot_json: snapshot(),
      });
      setEditing(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden text-zinc-300">
      <div className="flex items-center gap-2 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Readings Journal</h2>
        <button
          onClick={() => setEditing(editing ? null : { title: "", focus: "", body_md: "" })}
          className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-[11px] hover:text-zinc-100"
        >
          {editing ? "cancel" : "＋ new"}
        </button>
      </div>

      {editing && (
        <div className="space-y-1.5 border-y border-zinc-800 bg-zinc-900/50 p-2">
          <input
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="Title — e.g. Saturn opposition debrief"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
          />
          <input
            value={editing.focus}
            onChange={(e) => setEditing({ ...editing, focus: e.target.value })}
            placeholder="focus tag (career / love / eclipse…)"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
          />
          <textarea
            value={editing.body_md}
            onChange={(e) => setEditing({ ...editing, body_md: e.target.value })}
            placeholder="markdown notes…"
            rows={6}
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px]"
          />
          <button
            onClick={save}
            disabled={busy || !editing.title.trim()}
            className="rounded bg-indigo-500/25 px-2 py-0.5 text-[11px] text-indigo-200 disabled:opacity-40"
          >
            {busy ? "saving…" : currentTransits || selectedEvent ? "save + snapshot sky ⌗" : "save"}
          </button>
        </div>
      )}

      <ul className="min-h-0 flex-1 divide-y divide-zinc-900 overflow-y-auto">
        {entries.length === 0 && !editing && (
          <li className="p-3 text-xs text-zinc-600">No entries yet.</li>
        )}
        {entries.map((en) => (
          <li key={en.id} className="px-3 py-2 hover:bg-zinc-900/40">
            <button onClick={() => setOpenId(openId === en.id ? null : en.id)} className="w-full text-left">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium">{en.title}</span>
                {en.focus && <span className="rounded bg-zinc-800 px-1 text-[9px] uppercase text-zinc-400">{en.focus}</span>}
                <span className="ml-auto font-mono text-[10px] text-zinc-600">{en.created_at?.slice(0, 10)}</span>
              </div>
            </button>
            {openId === en.id && (
              <div className="mt-1 space-y-1.5">
                <div className="text-[11px] leading-snug text-zinc-400"><Markdown text={en.body_md} /></div>
                {en.snapshot_json && (
                  <details>
                    <summary className="cursor-pointer text-[10px] text-indigo-400/80">frozen sky snapshot ⌗</summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-zinc-950 p-1.5 font-mono text-[9px] text-zinc-500">
                      {JSON.stringify(JSON.parse(en.snapshot_json), null, 1).slice(0, 2000)}
                    </pre>
                  </details>
                )}
                <button
                  onClick={async () => { await api.deleteReading(en.id); reload(); }}
                  className="text-[10px] text-red-400/70 hover:text-red-300"
                >
                  delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

(The unused-looking `BirthInputPayload` import may be dropped if the linter flags it — adjust imports to what compiles clean.)

- [ ] **Step 3: Mount the rail in App.tsx**

State: `const [showJournal, setShowJournal] = useState(false);`

Toggle button in the tab strip (after the Harmonics button):

```tsx
<button
  onClick={() => setShowJournal(!showJournal)}
  className={`rounded-t-md px-2 py-1.5 text-xs transition ${showJournal ? "bg-zinc-900 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"}`}
>
  Journal ✎
</button>
```

Mount beside the interpretation card overlay, inside the wheel pane:

```tsx
{showJournal && (
  <aside className="absolute inset-y-0 right-0 z-20 w-80 border-l border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur">
    <ReadingsPanel
      profileId={activeProfileId ?? null}
      currentTransits={tab === "transits" || selectedEvent ? transits : null}
      selectedEvent={selectedEvent}
    />
  </aside>
)}
```

Use whatever variable actually holds the current numeric profile id in App.tsx (the profile dropdown selection) — inspect before editing; if profiles aren't tracked numerically yet, store the id returned by `createProfile` / present in `api.profiles()` rows when loading.

- [ ] **Step 4: Typecheck + browser verification**

`tsc -b --force` clean. In browser: save a profile if needed → Journal → ＋new → fill title/focus/body while on Transits tab → save + snapshot sky ⌗ → entry appears dated → reopen shows markdown + expandable snapshot → delete works.

- [ ] **Step 5: Full-suite regression + commit**

```bash
cd backend && .venv/bin/python tests/test_readings.py && .venv/bin/python tests/test_validation.py
cd ../frontend && npx tsc -b --force && npm run build
git add -A
git commit -m "journal: ReadingsPanel with sky-snapshot capture, markdown entries, rail UI"
git push
```

Then final end-to-end pass: restart backend, hard-reload frontend, walk every tab once (natal → transits → progressions → draconic → cycles → click a timeline event → harmonics → report → journal → copy link in fresh tab).

---

## Self-review notes (resolved during writing)

- **Spec coverage:** PDF report (Task 4), PNG export (Task 3), permalinks (Task 2), journal with structured fields + snapshot (Tasks 1+5). Deployment topology documented in README (done pre-plan). ✓
- **Type consistency:** `Reading` fields match `_reading_dict` output exactly; `DecodedShare.house_system` feeds `setPayload.house_system`; `svgToPngBlob`/`downloadBlob` signatures consistent between Task 3 definition and use. Field-name caveat for Chart/aspect accessors flagged explicitly in Task 4 Step 2 rather than guessed. ✓
- **Placeholders:** the two "inspect before editing" notes (form-state variable names, profile-id variable) are deliberate discovery instructions with concrete fallback guidance, not missing design. ✓
