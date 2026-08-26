"""FastAPI application for Celestial Blueprint."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import models
from .astrocartography.lines import compute_astrocartography
from .charts.cycles import compute_cycles
from .charts.harmonics import compute_harmonics
from .charts.service import (
    compute_draconic,
    compute_natal,
    compute_progressions,
    compute_transits,
)
from .charts.timeline import compute_timeline
from .ephemeris import engine as eng
from .geo.geocode import geocode, local_to_utc, resolve_timezone

app = FastAPI(title="Celestial Blueprint API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

models.init_db()


# ---------- Request/response models ----------

class BirthInput(BaseModel):
    local_dt: str = Field(..., description="Local civil datetime, ISO 8601, e.g. 1995-08-31T07:08:00")
    place: str | None = Field(None, description="Place name for geocoding")
    lat: float | None = Field(None, description="Latitude (bypass geocoding)")
    lon: float | None = Field(None, description="Longitude (bypass geocoding)")
    tz_name: str | None = Field(None, description="IANA timezone (optional override)")
    house_system: str = Field("P", description="P=Placidus, W=Whole Sign, K=Koch, E=Equal")
    utc_override: str | None = Field(None, description="Pre-resolved aware UTC ISO string; skips local->UTC resolution")


class ChartRequest(BirthInput):
    pass


class TransitRequest(BirthInput):
    transit_dt: str | None = Field(None, description="Transit datetime (UTC). Defaults to now.")


class ProgressionRequest(BirthInput):
    prog_date: str | None = Field(None, description="Progression date (UTC). Defaults to now.")


class ProfileCreate(BirthInput):
    name: str


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


# ---------- Helpers ----------

def _resolve_birth(input: BirthInput) -> tuple[datetime, float, float, str | None]:
    """Resolve local civil datetime + place into (utc_dt, lat, lon, tz_name)."""
    if input.utc_override:
        utc = datetime.fromisoformat(input.utc_override)
        if utc.tzinfo is None:
            utc = utc.replace(tzinfo=timezone.utc)
        if input.lat is not None and input.lon is not None:
            tz = input.tz_name or resolve_timezone(input.lat, input.lon)
            return utc, input.lat, input.lon, tz
        raise HTTPException(400, "utc_override requires lat/lon")
    local_dt = datetime.fromisoformat(input.local_dt)
    if input.lat is not None and input.lon is not None:
        lat, lon = input.lat, input.lon
        tz = input.tz_name or resolve_timezone(lat, lon)
        utc = local_to_utc(local_dt, lat, lon, tz)
        return utc, lat, lon, tz
    if not input.place:
        raise HTTPException(400, "Provide either lat/lon or a place name")
    matches = geocode(input.place)
    if not matches:
        raise HTTPException(404, f"No place found for '{input.place}'")
    p = matches[0]
    lat, lon = p.lat, p.lon
    tz = input.tz_name or p.tz or resolve_timezone(lat, lon)
    utc = local_to_utc(local_dt, lat, lon, tz)
    return utc, lat, lon, tz


# ---------- Endpoints ----------

@app.get("/api/health")
def health():
    return {"status": "ok", "ephemeris": swe_version()}


def swe_version():
    import swisseph as swe
    return swe.version


@app.get("/api/geocode")
def api_geocode(q: str = Query(..., min_length=1)):
    return [{"name": p.name, "country": p.country, "lat": p.lat, "lon": p.lon, "tz": p.tz}
            for p in geocode(q)]


@app.post("/api/chart/natal")
def api_natal(req: ChartRequest):
    utc, lat, lon, tz = _resolve_birth(req)
    chart = compute_natal(utc, lat, lon, req.house_system)
    chart["place"] = req.place
    chart["tz_name"] = tz
    return chart


@app.post("/api/chart/transits")
def api_transits(req: TransitRequest):
    utc, lat, lon, tz = _resolve_birth(req)
    transit_dt = datetime.fromisoformat(req.transit_dt) if req.transit_dt else datetime.now(timezone.utc)
    if transit_dt.tzinfo is None:
        transit_dt = transit_dt.replace(tzinfo=timezone.utc)
    return compute_transits(utc, transit_dt, lat, lon, req.house_system)


@app.post("/api/chart/progressions")
def api_progressions(req: ProgressionRequest):
    utc, lat, lon, tz = _resolve_birth(req)
    prog_date = datetime.fromisoformat(req.prog_date) if req.prog_date else datetime.now(timezone.utc)
    if prog_date.tzinfo is None:
        prog_date = prog_date.replace(tzinfo=timezone.utc)
    return compute_progressions(utc, prog_date, lat, lon, req.house_system)


@app.post("/api/chart/draconic")
def api_draconic(req: ChartRequest):
    utc, lat, lon, tz = _resolve_birth(req)
    return compute_draconic(utc, lat, lon, req.house_system)


@app.post("/api/astrocartography")
def api_astrocartography(req: ChartRequest):
    utc, lat, lon, tz = _resolve_birth(req)
    bodies = eng.get_body_positions(eng.jd_from_utc(utc))
    return compute_astrocartography(utc, bodies)


@app.post("/api/relocate")
def api_relocate(req: ChartRequest):
    """Relocated natal chart: house cusps recomputed for a clicked lat/long at
    the original UTC birth moment; zodiacal degrees stay fixed."""
    utc, _, _, _ = _resolve_birth(req)
    if req.lat is None or req.lon is None:
        raise HTTPException(400, "Relocation requires lat/lon")
    chart = compute_natal(utc, req.lat, req.lon, req.house_system)
    chart["relocated"] = True
    return chart


@app.get("/api/cycles")
def api_cycles(days: int = Query(365, ge=1, le=1095)):
    """Upcoming astrological events: retrograde stations, sign ingresses,
    lunations, and major outer-planet aspects for `days` ahead from now."""
    jd0 = eng.jd_from_utc(datetime.now(timezone.utc))
    return compute_cycles(jd0, days)


@app.get("/api/timeline")
def api_timeline(days: int = Query(365, ge=1, le=1095)):
    """Structured transit-timeline: ephemeris events merged with curated
    interpretations from the event_interpretations table."""
    return compute_timeline(days)


@app.get("/api/harmonics")
def api_harmonics():
    """Harmonic Orbit Resonance analysis: solar-system spacing via harmonic
    commensurabilities vs the classical Titius-Bode law."""
    return compute_harmonics()

@app.get("/api/profiles")
def list_profiles():
    with models.SessionLocal() as s:
        rows = s.query(models.Profile).all()
        return [{"id": r.id, "name": r.name, "birth_local": r.birth_local,
                 "place_name": r.place_name, "lat": r.lat, "lon": r.lon,
                 "tz_name": r.tz_name, "house_system": r.house_system} for r in rows]


@app.post("/api/profiles")
def create_profile(req: ProfileCreate):
    utc, lat, lon, tz = _resolve_birth(req)
    with models.SessionLocal() as s:
        p = models.Profile(name=req.name, birth_local=req.local_dt, place_name=req.place,
                           lat=lat, lon=lon, tz_name=tz, house_system=req.house_system)
        s.add(p)
        s.commit()
        s.refresh(p)
        return {"id": p.id, "name": p.name}


@app.delete("/api/profiles/{pid}")
def delete_profile(pid: int):
    with models.SessionLocal() as s:
        p = s.query(models.Profile).get(pid)
        if not p:
            raise HTTPException(404, "Profile not found")
        s.delete(p)
        s.commit()
        return {"ok": True}


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