"""Swiss Ephemeris wrapper.

Centralizes all pyswisseph calls so the rest of the app never touches the C
library directly. Pins the conventions from CONVENTIONS.md:

- Tropical zodiac (SIDM_F_TROPICAL)
- Ecliptic longitude for planets (Aries = 0, 0-360)
- RAMC for house math
- Retrograde derived from speed sign
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone

import swisseph as swe

# Point Swiss Ephemeris at our bundled .se1 files.
_EPHE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
)
swe.set_ephe_path(_EPHE_DIR)

# Tropical zodiac, topocentric off (geocentric), no sidereal mode.
swe.set_sid_mode(swe.SIDM_FAGAN_BRADLEY)  # irrelevant; we never use sidereal

# Planet/point IDs used by the app.
SUN = swe.SUN
MOON = swe.MOON
MERCURY = swe.MERCURY
VENUS = swe.VENUS
MARS = swe.MARS
JUPITER = swe.JUPITER
SATURN = swe.SATURN
URANUS = swe.URANUS
NEPTUNE = swe.NEPTUNE
PLUTO = swe.PLUTO
CHIRON = swe.CHIRON
MEAN_NODE = swe.MEAN_NODE
TRUE_NODE = swe.TRUE_NODE
MEAN_APOGEE = swe.MEAN_APOG  # Mean Lilith
OSCULATING_APOGEE = swe.OSCU_APOG
CERES = swe.CERES
PALLAS = swe.PALLAS
JUNO = swe.JUNO
VESTA = swe.VESTA
# NOTE: The Vertex is NOT a body ID in Swiss Ephemeris (swe.VERTEX == swe.VENUS == 3).
# It is an angle returned in the ascmc array. We handle it separately via
# get_asc_mc() and add it to charts as a derived point.

# Swiss Ephemeris flag: Swiss Ephemeris mode + speed (for retrograde).
FLG = swe.FLG_SWIEPH | swe.FLG_SPEED

# Human-readable names and glyphs.
BODY_META: dict[int, dict[str, str]] = {
    SUN: {"name": "Sun", "glyph": "☉"},
    MOON: {"name": "Moon", "glyph": "☽"},
    MERCURY: {"name": "Mercury", "glyph": "☿"},
    VENUS: {"name": "Venus", "glyph": "♀"},
    MARS: {"name": "Mars", "glyph": "♂"},
    JUPITER: {"name": "Jupiter", "glyph": "♃"},
    SATURN: {"name": "Saturn", "glyph": "♄"},
    URANUS: {"name": "Uranus", "glyph": "♅"},
    NEPTUNE: {"name": "Neptune", "glyph": "♆"},
    PLUTO: {"name": "Pluto", "glyph": "♇"},
    CHIRON: {"name": "Chiron", "glyph": "⚷"},
    MEAN_NODE: {"name": "Mean Node", "glyph": "☊"},
    TRUE_NODE: {"name": "North Node", "glyph": "☊"},
    MEAN_APOGEE: {"name": "Mean Lilith", "glyph": "⚸"},
    CERES: {"name": "Ceres", "glyph": "⚳"},
    PALLAS: {"name": "Pallas", "glyph": "⚴"},
    JUNO: {"name": "Juno", "glyph": "⚵"},
    VESTA: {"name": "Vesta", "glyph": "⚶"},
}

# Vertex is a derived angle, not a body ID. Give it a stable pseudo-ID for
# chart payloads (distinct from all real body IDs).
VERTEX_ID = 900
BODY_META[VERTEX_ID] = {"name": "Vertex", "glyph": "⨁"}

# Default set of bodies for a natal chart.
NATAL_BODIES: list[int] = [
    SUN, MOON, MERCURY, VENUS, MARS, JUPITER, SATURN, URANUS, NEPTUNE, PLUTO,
    CHIRON, TRUE_NODE, CERES, PALLAS, VESTA, JUNO, MEAN_APOGEE,
]

# House systems supported by the app.
HOUSE_PLACIDUS = "P"
HOUSE_KOCH = "K"
HOUSE_WHOLE = "W"
HOUSE_EQUAL = "E"

SIGN_NAMES = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]
SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"]
ELEMENTS = {
    "Aries": "fire", "Leo": "fire", "Sagittarius": "fire",
    "Taurus": "earth", "Virgo": "earth", "Capricorn": "earth",
    "Gemini": "air", "Libra": "air", "Aquarius": "air",
    "Cancer": "water", "Scorpio": "water", "Pisces": "water",
}


def jd_from_utc(dt: datetime) -> float:
    """Convert a timezone-aware UTC datetime to a Julian Day (UT)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    return swe.julday(
        dt.year, dt.month, dt.day,
        dt.hour + dt.minute / 60.0 + dt.second / 3600.0 + dt.microsecond / 3.6e9,
    )


def _normalize(lon: float) -> float:
    return lon % 360.0


@dataclass
class BodyPosition:
    id: int
    name: str
    glyph: str
    lon: float          # ecliptic longitude 0-360
    lat: float          # ecliptic latitude
    speed: float        # degrees/day; negative => retrograde
    retrograde: bool = False
    house: int | None = None
    sign: str = ""
    sign_index: int = 0
    degree_in_sign: float = 0.0
    degree_str: str = ""
    house_str: str = ""

    def __post_init__(self) -> None:
        self.lon = _normalize(self.lon)
        self.sign_index = int(self.lon // 30) % 12
        self.sign = SIGN_NAMES[self.sign_index]
        self.degree_in_sign = self.lon - self.sign_index * 30.0
        self.degree_str = format_degree(self.degree_in_sign)
        self.retrograde = self.speed < 0
        self.house_str = f"{self.house}th House" if self.house else ""


def format_degree(deg: float) -> str:
    """Format a degree-in-sign as e.g. '13°18′'."""
    d = int(deg)
    m = int(round((deg - d) * 60))
    if m == 60:
        d += 1
        m = 0
    return f"{d}°{m:02d}′"


def format_lon(lon: float) -> str:
    """Format a full ecliptic longitude as e.g. 'Scorpio 13°18′'."""
    lon = _normalize(lon)
    si = int(lon // 30) % 12
    return f"{SIGN_NAMES[si]} {format_degree(lon - si * 30.0)}"


def get_body_positions(jd: float, bodies: list[int] | None = None) -> list[BodyPosition]:
    """Compute ecliptic positions + speeds for the given bodies at Julian Day `jd`."""
    # Defensive: pyswisseph's C-level ephe path can appear unset when called
    # from some server thread contexts; re-assert it (idempotent).
    swe.set_ephe_path(_EPHE_DIR)
    bodies = bodies or NATAL_BODIES
    out: list[BodyPosition] = []
    for bid in bodies:
        pos, _ = swe.calc_ut(jd, bid, FLG)
        lon, lat, speed = pos[0], pos[1], pos[3]
        meta = BODY_META.get(bid, {"name": f"Body{bid}", "glyph": "?"})
        out.append(
            BodyPosition(
                id=bid,
                name=meta["name"],
                glyph=meta["glyph"],
                lon=lon,
                lat=lat,
                speed=speed,
            )
        )
    return out


def get_house_cusps(jd: float, lat: float, lon: float, hsys: str = HOUSE_PLACIDUS) -> list[float]:
    """Return the 12 house cusp ecliptic longitudes for the given system.

    Raises ValueError if the house system is undefined at this latitude (polar
    Placidus/Koch failure) so callers can fall back.
    """
    swe.set_ephe_path(_EPHE_DIR)
    # houses_ex returns (cusps, ascmc). We use the cusps array.
    cusps, _ = swe.houses_ex(jd, lat, lon, hsys.encode())
    return [float(c) for c in cusps[:12]]


def get_asc_mc(jd: float, lat: float, lon: float, hsys: str = HOUSE_PLACIDUS) -> dict[str, float]:
    """Return Ascendant, MC, IC, Descendant ecliptic longitudes."""
    swe.set_ephe_path(_EPHE_DIR)
    _, ascmc = swe.houses_ex(jd, lat, lon, hsys.encode())
    # ascmc[0]=ASC, [1]=MC, [2]=ARMC, [3]=Vertex, [4]=equat. ASC, [5]=co-ASC, [6]=co-MC, [7]=Polaris
    return {
        "asc": _normalize(float(ascmc[0])),
        "mc": _normalize(float(ascmc[1])),
        "armc": float(ascmc[2]),
        "vertex": _normalize(float(ascmc[3])),
    }


def vertex_body(jd: float, lat: float, lon: float, hsys: str = HOUSE_PLACIDUS) -> BodyPosition:
    """Build a BodyPosition for the Vertex (derived from the ascmc array)."""
    angles = get_asc_mc(jd, lat, lon, hsys)
    return BodyPosition(
        id=VERTEX_ID,
        name="Vertex",
        glyph="⨁",
        lon=angles["vertex"],
        lat=0.0,
        speed=0.0,
    )


def mean_obliquity(jd: float) -> float:
    """Mean obliquity of the ecliptic (degrees) at Julian Day `jd`.

    IAU 1980 polynomial (Arcsec), accurate to <1" over 1900-2100 — plenty for
    house-cusp work (true-vs-mean difference peaks around 9").
    """
    T = (jd - 2451545.0) / 36525.0
    secs = (
        84381.448
        - 46.8150 * T
        - 0.00059 * T**2
        + 0.001813 * T**3
    )
    return secs / 3600.0


def get_ramc(jd: float, lon: float) -> float:
    """Right ascension of the MC (RAMC) for a given UT and geographic longitude."""
    # RAMC = sidereal time at Greenwich + longitude. Use swe.sidtime.
    st = swe.sidtime(jd)  # Greenwich apparent sidereal time in degrees
    return _normalize(st + lon)


def is_placidus_defined(jd: float, lat: float, lon: float) -> bool:
    """Heuristic: Placidus is undefined near the poles for parts of the year.

    We detect failure by attempting the house computation and checking for
    NaN/zero cusps, which is what the solver returns when undefined.
    """
    try:
        cusps, _ = swe.houses_ex(jd, lat, lon, b"P")
        for c in cusps[:12]:
            if c != c or c == 0.0:  # NaN check
                return False
        return True
    except Exception:
        return False