"""Validation gate tests (spec §5a).

Includes the round-trip test: compute the chart from the seed input
(1995-08-31 07:08 local, Fort Worth, TX) and compare against the seed profile
positions from the spec §2.
"""

from __future__ import annotations

import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ephemeris import engine as eng
from app.ephemeris.aspects import compute_aspects
from app.charts.service import compute_natal, compute_draconic
from app.geo.geocode import local_to_utc, resolve_timezone

# Seed input
SEED_LOCAL = datetime(1995, 8, 31, 7, 8, 0)
SEED_LAT, SEED_LON = 32.7555, -97.3308  # Fort Worth, TX
SEED_TZ = "America/Chicago"


def seed_utc() -> datetime:
    return local_to_utc(SEED_LOCAL, SEED_LAT, SEED_LON, SEED_TZ)


def test_timezone_resolution():
    tz = resolve_timezone(SEED_LAT, SEED_LON)
    assert tz == "America/Chicago", tz


def test_utc_conversion():
    utc = seed_utc()
    # CDT = UTC-5, so 07:08 local = 12:08 UTC
    assert utc.hour == 12 and utc.minute == 8, utc
    assert utc.tzinfo == timezone.utc


def test_roundtrip_seed_profile():
    """Compute the natal chart from the seed input and check key positions."""
    utc = seed_utc()
    chart = compute_natal(utc, SEED_LAT, SEED_LON, eng.HOUSE_PLACIDUS)
    bodies = {b["name"]: b for b in chart["bodies"]}

    def check(name, sign, deg, tol=1.0):
        b = bodies[name]
        assert b["sign"] == sign, f"{name}: expected {sign}, got {b['sign']}"
        assert abs(b["degree_in_sign"] - deg) <= tol, \
            f"{name}: expected {deg} in {sign}, got {b['degree_in_sign']} in {b['sign']}"

    check("Sun", "Virgo", 7.63)        # 7°38′
    check("Moon", "Scorpio", 13.30)    # 13°18′
    check("Mercury", "Libra", 3.15)    # 3°09′
    check("Venus", "Virgo", 10.50)     # 10°30′
    check("Mars", "Libra", 25.55)      # 25°33′
    check("Jupiter", "Sagittarius", 6.77)  # 6°46′
    check("Saturn", "Pisces", 22.42)   # 22°25′
    check("Uranus", "Capricorn", 27.03)  # 27°02′
    check("Neptune", "Capricorn", 23.08)  # 23°05′
    check("Pluto", "Scorpio", 27.97)   # 27°58′
    check("Chiron", "Virgo", 28.72)    # 28°43′
    check("North Node", "Libra", 27.57)  # 27°34′


def test_house_assignment_regression():
    """Sun in 12th, Mercury in 1st given the seed (spec §5)."""
    utc = seed_utc()
    chart = compute_natal(utc, SEED_LAT, SEED_LON, eng.HOUSE_PLACIDUS)
    bodies = {b["name"]: b for b in chart["bodies"]}
    assert bodies["Sun"]["house"] == 12, bodies["Sun"]
    assert bodies["Mercury"]["house"] == 1, bodies["Mercury"]


def test_ascendant():
    utc = seed_utc()
    chart = compute_natal(utc, SEED_LAT, SEED_LON, eng.HOUSE_PLACIDUS)
    asc = chart["angles"]["asc"]
    # Ascendant should be Virgo ~7°49′ (7.82)
    assert 5.0 <= asc % 30 <= 10.0, f"ASC {asc} not in Virgo range"


def test_sign_boundary_handling():
    """29°59′ vs 0°00′ of next sign must normalize correctly."""
    from app.ephemeris.engine import format_lon
    assert format_lon(359.99).startswith("Pisces")
    assert format_lon(0.0).startswith("Aries")
    assert format_lon(30.0).startswith("Taurus")


def test_house_cusp_monotonicity():
    utc = seed_utc()
    chart = compute_natal(utc, SEED_LAT, SEED_LON, eng.HOUSE_PLACIDUS)
    cusps = chart["cusps"]
    # Cusps must be in rotational order (allow one wraparound).
    wrapped = 0
    for i in range(11):
        if cusps[i + 1] < cusps[i]:
            wrapped += 1
    assert wrapped <= 1, f"Too many wraparounds: {cusps}"


def test_retrograde_matches_speed_sign():
    utc = seed_utc()
    chart = compute_natal(utc, SEED_LAT, SEED_LON, eng.HOUSE_PLACIDUS)
    for b in chart["bodies"]:
        assert b["retrograde"] == (b["speed"] < 0), b["name"]


def test_aspect_symmetry():
    utc = seed_utc()
    chart = compute_natal(utc, SEED_LAT, SEED_LON, eng.HOUSE_PLACIDUS)
    pairs = set()
    for a in chart["aspects"]:
        key = (min(a["a_id"], a["b_id"]), max(a["a_id"], a["b_id"]))
        assert key not in pairs, f"Duplicate aspect pair {key}"
        pairs.add(key)


def test_draconic():
    utc = seed_utc()
    d = compute_draconic(utc, SEED_LAT, SEED_LON)
    assert len(d["bodies"]) > 0
    # Draconic Sun should be Aquarius ~10°00' per seed.
    sun = next(b for b in d["bodies"] if b["name"] == "Sun")
    assert sun["sign"] == "Aquarius", sun


def test_polar_fallback():
    """Placidus at high latitude should fall back to Whole Sign with a flag."""
    utc = seed_utc()
    chart = compute_natal(utc, 78.0, 15.0, eng.HOUSE_PLACIDUS)
    assert chart["fallback_applied"] is True
    assert chart["house_system"] == eng.HOUSE_WHOLE


if __name__ == "__main__":
    import traceback
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS {fn.__name__}")
            passed += 1
        except Exception as e:
            print(f"FAIL {fn.__name__}: {e}")
            traceback.print_exc()
    print(f"\n{passed}/{len(fns)} passed")
    sys.exit(0 if passed == len(fns) else 1)