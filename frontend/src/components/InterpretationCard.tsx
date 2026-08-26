// Interpretation popover panel (planet / aspect / ACG line click target).
import type { ReactNode } from "react";

export default function InterpretationCard({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-auto w-72 rounded-lg border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur" data-testid="interpretation">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-zinc-100">{title}</h4>
          {subtitle && <p className="text-[11px] text-zinc-500">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="text-zinc-500 transition hover:text-zinc-200" aria-label="Close">
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}
