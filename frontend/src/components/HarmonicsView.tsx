import { useEffect, useState } from "react";
import { api } from "../api";
import type { HarmonicsPayload } from "../types";

function omegaColor(w: number): string {
  if (w < 0.01) return "#34d399"; // emerald
  if (w < 0.03) return "#a3e635"; // lime
  if (w < 0.06) return "#fbbf24"; // amber
  return "#f87171"; // red
}

export default function HarmonicsView() {
  const [data, setData] = useState<HarmonicsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .harmonics()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return <div className="flex h-full items-center justify-center text-sm text-red-400">{error}</div>;
  }
  if (!data) {
    return <div className="flex h-full items-center justify-center text-sm text-zinc-600">Loading resonances…</div>;
  }

  const { summary, gradient } = data;

  return (
    <div className="flex h-full flex-col overflow-hidden text-zinc-200">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Harmonic Orbit Resonance — Planetary Spacing
        </h2>
        <span className="text-[10px] text-zinc-600">empirical law vs self-organizing commensurabilities</span>
        <div className="ml-auto flex gap-2">
          <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
            HOR mean err {(summary.hor_mean_err * 100).toFixed(1)}%
          </span>
          <span className="rounded bg-zinc-500/15 px-2 py-0.5 text-[11px] text-zinc-400">
            TB mean err {(summary.tb_mean_err * 100).toFixed(1)}%
          </span>
          <span
            className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300"
            title="Titius–Bode predicts Pluto at 77.2 AU vs 39.48 observed — the classic extremal failure"
          >
            TB Pluto ×{summary.tb_pluto_fail.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {/* ---------- resonance chain ---------- */}
        <h3 className="mb-1 text-xs font-semibold text-zinc-400">Resonance chain (adjacent period ratios)</h3>
        <div className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
          {data.bodies.map((b, i) => (
            <div key={b.name} className="flex items-center">
              <div className="flex flex-col items-center px-1">
                <span className="text-lg leading-none text-zinc-100">{b.glyph}</span>
                <span className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-500">{b.name}</span>
              </div>
              {i < data.links.length && (() => {
                const l = data.links[i];
                return (
                  <div className="mx-0.5 flex flex-col items-center" title={`${l.inner} → ${l.outer}: q=${l.q}, ω=${l.omega}`}>
                    <span
                      className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                      style={{ color: omegaColor(l.omega), background: `${omegaColor(l.omega)}18` }}
                    >
                      {l.h_label}
                    </span>
                    <span className="font-mono text-[9px]" style={{ color: omegaColor(l.omega) }}>
                      ω {l.omega.toFixed(3)}
                    </span>
                    {l.vacant && (
                      <span
                        className="mt-0.5 rounded border border-dashed border-amber-600/60 px-1 text-[8px] text-amber-400"
                        title={`5:2 subdivides as (5:3)×(3:2) — vacant resonance zone predicted at ${l.vacant_a} AU`}
                      >
                        ◇ {l.vacant_a} AU
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>

        {/* ---------- predictions table ---------- */}
        <h3 className="mb-1 text-xs font-semibold text-zinc-400">
          Comparative accuracy — HOR (Kepler walk on idealized ratios) vs Titius–Bode
        </h3>
        <div className="mb-3 overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-2 py-1">Body</th>
                <th className="px-2 py-1">a obs (AU)</th>
                <th className="px-2 py-1">T (yr)</th>
                <th className="px-2 py-1">q ← prev</th>
                <th className="px-2 py-1">H</th>
                <th className="px-2 py-1">ω</th>
                <th className="px-2 py-1">HOR pred</th>
                <th className="px-2 py-1">HOR acc</th>
                <th className="px-2 py-1">TB pred</th>
                <th className="px-2 py-1">TB acc</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {data.bodies.map((b) => {
                const tbBad = Math.abs(b.tb_acc - 1) > 0.25;
                return (
                  <tr key={b.name} className="border-b border-zinc-900/60 hover:bg-zinc-900/40">
                    <td className="px-2 py-1 font-sans text-zinc-200">
                      {b.glyph} {b.name}
                    </td>
                    <td className="px-2 py-1 text-zinc-300">{b.a_obs.toFixed(3)}</td>
                    <td className="px-2 py-1 text-zinc-500">{b.t_years.toFixed(2)}</td>
                    <td className="px-2 py-1 text-zinc-500">{b.q_prev?.toFixed(3) ?? "—"}</td>
                    <td className="px-2 py-1 text-indigo-300">{b.h_label ?? "—"}</td>
                    <td className="px-2 py-1" style={{ color: b.omega != null ? omegaColor(b.omega) : undefined }}>
                      {b.omega?.toFixed(3) ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-emerald-300/90">{b.hor_pred.toFixed(3)}</td>
                    <td className="px-2 py-1 text-emerald-300/90">{b.hor_acc.toFixed(3)}</td>
                    <td className="px-2 py-1 text-zinc-400">{b.tb_pred.toFixed(2)}</td>
                    <td className={`px-2 py-1 ${tbBad ? "font-semibold text-red-400" : "text-zinc-400"}`}>
                      {b.tb_acc.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ---------- findings cards ---------- */}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <div className="rounded-lg border border-amber-700/30 bg-amber-950/10 p-2">
            <h4 className="mb-1 text-xs font-semibold text-amber-300">◇ Vacant resonance zones</h4>
            <p className="mb-1 text-[10px] leading-snug text-zinc-500">
              A matched 5:2 link subdivides as (5:3)×(3:2), predicting an unoccupied orbit:
            </p>
            <ul className="space-y-0.5">
              {data.vacant_zones.map((v) => (
                <li key={v.pair} className="flex justify-between text-[11px]">
                  <span className="text-zinc-300">{v.pair}</span>
                  <span className="font-mono text-amber-300/90">{v.a_pred} AU</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-indigo-700/30 bg-indigo-950/10 p-2">
            <h4 className="mb-1 text-xs font-semibold text-indigo-300">♆ The Neptune exception</h4>
            <p className="text-[11px] leading-snug text-zinc-400">
              Excluding Neptune, Uranus→Pluto is a near-perfect{" "}
              <strong className="text-indigo-200">{gradient.uranus_pluto_direct.h_label}</strong> (q ={" "}
              {gradient.uranus_pluto_direct.q.toFixed(3)}, ω = {gradient.uranus_pluto_direct.omega.toFixed(3)}).
              Neptune{" "}
              <strong className={gradient.uranus_pluto_direct.neptune_interleaved ? "text-emerald-300" : "text-zinc-400"}>
                {gradient.uranus_pluto_direct.neptune_interleaved ? "occupies an interleaved" : "occupies a standard"}{" "}
              </strong>
              harmonic slot between them (2:1 + 3:2).
            </p>
          </div>

          <div className="rounded-lg border border-zinc-700/40 bg-zinc-900/40 p-2">
            <h4 className="mb-1 text-xs font-semibold text-zinc-300">Gradient of the progression factor</h4>
            <p className="text-[11px] leading-snug text-zinc-400">
              Successive Δq across the chain: <span className="font-mono text-zinc-200">{gradient.dq_mean.toFixed(2)} ± {gradient.dq_std.toFixed(2)}</span>
              {" "}→ tightening to <span className="font-mono text-zinc-200">±{gradient.dq_std_excl_neptune.toFixed(2)}</span> with
              Neptune de-interleaved. Systems self-organize toward quantized harmonic ratios rather than a constant
              logarithmic spacing Q.
            </p>
          </div>
        </div>

        <p className="mt-3 text-[10px] leading-snug text-zinc-600">
          The dominant commensurabilities 2:1 and 3:1 are the same small-integer ratios the classical tradition
          formalized as the opposition and trine — resonance physics beneath the aspect family. Jupiter–Saturn's
          5:2 lock (ω = {data.links[5].omega.toFixed(3)}) is why their {data.links[5].h_label} period ratio makes
          their great-cycle trines recur on a stable clock.
        </p>
      </div>
    </div>
  );
}
