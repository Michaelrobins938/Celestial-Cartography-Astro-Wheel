// Tiny markdown renderer for interpretation popovers: **bold**, *italic*, lists.
import { Fragment, type ReactNode } from "react";

function renderInline(text: string): ReactNode {
  // Split on **bold** and *italic*
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(
        <strong key={key++} className="text-zinc-100">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <em key={key++} className="text-zinc-300">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-zinc-300">
      {lines.map((line, i) => (
        <p key={i}>{renderInline(line)}</p>
      ))}
    </div>
  );
}
