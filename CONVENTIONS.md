# Celestial Blueprint — Calculation Conventions

This file pins the non-negotiable definitions that every downstream calculation depends on.
These decisions are made **before** any code is written and are treated as ground truth.
If you change one of these, every chart, aspect grid, and map line changes — so change them
deliberately and update the regression tests.

| Parameter | Decision | Rationale |
|---|---|---|
| **Zodiac** | **Tropical** (not sidereal) | Sidereal requires an ayanamsa selection (Lahiri, Fagan-Bradley, …). Different library defaults silently disagree by ~24°. We use tropical only. |
| **House system default** | **Placidus**, with **Whole Sign** and **Koch** as toggles | Per spec. Fallback when Placidus is undefined (polar latitudes) → **Whole Sign** with a visible UI warning (see below). |
| **Ecliptic vs equatorial** | **Ecliptic longitude/latitude** for planetary positions; **RAMC** (right ascension of MC) for house math | Swiss Ephemeris returns both; we pin which feeds which. Planets → ecliptic. Houses → RAMC. |
| **Angle convention** | **0°–360° ecliptic longitude, Aries = 0°** | Prevents off-by-one sign errors when converting to Sign+Degree+Minute. |
| **Time standard** | All internal storage in **UTC (ISO 8601, timezone-aware)** | Local birth time is converted to UTC via a **historical** timezone lookup before any ephemeris call. This is the single most common source of natal-chart error. |
| **Retrograde flag** | Derived from **ephemeris speed sign**, not a lookup table | Speed sign is what Swiss Ephemeris actually returns; we never hardcode station dates. |
| **Progression convention** | **Secondary progressions, day-for-a-year.** Progressed **angles** (ASC/MC) advance by the **Naibod arc in right ascension** (~0.9856°/day). | The spec requires us to pick one and label it in the UI so results are reproducible against astro.com. Naibod arc in RA is the common default. |
| **Draconic chart** | Draconic longitude = tropical longitude − tropical **mean North Node** longitude | Standard node-based draconic conversion. |
| **Part of Fortune** | Day chart: ASC + Moon − Sun (ecliptic longitudes) | Diurnal formula. The seed profile is a diurnal (day) chart. |
| **Circumpolar fallback** | If Placidus house division is undefined (birth latitude beyond ~66.5° for part of the year), fall back to **Whole Sign** and surface a visible UI warning. | Placidus is mathematically undefined inside the polar circles for some ecliptic points; never let the solver silently return garbage. |

## Input pipeline (order matters)

1. **Geocode** place name → lat/long via the bundled local gazetteer (no live API).
2. **Historical timezone** lat/long + date → IANA timezone → correct historical UTC offset
   (including pre-standardization local mean time and changed DST rules) via
   `timezonefinder` + `tzdata`.
3. Only then hand the UTC timestamp to the ephemeris engine.

Power-user bypass: direct UTC + lat/long skips steps 1–2.

## Seed profile (ground-truth round-trip test)

- **Input:** 1995-08-31 07:08 local, Fort Worth, Texas, USA
  (~32.7555°N, 97.3308°W, America/Chicago, CDT = UTC−5 → **1995-08-31 12:08:00 UTC**).
- **Expected output:** the "Virgo Rising Natal Synthesis" positions in the spec §2.
- The engine must reproduce these degrees from the input above (round-trip), not hardcode them.