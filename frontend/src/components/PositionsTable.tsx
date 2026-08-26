// Positions sidebar: sortable table with category toggles.
import { useMemo, useState, Fragment } from "react";
import type { BodyPos } from "../types";
import { ordinalHouse } from "../lib/format";
import { planetText } from "../lib/interpretations";
import { Markdown } from "../lib/markdown";

type Category = "luminaries" | "personal" | "social" | "outer" | "asteroids" | "points";

const CAT_OF: Record<string, Category> = {
  Sun: "luminaries",
  Moon: "luminaries",
  Mercury: "personal",
  Venus: "personal",
  Mars: "personal",
  Jupiter: "social",
  Saturn: "social",
  Uranus: "outer",
  Neptune: "outer",
  Pluto: "outer",
  Chiron: "asteroids",
  Ceres: "asteroids",
  Pallas: "asteroids",
  Vesta: "asteroids",
  Juno: "asteroids",
  "North Node": "points",
  "Mean Lilith": "points",
  Vertex: "points",
  "Part of Fortune": "points",
};

const ALL_CATS: Category[] = ["luminaries", "personal", "social", "outer", "asteroids", "points"];

export default function PositionsTable({
  bodies,
  title,
  onSelect,
  selectedName,
}: {
  bodies: BodyPos[];
  title: string;
  onSelect?: (b: BodyPos) => void;
  selectedName?: string | null;
}) {
  const [cats, setCats] = useState<Set<Category>>(new Set(ALL_CATS));
  const [sortKey, setSortKey] = useState<"name" | "lon" | "house">("lon");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const filtered = bodies.filter((b) => cats.has(CAT_OF[b.name] ?? "points"));
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "house") return (a.house ?? 99) - (b.house ?? 99);
      return a.lon - b.lon;
    });
    return sorted;
  }, [bodies, cats, sortKey]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">{title}</h2>
        <select
          className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-300"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
        >
          <option value="lon">sort: zodiac</option>
          <option value="name">sort: name</option>
          <option value="house">sort: house</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {ALL_CATS.map((c) => {
          const on = cats.has(c);
          return (
            <button
              key={c}
              onClick={() => {
                const next = new Set(cats);
                if (on) next.delete(c);
                else next.add(c);
                if (next.size === 0) return;
                setCats(next);
              }}
              className={`rounded-full border px-2 py-0.5 text-[10px] capitalize transition ${
                on
                  ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-300"
                  : "border-zinc-800 text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-left text-[13px]">
          <tbody>
            {rows.map((b) => {
              const isSel = selectedName === b.name;
              return (
                <Fragment key={b.id}>
                  <tr
                    onClick={() => {
                      onSelect?.(b);
                      setExpanded(expanded === b.name ? null : b.name);
                    }}
                    className={`cursor-pointer border-b border-zinc-900 transition hover:bg-zinc-900/70 ${
                      isSel ? "bg-indigo-500/10" : ""
                    }`}
                  >
                    <td className="py-1 pl-3 pr-1 w-7 text-center">{b.glyph}</td>
                    <td className="py-1 pr-2 text-zinc-200">
                      {b.name}
                      {b.retrograde && <span className="ml-1 text-[10px] text-red-400">Rx</span>}
                    </td>
                    <td className="py-1 pr-2 text-zinc-400">{b.sign}</td>
                    <td className="py-1 pr-2 tabular-nums text-zinc-300">{b.degree_str}</td>
                    <td className="py-1 pr-3 text-right text-zinc-500">{ordinalHouse(b.house)}</td>
                  </tr>
                  {expanded === b.name && planetText(b.name) && (
                    <tr className="bg-zinc-900/60">
                      <td colSpan={5} className="px-3 py-2">
                        <Markdown text={planetText(b.name)!} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
