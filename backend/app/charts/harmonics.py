"""Harmonic Orbit Resonance (HOR) analysis of solar-system orbital spacing.

Compares the classical empirical Titius–Bode (TB) law against the harmonic
resonance model:

- Each adjacent planet pair is matched to the dominant commensurability
  ratio set {3:2, 5:3, 2:1, 5:2, 3:1} by minimizing the residual
  omega = |1 - (H)(T_inner/T_outer)|.
- HOR predicted distances walk from the Earth anchor (1 AU) via Kepler's
  third law (R ∝ T^(2/3)) using the *idealized* harmonic ratio per link.
- TB prediction: R_n = 0.4 + 0.3 * 2^(n-1), with the ad hoc Mercury value
  of 0.4 AU (no exponential term), exactly as classically formulated.
- Vacant resonance zones: a matched 5:2 link subdivides as (5:3)×(3:2),
  predicting an unoccupied intermediate orbit at a_inner * (5/3)^(2/3).
- Neptune interleaving: excluding Neptune, the Uranus→Pluto ratio is a
  near-perfect 3:1; Neptune slots between them as 2:1 + 3:2.

All periods and semi-major axes are standard JPL-quality mean values.
"""

from __future__ import annotations

# name, glyph, semi-major axis (AU), orbital period (days)
BODIES: list[tuple[str, str, float, float]] = [
    ("Mercury", "☿", 0.38710, 87.9691),
    ("Venus", "♀", 0.72333, 224.7008),
    ("Earth", "⊕", 1.00000, 365.2564),
    ("Mars", "♂", 1.52368, 686.9800),
    ("Ceres", "⚳", 2.76580, 1680.00),
    ("Jupiter", "♃", 5.20260, 4332.589),
    ("Saturn", "♄", 9.55491, 10759.22),
    ("Uranus", "♅", 19.2184, 30688.50),
    ("Neptune", "♆", 30.1104, 60182.00),
    ("Pluto", "♇", 39.4821, 90560.00),
]

# label, ratio  — the five dominant HOR commensurabilities
HARMONIC_SET: list[tuple[str, float]] = [
    ("3:2", 1.5),
    ("5:3", 5.0 / 3.0),
    ("2:1", 2.0),
    ("5:2", 2.5),
    ("3:1", 3.0),
]

EARTH_IDX = 2


def _omega(h: float, q: float) -> float:
    """Residual for harmonic ratio h against observed period ratio q."""
    return abs(1.0 - h / q)


def _match(q: float) -> tuple[str, float, float]:
    """Return (label, ratio, omega) for the best-fitting harmonic."""
    best = min(HARMONIC_SET, key=lambda hr: _omega(hr[1], q))
    return best[0], best[1], _omega(best[1], q)


def _tb(index: int) -> float:
    """Titius–Bode distance. index 0 = Mercury (ad hoc 0.4), 1..9 = rest."""
    if index == 0:
        return 0.4
    return 0.4 + 0.3 * (2.0 ** (index - 1))


def _fmt(x: float, nd: int = 3) -> float:
    return round(x, nd)


def compute_harmonics() -> dict:
    n = len(BODIES)

    # ---------- links between adjacent bodies ----------
    links: list[dict] = []
    for i in range(n - 1):
        name_i, glyph_i, a_i, t_i = BODIES[i]
        name_j, glyph_j, a_j, t_j = BODIES[i + 1]
        q = t_j / t_i
        h_label, h_val, om = _match(q)
        link = {
            "inner": name_i,
            "outer": name_j,
            "glyphs": f"{glyph_i}{glyph_j}",
            "q": _fmt(q, 4),
            "h_label": h_label,
            "h_value": _fmt(h_val, 4),
            "omega": _fmt(om, 4),
            "vacant": h_label == "5:2",
            "vacant_a": _fmt(a_i * (5.0 / 3.0) ** (2.0 / 3.0), 3) if h_label == "5:2" else None,
        }
        links.append(link)

    # ---------- HOR distance walk from the Earth anchor ----------
    hor_pred: list[float] = [0.0] * n
    hor_pred[EARTH_IDX] = 1.0
    for i in range(EARTH_IDX, n - 1):
        hor_pred[i + 1] = hor_pred[i] * links[i]["h_value"] ** (2.0 / 3.0)
    for i in range(EARTH_IDX - 1, -1, -1):
        hor_pred[i] = hor_pred[i + 1] / links[i]["h_value"] ** (2.0 / 3.0)

    # ---------- per-body prediction table ----------
    bodies_out: list[dict] = []
    hor_errs: list[float] = []
    tb_errs: list[float] = []
    for i, (name, glyph, a, t) in enumerate(BODIES):
        tb_p = _tb(i)
        hor_acc = hor_pred[i] / a
        tb_acc = tb_p / a
        if i != EARTH_IDX:
            hor_errs.append(abs(hor_acc - 1.0))
            tb_errs.append(abs(tb_acc - 1.0))
        bodies_out.append({
            "name": name,
            "glyph": glyph,
            "a_obs": _fmt(a, 3),
            "t_years": _fmt(t / 365.2564, 2),
            "q_prev": links[i - 1]["q"] if i > 0 else None,
            "h_label": links[i - 1]["h_label"] if i > 0 else None,
            "omega": links[i - 1]["omega"] if i > 0 else None,
            "hor_pred": _fmt(hor_pred[i], 3),
            "tb_pred": _fmt(tb_p, 2),
            "hor_acc": _fmt(hor_acc, 3),
            "tb_acc": _fmt(tb_acc, 3),
        })

    # ---------- gradient of the progression factor ----------
    qs = [lnk["q"] for lnk in links]
    dqs = [qs[i + 1] - qs[i] for i in range(len(qs) - 1)]
    mean = lambda xs: sum(xs) / len(xs)
    std = lambda xs: (sum((x - mean(xs)) ** 2 for x in xs) / len(xs)) ** 0.5
    dq_mean, dq_std = mean(dqs), std(dqs)

    # Neptune interleaving: drop the Uranus–Neptune link; Uranus→Pluto direct.
    t_ura, t_plu = BODIES[7][3], BODIES[9][3]
    q_up = t_plu / t_ura
    up_label, up_val, up_om = _match(q_up)
    dqs_no_nep = dqs[:6] + [q_up - qs[6]]  # replace Uranus→Neptune, Neptune→Pluto with Uranus→Pluto
    dq_std_no_nep = std(dqs_no_nep)

    # ---------- vacant zones ----------
    vacant = [
        {
            "pair": f"{lnk['inner']} – {lnk['outer']}",
            "subdivision": "(5:3) × (3:2)",
            "a_pred": lnk["vacant_a"],
        }
        for lnk in links if lnk["vacant"]
    ]

    return {
        "bodies": bodies_out,
        "links": links,
        "vacant_zones": vacant,
        "gradient": {
            "dq_mean": _fmt(dq_mean, 3),
            "dq_std": _fmt(dq_std, 3),
            "dq_std_excl_neptune": _fmt(dq_std_no_nep, 3),
            "uranus_pluto_direct": {
                "q": _fmt(q_up, 4),
                "h_label": up_label,
                "omega": _fmt(up_om, 4),
                "neptune_interleaved": up_om < links[7]["omega"] + links[8]["omega"],
            },
        },
        "summary": {
            "hor_mean_err": _fmt(mean(hor_errs), 4),
            "tb_mean_err": _fmt(mean(tb_errs), 4),
            "tb_pluto_fail": _fmt(_tb(9) / BODIES[9][2], 3),
        },
    }
