// Interpretive text engine: markdown delineations shown on click.
// Kept deliberately concise — classic cookbook-style meanings.

const PLANETS: Record<string, string> = {
  Sun: "Core identity, vitality, and conscious purpose. Where you shine and what you are becoming.",
  Moon: "Instinctive nature, emotional needs, and what makes you feel safe. The lunar body rules habit and memory.",
  Mercury: "How you think, speak, learn, and process information. The messenger between worlds.",
  Venus: "What you value, how you love, and what you find beautiful. Attraction and harmony.",
  Mars: "Drive, desire, assertion, and how you go after what you want. Raw energy.",
  Jupiter: "Growth, luck, faith, and expansion. Where life feels generous — and where excess lives.",
  Saturn: "Discipline, structure, limitation, and mastery through effort. The teacher of the chart.",
  Uranus: "Revolution, genius, disruption, and sudden awakening. The lightning bolt.",
  Neptune: "Dreams, spirituality, imagination, and dissolution of boundaries. The mystic — or the mirage.",
  Pluto: "Power, transformation, death-and-rebirth. The deep underground current.",
  Chiron: "The wounded healer. Core wounds that become sources of wisdom and service.",
  "North Node": "The evolutionary direction of this lifetime. Uncomfortable but nourishing growth.",
  Ceres: "Nurturing style, self-care, and how you feed others and yourself.",
  Pallas: "Strategy, pattern-recognition, and creative intelligence.",
  Vesta: "Devotion, focus, and the inner flame. What you hold sacred.",
  Juno: "Commitment style and the architecture of partnership.",
  "Mean Lilith": "The raw, untamed instinct repressed by convention — and its power when reclaimed.",
  Vertex: "Fated encounters and turning points; where life 'happens to you'.",
  "Part of Fortune": "Where worldly flourishing is found: body, mind, and circumstance in accord.",
};

const ASPECTS: Record<string, string> = {
  conjunction:
    "A fusion of energies — the two principles operate as one, for better or worse. Intense, focused, inseparable.",
  opposition:
    "A see-saw across the chart: two forces pulling against each other until integration is found through relationship and awareness.",
  trine:
    "An easy flow between the two planets. Natural talent — so effortless it can be taken for granted.",
  square:
    "Friction that produces action. The tension between these forces drives achievement, once mastered.",
  sextile:
    "An opportunity aspect: cooperative energies that reward initiative. Low voltage, high potential.",
};

const LINES: Record<string, string> = {
  asc: "**Rising line** — this planet's archetype colors your persona and physical presence here. You feel *more like yourself*, visible and initiated.",
  dsc: "**Setting line** — this planet expresses through relationships and encounters here. Others carry its themes to you.",
  mc: "**Culminating line** — career, reputation, and public visibility. This planet shapes how you are seen at your most exposed.",
  ic: "**Anti-culminating line** — home, roots, and the private self. A place of inner resettling; its effects are felt beneath the surface.",
};

export function planetText(name: string): string | undefined {
  return PLANETS[name];
}

export function aspectText(type: string): string | undefined {
  return ASPECTS[type];
}

export function lineText(kind: string): string | undefined {
  return LINES[kind];
}
