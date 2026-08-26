"""Structured transit-timeline engine.

Merges the ephemeris-computed event stream (cycles.py) with curated
interpretations stored in the event_interpretations table (seeded from
astrology_timeline.xlsx). Emits the structured schema used by the
frontend timeline and any external consumers:

    event_id, timestamp_utc, event_type,
    primary_body {name, glyph, unicode},
    aspect_or_action {name, glyph, angle_degrees, unicode},
    secondary_body {name, glyph, unicode} | null,
    position {sign, degree, minute, is_retrograde} | null,
    interpretation, curated (bool)

Also returns a metrics summary (counts per category).
"""

from __future__ import annotations

from .. import models
from .cycles import compute_cycles

UNICODE_MAP = {
    "☉": "U+2609", "☽": "U+263D", "☿": "U+263F", "♀": "U+2640",
    "♂": "U+2642", "♃": "U+2643", "♄": "U+2644", "♅": "U+2645",
    "♆": "U+2646", "♇": "U+2647", "☊": "U+260A", "☋": "U+260B",
    "⚷": "U+26B7", "⚸": "U+26B8", "⚳": "U+26B3", "⚴": "U+26B4",
    "⚶": "U+26B6", "⚵": "U+26B5", "⊕": "U+2295",
    "☌": "U+260C", " opposition": "U+260D", "☍": "U+260D",
    "△": "U+25B3", "□": "U+25A1", "⚹": "U+26B9", "Rx": "U+211E",
    "Dx": "U+211F", "☊axis": "U+260A",
}

ASPECT_ANGLES = {"Conjunction": 0, "Sextile": 60, "Square": 90,
                 "Trine": 120, "Opposition": 180}

SIGN_KEYWORDS = {
    "Aries": "initiative and direct action", "Taurus": "stability and resources",
    "Gemini": "information and connection", "Cancer": "home and emotional roots",
    "Leo": "creative visibility", "Virgo": "craft and refinement",
    "Libra": "relationship and balance", "Scorpio": "depth and transformation",
    "Sagittarius": "expansion and meaning", "Capricorn": "structure and mastery",
    "Aquarius": "innovation and collective ideals", "Pisces": "dissolution and imagination",
}


def _uni(glyph: str | None) -> str | None:
    if not glyph:
        return None
    return UNICODE_MAP.get(glyph) or UNICODE_MAP.get(" " + glyph)


def _slug(s: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in s.lower()).strip("_")


def _position_obj(position: str | None, retrograde: bool) -> dict | None:
    """Parse 'Gemini 5°42'' into the structured position object."""
    if not position:
        return None
    sign, deg, minute = None, None, None
    for name in SIGN_KEYWORDS:
        if position.startswith(name):
            sign = name.upper()
            rest = position[len(name):].strip()
            deg_part = rest.split("°")[0].strip()
            if deg_part.isdigit():
                deg = int(deg_part)
            if "°" in rest:
                m = rest.split("°")[1].split("′")[0].strip("'′ ")
                if m.isdigit():
                    minute = int(m)
            break
    if sign is None:
        return None
    return {"sign": sign, "degree": deg, "minute": minute, "is_retrograde": retrograde}


def _template(event_type: str, ev: dict) -> str:
    pos = ev.get("position") or ""
    if event_type == "ingress":
        sign = ev["event"].split()[-1]
        return (f"{ev['planet']} enters {sign}, shifting its symbolism toward "
                f"{SIGN_KEYWORDS.get(sign, 'a new register')}.")
    if event_type == "station":
        if "Retrograde" in ev["event"]:
            return (f"{ev['planet']} stations retrograde at {pos}: review, recalibrate, and turn the "
                    f"{ev['planet']} function inward until its direct station.")
        return (f"{ev['planet']} stations direct at {pos}: the retrospective phase ends; forward "
                f"{ev['planet']} momentum resumes.")
    if event_type == "lunation":
        name = ev["event"]
        if name == "New Moon":
            return f"New Moon at {pos}: the lunar cycle resets — seed intentions aligned with {pos.split(' ')[0]}."
        if name == "Full Moon":
            return f"Full Moon at {pos}: culmination and illumination of what was seeded at the New Moon."
        if name == "First Quarter":
            return f"First Quarter at {pos}: friction that forces action on the New Moon's intentions."
        return f"Last Quarter at {pos}: release and revision before the next New Moon."
    if event_type == "eclipse":
        if "Solar" in ev["event"]:
            return (f"Solar eclipse at {pos}: a fate-accented new moon — Sun, Moon and lunar node align; "
                    f"accelerated beginnings along the {pos.split(' ')[0]} agenda.")
        return (f"Lunar eclipse at {pos}: a fate-accented full moon — Sun and Moon oppose across the nodal axis; "
                f"culmination and release along the {pos.split(' ')[0]} axis.")
    if event_type == "aspect":
        return (f"Exact {ev['event']} between {ev['planets']}: their combined symbolism peaks — "
                f"a harmonic alignment of the two orbital periods.")
    return ev["event"]


def _lookup_curated(s, ev: dict, date_key: str) -> models.EventInterpretation | None:
    planet = ev.get("planet")
    etype = ev["type"]
    cat_map = {"eclipse": "Eclipse", "aspect": "Aspect", "ingress": "Ingress",
               "station": "Station", "lunation": "New Moon"}
    cat = cat_map.get(etype)
    # 1) same date + same primary body (eclipse rows use "Sun/Moon" / "Moon")
    if planet:
        row = (s.query(models.EventInterpretation)
               .filter(models.EventInterpretation.date == date_key,
                       models.EventInterpretation.primary_body.in_([planet, f"Sun/{planet}", f"{planet}/Sun"]))
               .first())
        if row:
            return row
    # 2) same date + same category
    if cat:
        row = (s.query(models.EventInterpretation)
               .filter(models.EventInterpretation.date == date_key,
                       models.EventInterpretation.category == cat)
               .first())
        if row:
            return row
    return None


def compute_timeline(days: int = 365) -> dict:
    from datetime import datetime, timezone

    from ..ephemeris import engine as eng

    jd0 = eng.jd_from_utc(datetime.now(timezone.utc))
    cycles = compute_cycles(jd0, days)

    merged: list[dict] = []
    with models.SessionLocal() as s:
        for ev in (cycles["eclipses"] + cycles["lunations"] + cycles["retrograde_stations"]
                   + cycles["ingresses"] + cycles["outer_aspects"]):
            date_key = ev["iso"][:10]
            curated = _lookup_curated(s, ev, date_key)

            primary = ev.get("planet") or ("Sun/Moon" if ev["type"] == "eclipse" and "Solar" in ev["event"] else "Moon")
            glyph = ev.get("glyph") or ("☉/☽" if primary == "Sun/Moon" else "☽")
            secondary = None
            action = ev["event"]
            action_glyph = None
            if ev["type"] == "aspect":
                p1, _, p2 = ev["planets"].partition(" · ")
                g1, _, g2 = ev.get("glyphs", "").partition(" ")
                primary, glyph = p1, g1
                secondary = {"name": p2, "glyph": g2, "unicode": _uni(g2)}
                action_glyph = {"Conjunction": "☌", "Sextile": "⚹", "Square": "□",
                                "Trine": "△", "Opposition": "☍"}.get(ev["event"])
            elif ev["type"] == "lunation":
                secondary = {"name": "Sun", "glyph": "☉", "unicode": "U+2609"}
                action_glyph = "☌" if ev["event"] in ("New Moon",) else ("☍" if ev["event"] == "Full Moon" else "□")
            elif ev["type"] == "eclipse":
                secondary = {"name": "Lunar Node", "glyph": "☊", "unicode": "U+260A"}
                action_glyph = "☊"
            elif ev["type"] == "station":
                action_glyph = "Rx" if "Retrograde" in ev["event"] else "Dx"

            interpretation = curated.text if curated else _template(ev["type"], ev)
            retro = "Retrograde" in ev.get("event", "") and ev["type"] == "station"

            merged.append({
                "event_id": f"evt_{date_key.replace('-', '')}_{_slug(primary)}_{_slug(ev['event'])}",
                "timestamp_utc": ev["iso"],
                "jd": ev["jd"],
                "event_type": ev["type"].upper(),
                "primary_body": {"name": primary, "glyph": glyph, "unicode": _uni(glyph)},
                "aspect_or_action": {
                    "name": action,
                    "glyph": action_glyph,
                    "angle_degrees": ASPECT_ANGLES.get(action),
                    "unicode": _uni(action_glyph),
                },
                "secondary_body": secondary,
                "position": _position_obj(ev.get("position"), retro),
                "position_str": ev.get("position"),
                "interpretation": interpretation,
                "curated": curated is not None,
                # keep the raw fields the UI already uses
                "event": ev["event"],
                "date": ev["date"],
                "planets": ev.get("planets"),
                "glyphs": ev.get("glyphs"),
            })

    merged.sort(key=lambda e: e["jd"])

    metrics: dict[str, int] = {}
    for e in merged:
        metrics[e["event_type"]] = metrics.get(e["event_type"], 0) + 1

    return {
        "range_start": cycles["range_start"],
        "range_end": cycles["range_end"],
        "days_ahead": days,
        "total": len(merged),
        "metrics": metrics,
        "events": merged,
    }
