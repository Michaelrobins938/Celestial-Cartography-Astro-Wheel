"""Geocoding + historical timezone resolution.

Implements the input pipeline from CONVENTIONS.md:
1. Geocode place name -> lat/long via the bundled local gazetteer (no live API).
2. Historical timezone: lat/long + date -> IANA tz -> correct historical UTC offset
   via timezonefinder + tzdata.
3. Return a timezone-aware UTC datetime.

Power-user bypass: direct UTC + lat/long skips steps 1-2.
"""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from timezonefinder import TimezoneFinder

_GAZ_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "gazetteer.csv",
)

_tf = TimezoneFinder()


@dataclass
class Place:
    name: str
    country: str
    lat: float
    lon: float
    tz: str | None = None

    def __post_init__(self) -> None:
        if self.tz is None:
            self.tz = _tf.timezone_at(lat=self.lat, lng=self.lon)


def _load_gazetteer() -> list[Place]:
    places: list[Place] = []
    if not os.path.exists(_GAZ_PATH):
        return places
    with open(_GAZ_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                places.append(
                    Place(
                        name=row["name"],
                        country=row["country"],
                        lat=float(row["lat"]),
                        lon=float(row["lon"]),
                    )
                )
            except (KeyError, ValueError):
                continue
    return places


_GAZETTEER: list[Place] | None = None


def gazetteer() -> list[Place]:
    global _GAZETTEER
    if _GAZETTEER is None:
        _GAZETTEER = _load_gazetteer()
    return _GAZETTEER


def geocode(query: str) -> list[Place]:
    """Search the gazetteer by name (case-insensitive substring).

    Accepts bare names ("Fort Worth") and "Name, Country" forms; the country
    suffix, if present, must match the record's country prefix.
    """
    q = query.strip().lower()
    if not q:
        return []
    name_part, sep, country_part = q.partition(",")
    name_part = name_part.strip()
    country_part = country_part.strip()

    def matches(p: Place) -> bool:
        if name_part not in p.name.lower():
            return False
        if sep and country_part:
            return p.country.lower().startswith(country_part)
        return True

    matches_list = [p for p in gazetteer() if matches(p)]
    # Prefer exact name matches, then prefix matches.
    matches_list.sort(key=lambda p: (p.name.lower() != name_part, not p.name.lower().startswith(name_part)))
    return matches_list[:10]


def resolve_timezone(lat: float, lon: float) -> str | None:
    """Return the IANA timezone name for a coordinate, or None."""
    return _tf.timezone_at(lat=lat, lng=lon)


def local_to_utc(
    local_dt: datetime,
    lat: float,
    lon: float,
    tz_name: str | None = None,
) -> datetime:
    """Convert a naive local civil datetime to timezone-aware UTC.

    Uses the IANA timezone (resolved from lat/lon if not given) so historical
    DST and offset rules from tzdata apply.
    """
    if local_dt.tzinfo is not None:
        return local_dt.astimezone(timezone.utc)
    tz_name = tz_name or resolve_timezone(lat, lon)
    if tz_name is None:
        raise ValueError(f"Could not resolve timezone for lat={lat}, lon={lon}")
    tz = ZoneInfo(tz_name)
    aware = local_dt.replace(tzinfo=tz)
    return aware.astimezone(timezone.utc)


def utc_to_local(utc_dt: datetime, lat: float, lon: float, tz_name: str | None = None) -> datetime:
    """Convert a UTC datetime to local civil time at a coordinate."""
    tz_name = tz_name or resolve_timezone(lat, lon)
    if tz_name is None:
        return utc_dt
    return utc_dt.astimezone(ZoneInfo(tz_name))