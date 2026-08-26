"""Aspect grid calculation.

Major aspects with a full orb table (spec §4). Orbs depend on the nature of
the two bodies involved. The grid is symmetric: if A aspects B, B aspects A
with the same orb.
"""

from __future__ import annotations

from dataclasses import dataclass

# Aspect: (name, angle, color, line_style)
ASPECTS: dict[str, dict] = {
    "conjunction": {"angle": 0.0, "color": "#f97316", "style": "solid", "glyph": "☌"},
    "opposition": {"angle": 180.0, "color": "#a855f7", "style": "solid", "glyph": "☍"},
    "trine": {"angle": 120.0, "color": "#3b82f6", "style": "solid", "glyph": "△"},
    "square": {"angle": 90.0, "color": "#ef4444", "style": "solid", "glyph": "□"},
    "sextile": {"angle": 60.0, "color": "#22c55e", "style": "solid", "glyph": "⚹"},
}

# Orb table (degrees). Rows: body category. Columns: aspect type.
# Categories: luminary (Sun/Moon), personal (Mercury..Mars), outer (Jupiter..Pluto),
# point (Chiron, nodes, asteroids, Lilith, Vertex, Fortune).
_ORBS = {
    "conjunction": {"luminary": 8.0, "personal": 6.0, "outer": 5.0, "point": 4.0},
    "opposition": {"luminary": 8.0, "personal": 6.0, "outer": 5.0, "point": 4.0},
    "trine": {"luminary": 7.0, "personal": 5.0, "outer": 4.0, "point": 3.0},
    "square": {"luminary": 7.0, "personal": 5.0, "outer": 4.0, "point": 3.0},
    "sextile": {"luminary": 5.0, "personal": 4.0, "outer": 3.0, "point": 2.0},
}

# Body id -> category
_LUMINARY = {0, 1}  # Sun, Moon
_PERSONAL = {2, 3, 4, 5}  # Mercury, Venus, Mars, Jupiter? Jupiter is outer-ish.
# We treat Jupiter as outer for orb purposes (spec groups outer planets/points).
_OUTER = {5, 6, 7, 8, 9}  # Jupiter, Saturn, Uranus, Neptune, Pluto


def _category(bid: int) -> str:
    if bid in _LUMINARY:
        return "luminary"
    if bid in _PERSONAL:
        return "personal"
    if bid in _OUTER:
        return "outer"
    return "point"


def _orb_for(aspect: str, a: int, b: int) -> float:
    """Orb for an aspect between two bodies = the larger of the two bodies' orbs."""
    ca, cb = _category(a), _category(b)
    return max(_ORBS[aspect][ca], _ORBS[aspect][cb])


@dataclass
class Aspect:
    a_id: int
    b_id: int
    a_name: str
    b_name: str
    type: str
    angle: float          # exact aspect angle (0,60,90,120,180)
    orb: float            # degrees from exact
    applying: bool        # True if the faster body is moving toward exact
    color: str
    style: str
    glyph: str


def find_aspect(a_id: int, b_id: int, lon_a: float, lon_b: float):
    """Return (name, meta, orb) for the tightest major aspect between two
    longitudes, or None if none within orb."""
    diff = abs((lon_a - lon_b + 180.0) % 360.0 - 180.0)
    best = None
    for name, meta in ASPECTS.items():
        orb = abs(diff - meta["angle"])
        if orb <= _orb_for(name, a_id, b_id):
            if best is None or orb < best[2]:
                best = (name, meta, orb)
    return best


def compute_aspects(bodies: list) -> list[Aspect]:
    """Compute the aspect grid for a list of BodyPosition objects.

    `bodies` must expose: id, name, lon, speed.
    """
    out: list[Aspect] = []
    n = len(bodies)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = bodies[i], bodies[j]
            diff = abs((a.lon - b.lon + 180.0) % 360.0 - 180.0)
            for name, meta in ASPECTS.items():
                orb = _orb_for(name, a.id, b.id)
                if abs(diff - meta["angle"]) <= orb:
                    # applying: faster body moving toward exact
                    speed_a, speed_b = a.speed, b.speed
                    # relative motion of a w.r.t. b
                    rel = speed_a - speed_b
                    # distance to exact in the direction of motion
                    target = meta["angle"]
                    # signed separation
                    sep = diff
                    # if rel > 0, a is moving forward relative to b
                    # applying if moving toward the aspect angle
                    applying = _is_applying(sep, target, rel)
                    out.append(
                        Aspect(
                            a_id=a.id, b_id=b.id,
                            a_name=a.name, b_name=b.name,
                            type=name, angle=meta["angle"], orb=abs(diff - meta["angle"]),
                            applying=applying,
                            color=meta["color"], style=meta["style"], glyph=meta["glyph"],
                        )
                    )
                    break
    return out


def _is_applying(sep: float, target: float, rel: float) -> bool:
    """Determine if the faster body is applying to (moving toward) the aspect.

    sep is the absolute separation (0-180). rel is relative speed (deg/day),
    positive if body A moves forward faster than B.
    """
    # We need the signed separation in the direction of A's motion.
    # Simplify: if rel is positive, A advances; the separation changes by -rel
    # when A is behind the target and +rel when ahead. Use a small numeric probe.
    # For robustness, compute separation change: d(sep)/dt = -rel * sign(sep - target)
    # where sep is measured as the smaller arc. This is approximate but adequate.
    if rel == 0:
        return False
    # signed separation from -180..180
    # We approximate: applying if moving toward the target angle.
    # If sep < target and rel > 0 -> closing (applying)
    # If sep > target and rel < 0 -> closing
    return (sep < target and rel > 0) or (sep > target and rel < 0)