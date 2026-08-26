"""Chart computation services: natal, transits, progressions, draconic.

Each returns a structured dict ready to serialize as JSON.
"""

from __future__ import annotations

from datetime import datetime, timezone

from ..ephemeris import engine as eng
from ..ephemeris.aspects import compute_aspects, find_aspect

# House system labels
HOUSE_LABELS = {
    eng.HOUSE_PLACIDUS: "Placidus",
    eng.HOUSE_KOCH: "Koch",
    eng.HOUSE_WHOLE: "Whole Sign",
    eng.HOUSE_EQUAL: "Equal",
}


def _assign_houses(bodies: list[eng.BodyPosition], cusps: list[float]) -> None:
    """Assign each body to a house based on cusp longitudes.

    Cusps are in rotational order. A body is in house N if its longitude is
    >= cusp[N-1] and < cusp[N] (with wraparound at 0/360).
    """
    for b in bodies:
        lon = b.lon
        house = None
        for i in range(12):
            c1 = cusps[i]
            c2 = cusps[(i + 1) % 12]
            if c1 <= c2:
                if c1 <= lon < c2:
                    house = i + 1
                    break
            else:  # wraparound across 0/360
                if lon >= c1 or lon < c2:
                    house = i + 1
                    break
        b.house = house
        b.house_str = f"{house}th House" if house else ""


def _resolve_house_system(jd: float, lat: float, lon: float, hsys: str) -> tuple[str, list[float]]:
    """Return (effective_house_system, cusps), applying the polar fallback.

    If the requested system is Placidus/Koch and it's undefined at this
    latitude, fall back to Whole Sign and flag it.
    """
    if hsys in (eng.HOUSE_PLACIDUS, eng.HOUSE_KOCH):
        try:
            cusps = eng.get_house_cusps(jd, lat, lon, hsys)
            if all(c == c and c != 0.0 for c in cusps):
                return hsys, cusps
        except Exception:
            pass
        # Fallback
        return eng.HOUSE_WHOLE, eng.get_house_cusps(jd, lat, lon, eng.HOUSE_WHOLE)
    return hsys, eng.get_house_cusps(jd, lat, lon, hsys)


def compute_natal(
    utc_dt: datetime,
    lat: float,
    lon: float,
    hsys: str = eng.HOUSE_PLACIDUS,
    bodies: list[int] | None = None,
) -> dict:
    jd = eng.jd_from_utc(utc_dt)
    positions = eng.get_body_positions(jd, bodies)
    effective_hsys, cusps = _resolve_house_system(jd, lat, lon, hsys)
    _assign_houses(positions, cusps)
    angles = eng.get_asc_mc(jd, lat, lon, effective_hsys)
    # Append the Vertex as a derived point (it is an angle, not a body ID).
    positions.append(eng.vertex_body(jd, lat, lon, effective_hsys))
    _assign_houses([positions[-1]], cusps)
    aspects = compute_aspects(positions)

    # Part of Fortune (diurnal): ASC + Moon - Sun
    sun = next((p for p in positions if p.id == eng.SUN), None)
    moon = next((p for p in positions if p.id == eng.MOON), None)
    fortune_lon = None
    if sun and moon:
        fortune_lon = (angles["asc"] + moon.lon - sun.lon) % 360.0

    return {
        "utc": utc_dt.isoformat(),
        "lat": lat,
        "lon": lon,
        "house_system": effective_hsys,
        "house_system_label": HOUSE_LABELS[effective_hsys],
        "fallback_applied": effective_hsys != hsys,
        "angles": angles,
        "cusps": cusps,
        "bodies": [_body_dict(p) for p in positions],
        "aspects": [_aspect_dict(a) for a in aspects],
        "part_of_fortune": eng.format_lon(fortune_lon) if fortune_lon is not None else None,
        "part_of_fortune_lon": fortune_lon,
    }


def _body_dict(p: eng.BodyPosition) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "glyph": p.glyph,
        "lon": round(p.lon, 4),
        "lat": round(p.lat, 4),
        "speed": round(p.speed, 6),
        "retrograde": p.retrograde,
        "house": p.house,
        "house_str": p.house_str,
        "sign": p.sign,
        "sign_index": p.sign_index,
        "degree_in_sign": round(p.degree_in_sign, 4),
        "degree_str": p.degree_str,
        "position_str": f"{p.sign} {p.degree_str}",
    }


def _aspect_dict(a) -> dict:
    return {
        "a_id": a.a_id,
        "b_id": a.b_id,
        "a_name": a.a_name,
        "b_name": a.b_name,
        "type": a.type,
        "angle": a.angle,
        "orb": round(a.orb, 2),
        "applying": a.applying,
        "color": a.color,
        "style": a.style,
        "glyph": a.glyph,
        "label": f"{a.a_name} {a.type} {a.b_name}",
    }


def compute_transits(
    natal_utc: datetime,
    transit_utc: datetime,
    lat: float,
    lon: float,
    hsys: str = eng.HOUSE_PLACIDUS,
) -> dict:
    """Transiting positions at `transit_utc` overlaid on the natal chart."""
    natal = compute_natal(natal_utc, lat, lon, hsys)
    jd = eng.jd_from_utc(transit_utc)
    transit_positions = eng.get_body_positions(jd)
    # Transit houses use the natal location but transit time.
    effective_hsys, cusps = _resolve_house_system(jd, lat, lon, hsys)
    _assign_houses(transit_positions, cusps)

    # Active transit triggers: transiting planet aspecting natal planet.
    triggers = []
    for tp in transit_positions:
        for np_ in natal["bodies"]:
            found = find_aspect(tp.id, np_["id"], tp.lon, np_["lon"])
            if found:
                name, meta, orb = found
                triggers.append({
                    "transit": tp.name,
                    "transit_sign": tp.sign,
                    "transit_degree": tp.degree_str,
                    "transit_retrograde": tp.retrograde,
                    "natal": np_["name"],
                    "natal_sign": np_["sign"],
                    "natal_degree": np_["degree_str"],
                    "aspect": name,
                    "orb": round(orb, 2),
                    "color": meta["color"],
                    "label": f"Transiting {tp.name} in {tp.sign} {tp.degree_str} {name} Natal {np_['name']} in {np_['sign']} {np_['degree_str']}",
                })

    return {
        "transit_utc": transit_utc.isoformat(),
        "bodies": [_body_dict(p) for p in transit_positions],
        "triggers": triggers,
    }


def _houses_from_armc(armc: float, lat: float, eps: float, hsys: str):
    """Compute cusps from a given RAMC (used for progressed angles)."""
    import swisseph as swe
    swe.set_ephe_path(eng._EPHE_DIR)
    cusps, ascmc = swe.houses_armc(armc, lat, eps, hsys.encode())
    return [float(c) for c in cusps[:12]], ascmc


def compute_progressions(
    natal_utc: datetime,
    prog_date: datetime,
    lat: float,
    lon: float,
    hsys: str = eng.HOUSE_PLACIDUS,
) -> dict:
    """Secondary progressions: day-for-a-year.

    Progressed planets = ephemeris positions at natal_jd + (days since birth
    / days-per-year), i.e. one ephemeris day elapses per year of life.
    Progressed angles advance by the Naibod arc in right ascension
    (~0.9856°/day of elapsed life). Disclosed per spec §4.
    """
    natal_jd = eng.jd_from_utc(natal_utc)
    prog_jd = eng.jd_from_utc(prog_date)
    days = prog_jd - natal_jd                      # elapsed days of LIFE
    DAYS_PER_YEAR = 365.2425
    planet_jd = natal_jd + days / DAYS_PER_YEAR    # ephemeris day-for-a-year

    # Progressed planets: ephemeris at natal + (elapsed life)/365.2425 days.
    prog_positions = eng.get_body_positions(planet_jd)
    # Houses for progressed planets use the progressed moment's angles at the
    # natal location; we derive cusps from the progressed RAMC below instead
    # of a raw houses_ex call so cusps stay consistent with the Naibod-arc angles.
    effective_hsys = hsys

    # Progressed angles via Naibod arc in RA: progressed RAMC = natal ARMC +
    # 0.9856°/day of elapsed life. Cusps are derived from that RAMC (via
    # houses_armc) so the progressed wheel stays self-consistent.
    naibod = 0.9856473  # deg/day mean solar motion in RA
    prog_armc = (
        eng.get_asc_mc(natal_jd, lat, lon, effective_hsys)["armc"] + days * naibod
    ) % 360.0
    eps = eng.mean_obliquity(planet_jd)
    cusps, ascmc = _houses_from_armc(prog_armc, lat, eps, effective_hsys)
    _assign_houses(prog_positions, cusps)
    prog_angles = {
        "asc": float(ascmc[0]) % 360.0,
        "mc": float(ascmc[1]) % 360.0,
        "armc": prog_armc,
    }

    return {
        "prog_date": prog_date.isoformat(),
        "days": round(days, 2),
        "method": "Secondary progressions, day-for-a-year; progressed angles via Naibod arc in right ascension",
        "bodies": [_body_dict(p) for p in prog_positions],
        "angles": prog_angles,
        "cusps": cusps,
    }


def compute_draconic(natal_utc: datetime, lat: float, lon: float, hsys: str = eng.HOUSE_PLACIDUS) -> dict:
    """Draconic chart: tropical longitude minus tropical mean North Node longitude."""
    jd = eng.jd_from_utc(natal_utc)
    positions = eng.get_body_positions(jd)
    node = next((p for p in positions if p.id == eng.TRUE_NODE), None)
    if node is None:
        raise ValueError("True node not in body set")
    node_lon = node.lon
    for p in positions:
        p.lon = (p.lon - node_lon) % 360.0
        p.__post_init__()
    effective_hsys, cusps = _resolve_house_system(jd, lat, lon, hsys)
    _assign_houses(positions, cusps)
    aspects = compute_aspects(positions)
    return {
        "bodies": [_body_dict(p) for p in positions],
        "aspects": [_aspect_dict(a) for a in aspects],
        "cusps": cusps,
        "house_system": effective_hsys,
    }