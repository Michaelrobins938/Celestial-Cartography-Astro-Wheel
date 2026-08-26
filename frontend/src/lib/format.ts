// Formatting helpers shared across the dashboard.

export const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const;

export const SIGN_GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

export const ELEMENT_COLORS: Record<string, string> = {
  fire: "#f87171", // red
  earth: "#a3e635", // green-ish
  air: "#67e8f9", // cyan
  water: "#818cf8", // indigo
};

export const SIGN_ELEMENT: Record<string, string> = {
  Aries: "fire",
  Leo: "fire",
  Sagittarius: "fire",
  Taurus: "earth",
  Virgo: "earth",
  Capricorn: "earth",
  Gemini: "air",
  Libra: "air",
  Aquarius: "air",
  Cancer: "water",
  Scorpio: "water",
  Pisces: "water",
};

/** Normalize any longitude into [0, 360). */
export function norm(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

/** Smaller angular distance between two longitudes (0..180). */
export function angDiff(a: number, b: number): number {
  return Math.abs(norm(a - b + 180) - 180);
}

export function fmtUTC(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function ordinalHouse(h: number | null | undefined): string {
  if (h == null) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = h % 100;
  return h + (s[(v - 20) % 10] || s[v] || s[0]);
}
