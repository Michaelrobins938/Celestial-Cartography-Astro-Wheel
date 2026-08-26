// Transit clock + live aspect-trigger list.
import { useEffect, useState } from "react";
import type { Trigger } from "../types";

export default function TransitClock({
  triggers,
  transitUtc,
  onRefresh,
  onSelectTrigger,
}: {
  triggers: Trigger[];
  transitUtc: string | null;
  onRefresh: () => void;
  onSelectTrigger?: (t: Trigger) => void;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Transit clock</h2>
        <button
          onClick={onRefresh}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:border-indigo-500 hover:text-indigo-300"
          title="Recompute transits for this moment"
        >
          refresh
        </button>
      </div>
      <div className="px-3 pb-2">
        <div className="font-mono text-lg tabular-nums text-zinc-100">
          {now.toISOString().slice(11, 19)} <span className="text-xs text-zinc-500">UTC</span>
        </div>
        {transitUtc && (
          <div className="text-[11px] text-zinc-500">
            computed for {transitUtc.replace("T", " ").slice(0, 16)} UTC
          </div>
        )}
      </div>

      <h3 className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
        Active triggers ({triggers.length})
      </h3>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {triggers.length === 0 && (
          <p className="text-xs text-zinc-600">No close transiting aspects right now.</p>
        )}
        <ul className="space-y-1.5">
          {[...triggers]
            .sort((a, b) => a.orb - b.orb)
            .map((t, i) => (
              <li
                key={i}
                className="cursor-pointer rounded-md border border-zinc-800 bg-zinc-900/50 p-2 transition hover:border-zinc-600"
                onClick={() => onSelectTrigger?.(t)}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: t.color }} />
                  <span className="text-xs font-medium text-zinc-200 capitalize">{t.aspect}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-zinc-500">{t.orb.toFixed(1)}° orb</span>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-zinc-400">
                  Tr. <span className="text-zinc-200">{t.transit}</span> {t.transit_sign} {t.transit_degree}
                  {t.transit_retrograde && <span className="text-red-400"> Rx</span>} → Nat.{" "}
                  <span className="text-zinc-200">{t.natal}</span> {t.natal_sign} {t.natal_degree}
                </p>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
