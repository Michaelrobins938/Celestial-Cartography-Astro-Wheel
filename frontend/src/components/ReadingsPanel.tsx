import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Reading, TimelineEvent, TransitPayload } from "../types";
import { Markdown } from "../lib/markdown";

export default function ReadingsPanel({
  profileId,
  currentTransits,
  selectedEvent,
}: {
  profileId: number | null;
  currentTransits: TransitPayload | null;
  selectedEvent: TimelineEvent | null;
}) {
  const [entries, setEntries] = useState<Reading[]>([]);
  const [editing, setEditing] = useState<{ title: string; focus: string; body_md: string } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    if (profileId == null) return setEntries([]);
    api.readings(profileId).then(setEntries).catch(() => setEntries([]));
  }, [profileId]);
  useEffect(reload, [reload]);

  if (profileId == null) {
    return <p className="p-3 text-xs text-zinc-600">Save the profile first to keep a journal.</p>;
  }

  const snapshot = (): string | null => {
    if (!currentTransits && !selectedEvent) return null;
    return JSON.stringify({ transits: currentTransits, event: selectedEvent });
  };

  const save = async () => {
    if (!editing || !editing.title.trim()) return;
    setBusy(true);
    try {
      await api.createReading(profileId, {
        title: editing.title.trim(),
        focus: editing.focus.trim() || null,
        body_md: editing.body_md,
        snapshot_json: snapshot(),
      });
      setEditing(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden text-zinc-300">
      <div className="flex items-center gap-2 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Readings Journal</h2>
        <button
          onClick={() => setEditing(editing ? null : { title: "", focus: "", body_md: "" })}
          className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-[11px] hover:text-zinc-100"
        >
          {editing ? "cancel" : "＋ new"}
        </button>
      </div>

      {editing && (
        <div className="space-y-1.5 border-y border-zinc-800 bg-zinc-900/50 p-2">
          <input
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="Title — e.g. Saturn opposition debrief"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
          />
          <input
            value={editing.focus}
            onChange={(e) => setEditing({ ...editing, focus: e.target.value })}
            placeholder="focus tag (career / love / eclipse…)"
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
          />
          <textarea
            value={editing.body_md}
            onChange={(e) => setEditing({ ...editing, body_md: e.target.value })}
            placeholder="markdown notes…"
            rows={6}
            className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px]"
          />
          <button
            onClick={save}
            disabled={busy || !editing.title.trim()}
            className="rounded bg-indigo-500/25 px-2 py-0.5 text-[11px] text-indigo-200 disabled:opacity-40"
          >
            {busy ? "saving…" : currentTransits || selectedEvent ? "save + snapshot sky ⌗" : "save"}
          </button>
        </div>
      )}

      <ul className="min-h-0 flex-1 divide-y divide-zinc-900 overflow-y-auto">
        {entries.length === 0 && !editing && (
          <li className="p-3 text-xs text-zinc-600">No entries yet.</li>
        )}
        {entries.map((en) => (
          <li key={en.id} className="px-3 py-2 hover:bg-zinc-900/40">
            <button onClick={() => setOpenId(openId === en.id ? null : en.id)} className="w-full text-left">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium">{en.title}</span>
                {en.focus && <span className="rounded bg-zinc-800 px-1 text-[9px] uppercase text-zinc-400">{en.focus}</span>}
                <span className="ml-auto font-mono text-[10px] text-zinc-600">{en.created_at?.slice(0, 10)}</span>
              </div>
            </button>
            {openId === en.id && (
              <div className="mt-1 space-y-1.5">
                <div className="text-[11px] leading-snug text-zinc-400"><Markdown text={en.body_md} /></div>
                {en.snapshot_json && (
                  <details>
                    <summary className="cursor-pointer text-[10px] text-indigo-400/80">frozen sky snapshot ⌗</summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-zinc-950 p-1.5 font-mono text-[9px] text-zinc-500">
                      {JSON.stringify(JSON.parse(en.snapshot_json), null, 1).slice(0, 2000)}
                    </pre>
                  </details>
                )}
                <button
                  onClick={async () => { await api.deleteReading(en.id); reload(); }}
                  className="text-[10px] text-red-400/70 hover:text-red-300"
                >
                  delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
