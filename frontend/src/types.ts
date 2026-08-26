// Shared types mirroring the FastAPI payloads.

export interface BodyPos {
  id: number;
  name: string;
  glyph: string;
  lon: number;
  lat: number;
  speed: number;
  retrograde: boolean;
  house: number | null;
  house_str: string;
  sign: string;
  sign_index: number;
  degree_in_sign: number;
  degree_str: string;
  position_str: string;
}

export interface AspectHit {
  a_id: number;
  b_id: number;
  a_name: string;
  b_name: string;
  type: string;
  angle: number;
  orb: number;
  applying: boolean;
  color: string;
  style: string;
  glyph: string;
  label: string;
}

export interface Angles {
  asc: number;
  mc: number;
  armc?: number;
  vertex?: number;
}

export interface Chart {
  utc: string;
  lat: number;
  lon: number;
  house_system: string;
  house_system_label: string;
  fallback_applied: boolean;
  angles: Angles;
  cusps: number[];
  bodies: BodyPos[];
  aspects: AspectHit[];
  part_of_fortune?: string | null;
  part_of_fortune_lon?: number | null;
  place?: string | null;
  tz_name?: string | null;
  relocated?: boolean;
}

export interface ProgressionChart {
  prog_date: string;
  days: number;
  method: string;
  bodies: BodyPos[];
  angles: Angles;
  cusps: number[];
}

export interface TransitPayload {
  transit_utc: string;
  bodies: BodyPos[];
  triggers: Trigger[];
}

export interface Trigger {
  transit: string;
  transit_sign: string;
  transit_degree: string;
  transit_retrograde: boolean;
  natal: string;
  natal_sign: string;
  natal_degree: string;
  aspect: string;
  orb: number;
  color: string;
  label: string;
}

export type LineKind = "asc" | "dsc" | "mc" | "ic";

export interface AcgLinePoint {
  lat: number;
  lon: number;
}

export interface AcgPlanet {
  id: number;
  name: string;
  glyph: string;
  color: string;
  lines: Record<LineKind, AcgLinePoint[]>;
}

export interface Paran {
  a_id: number;
  a_angle: LineKind;
  b_id: number;
  b_angle: LineKind;
  lat: number;
  lon: number;
}

export interface Astrocartography {
  utc: string;
  planets: Record<string, AcgPlanet>;
  parans: Paran[];
}

export interface PlaceHit {
  name: string;
  country: string;
  lat: number;
  lon: number;
  tz: string | null;
}

export interface Profile {
  id: number;
  name: string;
  birth_local: string;
  place_name: string;
  lat: number;
  lon: number;
  tz_name: string | null;
  house_system: string;
}

// ---------- Cycles ----------

export interface CycleEvent {
  type: "station" | "ingress" | "lunation" | "aspect" | "eclipse";
  event: string;
  date: string;
  iso: string;
  jd: number;
  position?: string;
  sign_index?: number;
  // station
  planet?: string;
  glyph?: string;
  // aspect
  planets?: string;
  glyphs?: string;
  // eclipse
  eclipse_kind?: "Solar" | "Lunar";
  node_distance?: number;
}

export interface CyclesPayload {
  range_start: string;
  range_end: string;
  days_ahead: number;
  retrograde_stations: CycleEvent[];
  mercury: CycleEvent[];
  saturn: CycleEvent[];
  ingresses: CycleEvent[];
  lunations: CycleEvent[];
  outer_aspects: CycleEvent[];
  eclipses: CycleEvent[];
}

// ---------- Structured timeline (xlsx schema) ----------

export interface BodyRef {
  name: string;
  glyph: string | null;
  unicode: string | null;
}

export interface ActionRef {
  name: string;
  glyph: string | null;
  angle_degrees: number | null;
  unicode: string | null;
}

export interface PositionRef {
  sign: string;
  degree: number | null;
  minute: number | null;
  is_retrograde: boolean;
}

export interface TimelineEvent {
  event_id: string;
  timestamp_utc: string;
  jd: number;
  event_type: "ECLIPSE" | "ASPECT" | "INGRESS" | "STATION" | "LUNATION";
  primary_body: BodyRef;
  aspect_or_action: ActionRef;
  secondary_body: BodyRef | null;
  position: PositionRef | null;
  position_str: string | null;
  interpretation: string;
  curated: boolean;
  event: string;
  date: string;
  planets?: string | null;
  glyphs?: string | null;
}

export interface TimelinePayload {
  range_start: string;
  range_end: string;
  days_ahead: number;
  total: number;
  metrics: Record<string, number>;
  events: TimelineEvent[];
}

// ---------- Harmonic Orbit Resonance ----------

export interface HarmonicLink {
  inner: string;
  outer: string;
  glyphs: string;
  q: number;
  h_label: string;
  h_value: number;
  omega: number;
  vacant: boolean;
  vacant_a: number | null;
}

export interface HarmonicBody {
  name: string;
  glyph: string;
  a_obs: number;
  t_years: number;
  q_prev: number | null;
  h_label: string | null;
  omega: number | null;
  hor_pred: number;
  tb_pred: number;
  hor_acc: number;
  tb_acc: number;
}

export interface HarmonicsPayload {
  bodies: HarmonicBody[];
  links: HarmonicLink[];
  vacant_zones: Array<{ pair: string; subdivision: string; a_pred: number }>;
  gradient: {
    dq_mean: number;
    dq_std: number;
    dq_std_excl_neptune: number;
    uranus_pluto_direct: { q: number; h_label: string; omega: number; neptune_interleaved: boolean };
  };
  summary: { hor_mean_err: number; tb_mean_err: number; tb_pluto_fail: number };
}
