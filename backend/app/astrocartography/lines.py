"""Astrocartography (astro-locality) line solver.

Computes terrestrial lines where each planet is rising (ASC), setting (DSC),
culminating (MC), or anti-culminating (IC) at a given UTC birth moment, plus
paran crossings.

Method (per spec §4): MC/IC lines are meridians (trivial — a single longitude).
ASC/DSC lines curve with latitude, so we solve for the latitude at each of
several hundred longitude steps, with denser sampling near the poles.

We use swe.houses_ex to compute the Ascendant so the map lines are consistent
with the house math used everywhere else in the app.
"""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache

import swisseph as swe

from ..ephemeris import engine as eng

# Planet colors (spec §3 Phase 3).
PLANET_COLORS = {
    eng.SUN: "#fbbf24",      # Gold
    eng.MOON: "#cbd5e1",     # Silver/Light Blue
    eng.MERCURY: "#fde047",  # Yellow
    eng.VENUS: "#f472b6",    # Pink
    eng.MARS: "#ef4444",     # Red
    eng.JUPITER: "#a855f7",  # Purple
    eng.SATURN: "#64748b",   # Slate Grey
    eng.URANUS: "#22d3ee",   # Cyan
    eng.NEPTUNE: "#2dd4bf",  # Teal
    eng.PLUTO: "#7f1d1d",    # Dark Maroon
}

LINE_TYPES = ["asc", "dsc", "mc", "ic"]


def _ascendant(jd: float, lat: float, lon: float) -> float:
    """Ecliptic longitude of the Ascendant at (jd, lat, lon).

    Returns NaN if the house system is undefined at this latitude (polar).
    """
    try:
        swe.set_ephe_path(eng._EPHE_DIR)
        _, ascmc = swe.houses_ex(jd, lat, lon, b"P")
        return float(ascmc[0]) % 360.0
    except Exception:
        return float("nan")


def _mc(jd: float, lon: float) -> float:
    """Ecliptic longitude of the MC at (jd, lon) — independent of latitude."""
    try:
        swe.set_ephe_path(eng._EPHE_DIR)
        _, ascmc = swe.houses_ex(jd, 0.0, lon, b"P")
        return float(ascmc[1]) % 360.0
    except Exception:
        return float("nan")


def _solve_latitude_for_angle(jd: float, lon: float, target: float, angle: str) -> float | None:
    """Find the latitude where the ASC (or DSC) equals `target` at this longitude.

    Returns None if no solution exists in [-90, 90].
    """
    target = target % 360.0
    # Scan latitude coarsely, find sign changes of (asc - target), bisect each
    # bracket to ~0.001° precision.
    def diff(lat: float) -> float:
        asc = _ascendant(jd, lat, lon)
        if angle == "dsc":
            asc = (asc + 180.0) % 360.0
        d = (asc - target + 180.0) % 360.0 - 180.0
        return d

    # Coarse scan (3° steps) plus fine points near the poles where the curve
    # bends sharply (spec: denser sampling near poles).
    lats = [float(i) for i in range(0, 91, 3)]
    lats += [84, 85, 86, 87, 88, 89]
    for p in [87.5, 88.5, 89.25, -87.5, -88.5, -89.25]:
        lats.append(float(p))
    neg = [-l for l in lats if l > 0]
    lats = sorted(set(lats + neg))
    lats = [l for l in lats if -90 <= l <= 90]

    prev_lat = lats[0]
    prev_d = diff(prev_lat)
    for lat in lats[1:]:
        d = diff(lat)
        if prev_d == 0:
            return prev_lat
        if d == 0:
            return lat
        if prev_d * d < 0:
            lo, hi = prev_lat, lat
            flo = prev_d
            for _ in range(20):
                mid = (lo + hi) / 2.0
                fm = diff(mid)
                if fm == 0:
                    return mid
                if flo * fm < 0:
                    hi = mid
                else:
                    lo, flo = mid, fm
            return (lo + hi) / 2.0
        prev_lat, prev_d = lat, d
    return None


@lru_cache(maxsize=512)
def _solve_longitude_for_mc_cached(jd: float, target: float) -> float:
    """Find the terrestrial longitude where the MC equals `target`."""
    target = target % 360.0
    # MC is monotonic in longitude (roughly 1:1). Bisect over longitude.
    lo, hi = 0.0, 360.0
    for _ in range(40):
        mid = (lo + hi) / 2.0
        mc = _mc(jd, mid)
        d = (mc - target + 180.0) % 360.0 - 180.0
        if d > 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2.0 % 360.0


def _solve_longitude_for_mc(jd: float, target: float) -> float:
    return _solve_longitude_for_mc_cached(round(jd, 9), round(target % 360.0, 9))


def compute_planet_lines(jd: float, planet_lon: float, n_steps: int = 360) -> dict[str, list[dict]]:
    """Compute ASC/DSC/MC/IC lines for a single planet longitude.

    Returns dict of line_type -> list of {lat, lon} points.
    """
    lines: dict[str, list[dict]] = {"asc": [], "dsc": [], "mc": [], "ic": []}

    # MC / IC: single meridian each.
    mc_lon = _solve_longitude_for_mc(jd, planet_lon)
    ic_lon = _solve_longitude_for_mc(jd, (planet_lon + 180.0) % 360.0)
    # Draw as full meridians (sample latitudes for the polyline).
    for lat in range(-90, 91, 2):
        lines["mc"].append({"lat": float(lat), "lon": mc_lon})
        lines["ic"].append({"lat": float(lat), "lon": ic_lon})

    # ASC / DSC: solve latitude at each longitude step.
    for i in range(n_steps):
        lon = i * 360.0 / n_steps
        lat_asc = _solve_latitude_for_angle(jd, lon, planet_lon, "asc")
        if lat_asc is not None:
            lines["asc"].append({"lat": round(lat_asc, 3), "lon": round(lon, 3)})
        lat_dsc = _solve_latitude_for_angle(jd, lon, (planet_lon + 180.0) % 360.0, "dsc")
        if lat_dsc is not None:
            lines["dsc"].append({"lat": round(lat_dsc, 3), "lon": round(lon, 3)})

    return lines


def compute_parans(jd: float, bodies: list[eng.BodyPosition]) -> list[dict]:
    """Compute paran crossings: planet A on one angle while planet B on another.

    For each unordered pair of planets and each angle combo (A on ASC/DSC,
    B on MC/IC), fix the meridian from B's condition, then solve latitude for
    A's horizon condition. Returns a deduped list of crossing points.
    """
    parans: list[dict] = []
    seen: set = set()
    lon_by_id = {b.id: b.lon for b in bodies if b.id in PLANET_COLORS}
    ids = sorted(lon_by_id.keys())

    for i, a_id in enumerate(ids):
        for b_id in ids[i + 1:]:
            a_lon = lon_by_id[a_id]
            b_lon = lon_by_id[b_id]
            for b_angle, b_target in (("mc", b_lon), ("ic", (b_lon + 180.0) % 360.0)):
                meridian = _solve_longitude_for_mc(jd, b_target)
                for a_angle in ("asc", "dsc"):
                    target = a_lon if a_angle == "asc" else (a_lon + 180.0) % 360.0
                    lat = _solve_latitude_for_angle(jd, meridian, target, a_angle)
                    if lat is not None:
                        key = frozenset([(a_id, a_angle), (b_id, b_angle)])
                        if key in seen:
                            continue
                        seen.add(key)
                        # Canonical order: sort by planet id for stable output.
                        pa, pb = sorted([(a_id, a_angle), (b_id, b_angle)])
                        parans.append({
                            "a_id": pa[0],
                            "a_angle": pa[1],
                            "b_id": pb[0],
                            "b_angle": pb[1],
                            "lat": round(lat, 3),
                            "lon": round(meridian, 3),
                        })
    return parans


def compute_astrocartography(
    utc_dt: datetime,
    bodies: list[eng.BodyPosition],
    n_steps: int = 360,
) -> dict:
    """Full astrocartography payload for a birth moment.

    Results are cached in-process keyed by the UTC moment + step count, since
    a birth moment's lines never change.
    """
    jd = eng.jd_from_utc(utc_dt)
    cache_key = (round(jd, 9), n_steps)
    cached = _ACG_CACHE.get(cache_key)
    if cached is not None:
        return cached
    planets = {}
    for b in bodies:
        if b.id in PLANET_COLORS:
            planets[b.id] = {
                "id": b.id,
                "name": b.name,
                "glyph": b.glyph,
                "color": PLANET_COLORS[b.id],
                "lines": compute_planet_lines(jd, b.lon, n_steps),
            }
    parans = compute_parans(jd, bodies)
    payload = {
        "utc": utc_dt.isoformat(),
        "planets": planets,
        "parans": parans,
    }
    _ACG_CACHE[cache_key] = payload
    return payload


_ACG_CACHE: dict = {}