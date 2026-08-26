"""Compute upcoming astrological events over a forward window:

- Retrograde stations (Mercury/Saturn/etc.) via speed-sign crossings on a grid
- Sign ingresses via sign-boundary crossings on the same grid
- Lunations (New/First Quarter/Full/Last Quarter)
- Solar & lunar ECLIPSES via Swiss Ephemeris' native finders (exact, fast)
- Major outer-planet aspects (Jupiter..Pluto pairs)

Strategy: one fine grid (0.1 d) pass over planet longitudes/speeds, then all
grid-based event detection runs against cached data. Eclipse search uses
swe.sol_eclipse_when_glob / swe.lun_eclipse_when chained across the window.
"""

from __future__ import annotations

from dataclasses import dataclass

import swisseph as swe

from ..ephemeris import engine as eng


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RETROGRADE_PLANETS = [
    eng.MERCURY, eng.VENUS, eng.MARS,
    eng.JUPITER, eng.SATURN, eng.URANUS, eng.NEPTUNE, eng.PLUTO,
]

GRID_BODIES = [
    eng.SUN, eng.MOON, eng.MERCURY, eng.VENUS, eng.MARS,
    eng.JUPITER, eng.SATURN, eng.URANUS, eng.NEPTUNE, eng.PLUTO,
]

OUTER_ASPECTS = [0, 60, 90, 120, 180]
OUTER_ASPECT_NAMES = {0: "Conjunction", 60: "Sextile", 90: "Square",
                      120: "Trine", 180: "Opposition"}

LUNAR_ASPECTS = [0, 90, 180, 270]
LUNAR_NAMES = {0: "New Moon", 90: "First Quarter", 180: "Full Moon", 270: "Last Quarter"}

ECLIPSE_KIND = {
    swe.ECL_TOTAL: "Total",
    swe.ECL_ANNULAR: "Annular",
    swe.ECL_PARTIAL: "Partial",
    swe.ECL_ANNULAR_TOTAL: "Hybrid",
    swe.ECL_PENUMBRAL: "Penumbral",
}

STEP = 0.1  # days between grid samples

GRID: dict[int, list[list[float]]] = {}
JD0_GRID: float = 0.0
N_GRID: int = 0


@dataclass
class PlanetGrid:
    lons: list[float]
    speeds: list[float]


# ---------------------------------------------------------------------------
# Grid loading + interpolation
# ---------------------------------------------------------------------------

def _load_grid(jd0: float, days: int) -> dict[int, PlanetGrid]:
    """One swe.calc_ut sweep per body across the whole window."""
    global GRID, JD0_GRID, N_GRID
    n = int(days / STEP) + 2
    out: dict[int, PlanetGrid] = {}
    for p in GRID_BODIES:
        lons: list[float] = []
        speeds: list[float] = []
        for i in range(n):
            pos, _ = swe.calc_ut(jd0 + i * STEP, p, eng.FLG)
            lons.append(eng._normalize(float(pos[0])))
            speeds.append(float(pos[3]))
        out[p] = PlanetGrid(lons, speeds)
    GRID = {p: [out[p].lons, out[p].speeds] for p in out}  # type: ignore[misc]
    JD0_GRID = jd0
    N_GRID = n
    return out


def _idx_of(jd: float) -> int:
    return max(0, min(int((jd - JD0_GRID) / STEP), N_GRID - 2))


def _interp(a: float, b: float, jd: float) -> tuple[float, float]:
    i = _idx_of(jd)
    t = (jd - (JD0_GRID + i * STEP)) / STEP
    if b - a > 180.0:
        a += 360.0
    elif a - b > 180.0:
        b += 360.0
    return a, b, t


def _lon_at(jd: float, planet: int) -> float:
    lons = GRID[planet][0]
    i = _idx_of(jd)
    a, b, t = _interp(lons[i], lons[i + 1], jd)
    return eng._normalize(a + t * (b - a))


def _speed_at(jd: float, planet: int) -> float:
    speeds = GRID[planet][1]
    i = _idx_of(jd)
    t = (jd - (JD0_GRID + i * STEP)) / STEP
    return speeds[i] + t * (speeds[i + 1] - speeds[i])


def _angular_diff(a: float, b: float) -> float:
    d = eng._normalize(a - b)
    return d - 360.0 if d >= 180.0 else d


def _bisect(f, lo: float, hi: float, tol: float = 1e-6) -> float:
    flo = f(lo)
    for _ in range(50):
        mid = (lo + hi) / 2.0
        fm = f(mid)
        if abs(fm) < tol:
            return mid
        if flo * fm <= 0:
            hi = mid
        else:
            lo = mid
            flo = fm
    return (lo + hi) / 2.0


# ---------------------------------------------------------------------------
# Date formatting
# ---------------------------------------------------------------------------

def _jd_to_iso(jd: float) -> str:
    y, m, d, h24 = swe.revjul(jd)
    h = int(h24)
    mi = int((h24 - h) * 60)
    return f"{y:04d}-{m:02d}-{d:02d}T{h:02d}:{mi:02d}:00Z"


def _fmt_dt(jd: float) -> str:
    y, m, d, h24 = swe.revjul(jd)
    h = int(h24)
    mi = int((h24 - h) * 60)
    return f"{y:04d}-{m:02d}-{d:02d} {h:02d}:{mi:02d} UTC"


# ---------------------------------------------------------------------------
# Event detectors (all grid-cached)
# ---------------------------------------------------------------------------

def _find_stations(grid: dict[int, PlanetGrid], n: int, jd0: float,
                   limit: float) -> list[dict]:
    events: list[dict] = []
    for p in RETROGRADE_PLANETS:
        meta = eng.BODY_META[p]
        s = grid[p].speeds
        for i in range(n - 1):
            a, b = s[i], s[i + 1]
            direction = None
            if a > 0 >= b:
                direction = "Stationary Retrograde"
            elif a < 0 <= b:
                direction = "Stationary Direct"
            if direction is None:
                continue
            jda = jd0 + i * STEP
            jdb = jda + STEP
            jd_sta = _bisect(lambda x: _speed_at(x, p), jda, jdb)
            if jd_sta < jd0 or jd_sta > limit:
                continue
            lon = _lon_at(jd_sta, p)
            events.append({
                "type": "station",
                "planet": meta["name"],
                "glyph": meta["glyph"],
                "event": direction,
                "date": _fmt_dt(jd_sta),
                "iso": _jd_to_iso(jd_sta),
                "jd": round(jd_sta, 5),
                "position": eng.format_lon(lon),
                "sign_index": int(lon // 30) % 12,
            })
    events.sort(key=lambda e: e["jd"])
    return events


def _find_ingresses(grid: dict[int, PlanetGrid], n: int, jd0: float,
                    limit: float) -> list[dict]:
    events: list[dict] = []
    for p in GRID_BODIES:
        if p == eng.MOON:
            continue  # Moon ingresses every ~2.5 days; noise for cycle view
        meta = eng.BODY_META[p]
        lons = grid[p].lons
        for i in range(n - 1):
            a, b = lons[i], lons[i + 1]
            si_a = int(a // 30) % 12
            si_b = int(b // 30) % 12
            if si_a == si_b:
                continue
            jda = jd0 + i * STEP
            jdb = jda + STEP
            target = float(si_b * 30)
            # Bisection on signed angular distance to the boundary; works for
            # both direct and retrograde crossings incl. Pisces→Aries wrap.
            jd_ing = _bisect(lambda x: _angular_diff(_lon_at(x, p), target), jda, jdb)
            if jd_ing < jd0 or jd_ing > limit:
                continue
            lon = _lon_at(jd_ing, p)
            events.append({
                "type": "ingress",
                "planet": meta["name"],
                "glyph": meta["glyph"],
                "event": f"Enters {eng.SIGN_NAMES[si_b]}",
                "date": _fmt_dt(jd_ing),
                "iso": _jd_to_iso(jd_ing),
                "jd": round(jd_ing, 5),
                "position": eng.format_lon(lon),
                "sign_index": si_b,
            })
    events.sort(key=lambda e: e["jd"])
    return events


def _find_lunations(grid: dict[int, PlanetGrid], n: int, jd0: float,
                    limit: float) -> list[dict]:
    events: list[dict] = []
    suns = grid[eng.SUN].lons
    moons = grid[eng.MOON].lons
    for i in range(n - 1):
        d0 = _angular_diff(moons[i], suns[i])
        d1 = _angular_diff(moons[i + 1], suns[i + 1])
        for asp in LUNAR_ASPECTS:
            e0, e1 = d0 - asp, d1 - asp
            if e0 < 0 <= e1 and (e1 - e0) > 1.0:  # Moon gains ≥10°/day rel Sun
                jda = jd0 + i * STEP
                jdb = jda + STEP
                jd_l = _bisect(
                    lambda x: _angular_diff(_lon_at(x, eng.MOON),
                                            _lon_at(x, eng.SUN)) - float(asp),
                    jda, jdb,
                )
                if jd_l < jd0 or jd_l > limit:
                    continue
                events.append({
                    "type": "lunation",
                    "event": LUNAR_NAMES[asp],
                    "date": _fmt_dt(jd_l),
                    "iso": _jd_to_iso(jd_l),
                    "jd": round(jd_l, 5),
                    "position": (f"Sun {eng.format_lon(_lon_at(jd_l, eng.SUN))}"
                                 f" · Moon {eng.format_lon(_lon_at(jd_l, eng.MOON))}"),
                })
    events.sort(key=lambda e: e["jd"])
    return events


def _find_outer_aspects(grid: dict[int, PlanetGrid], n: int, jd0: float,
                        limit: float) -> list[dict]:
    events: list[dict] = []
    outer = [eng.JUPITER, eng.SATURN, eng.URANUS, eng.NEPTUNE, eng.PLUTO]
    for ai in range(len(outer)):
        for bi in range(ai + 1, len(outer)):
            p1, p2 = outer[ai], outer[bi]
            l1, l2 = grid[p1].lons, grid[p2].lons
            for k in range(n - 1):
                d0 = _angular_diff(l1[k], l2[k])
                d1 = _angular_diff(l1[k + 1], l2[k + 1])
                for asp in OUTER_ASPECTS:
                    e0, e1 = d0 - asp, d1 - asp
                    if e0 < 0 <= e1:
                        jda = jd0 + k * STEP
                        jdb = jda + STEP
                        jd_x = _bisect(
                            lambda x: _angular_diff(_lon_at(x, p1),
                                                    _lon_at(x, p2)) - float(asp),
                            jda, jdb,
                        )
                        if jd_x < jd0 or jd_x > limit:
                            continue
                        m1, m2 = eng.BODY_META[p1], eng.BODY_META[p2]
                        events.append({
                            "type": "aspect",
                            "planets": f"{m1['name']} · {m2['name']}",
                            "glyphs": f"{m1['glyph']}{m2['glyph']}",
                            "event": f"{OUTER_ASPECT_NAMES[asp]}",
                            "date": _fmt_dt(jd_x),
                            "iso": _jd_to_iso(jd_x),
                            "jd": round(jd_x, 5),
                        })
    events.sort(key=lambda e: e["jd"])
    return events


# ---------------------------------------------------------------------------
# Eclipses — Swiss Ephemeris native finders, chained across the window.
# ---------------------------------------------------------------------------

def _find_solar_eclipses(jd0: float, limit: float) -> list[dict]:
    events: list[dict] = []
    jd = jd0
    for _ in range(8):  # ≤ ~4-5 solar eclipses/year
        retflag, tret = swe.sol_eclipse_when_glob(jd, eng.FLG, 0)
        jd_max = tret[0]
        if jd_max > limit:
            break
        kind = next((v for k, v in ECLIPSE_KIND.items() if retflag & k), "Solar")
        sun_lon = eng._normalize(float(swe.calc_ut(jd_max, eng.SUN, eng.FLG)[0][0]))
        node_gap = abs(_angular_diff(sun_lon, eng._normalize(float(
            swe.calc_ut(jd_max, swe.TRUE_NODE, eng.FLG)[0][0]))))
        events.append({
            "type": "eclipse",
            "eclipse_kind": "Solar",
            "event": f"{'Solar'} Eclipse ({kind})",
            "date": _fmt_dt(jd_max),
            "iso": _jd_to_iso(jd_max),
            "jd": round(jd_max, 5),
            "position": eng.format_lon(sun_lon),
            "node_distance": round(node_gap, 1),
        })
        jd = jd_max + 10.0
    return events


def _find_lunar_eclipses(jd0: float, limit: float) -> list[dict]:
    events: list[dict] = []
    jd = jd0
    for _ in range(8):
        retflag, tret = swe.lun_eclipse_when(jd, eng.FLG, 0)
        jd_max = tret[0]
        if jd_max > limit:
            break
        kind = next((v for k, v in ECLIPSE_KIND.items() if retflag & k), "Lunar")
        moon_lon = eng._normalize(float(swe.calc_ut(jd_max, eng.MOON, eng.FLG)[0][0]))
        node_gap = abs(_angular_diff(moon_lon, eng._normalize(float(
            swe.calc_ut(jd_max, swe.TRUE_NODE, eng.FLG)[0][0]))))
        events.append({
            "type": "eclipse",
            "eclipse_kind": "Lunar",
            "event": f"Lunar Eclipse ({kind})",
            "date": _fmt_dt(jd_max),
            "iso": _jd_to_iso(jd_max),
            "jd": round(jd_max, 5),
            "position": eng.format_lon(moon_lon),
            "node_distance": round(node_gap, 1),
        })
        jd = jd_max + 10.0
    return events


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_cycles(jd0: float, days_ahead: int = 365) -> dict:
    limit = jd0 + days_ahead
    grid = _load_grid(jd0, days_ahead)
    n = N_GRID

    stations = _find_stations(grid, n, jd0, limit)
    ingresses = _find_ingresses(grid, n, jd0, limit)
    lunations = _find_lunations(grid, n, jd0, limit)
    outer_aspects = _find_outer_aspects(grid, n, jd0, limit)
    eclipses = sorted(
        _find_solar_eclipses(jd0, limit) + _find_lunar_eclipses(jd0, limit),
        key=lambda e: e["jd"],
    )

    # Mercury & Saturn spotlight series for quick reference panels.
    def _by_planet(name: str) -> list[dict]:
        return [e for e in stations if e["planet"] == name]

    return {
        "range_start": _fmt_dt(jd0),
        "range_end": _fmt_dt(limit),
        "days_ahead": days_ahead,
        "retrograde_stations": stations,
        "mercury": _by_planet("Mercury"),
        "saturn": _by_planet("Saturn"),
        "ingresses": ingresses,
        "lunations": lunations,
        "outer_aspects": outer_aspects,
        "eclipses": eclipses,
    }
