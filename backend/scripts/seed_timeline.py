"""Parse astrology_timeline.xlsx into a JSON seed for the interpretation DB.

Extracts the curated event interpretations (sheet "Chronological Timeline")
and writes backend/data/interpretations_seed.json. Run once; the app seeds
its SQLite table from this file on startup when empty.

Usage: .venv/bin/python scripts/seed_timeline.py [path-to-xlsx]
"""

from __future__ import annotations

import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
BACKEND = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = BACKEND.parent / "astrology_timeline.xlsx"
OUT = BACKEND / "data" / "interpretations_seed.json"

# Column letters → schema fields (row 5 header layout).
COLS = {
    "F": "date",
    "G": "event_name",
    "H": "primary_body",
    "I": "primary_glyph",
    "J": "action",
    "K": "action_glyph",
    "L": "secondary_body",
    "M": "secondary_glyph",
    "N": "position_str",
    "O": "category",
    "P": "text",
}


def _cell_text(c: ET.Element) -> str | None:
    t = c.get("t")
    v = c.find(M + "v")
    isnode = c.find(M + "is")
    if t == "inlineStr" and isnode is not None:
        return "".join(x.text or "" for x in isnode.iter(M + "t")).strip()
    if v is not None and v.text is not None:
        return v.text.strip()
    return None


def parse_sheet(z: zipfile.ZipFile, member: str) -> list[dict]:
    root = ET.fromstring(z.read(member))
    records: list[dict] = []
    for row in root.iter(M + "row"):
        rec: dict[str, str] = {}
        for c in row.findall(M + "c"):
            ref = c.get("r") or ""
            col = "".join(ch for ch in ref if ch.isalpha())
            if col in COLS:
                val = _cell_text(c)
                if val not in (None, "", "-"):
                    rec[COLS[col]] = val
        if "date" in rec and "text" in rec and rec["date"][0].isdigit():
            records.append(rec)
    return records


def main() -> None:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    z = zipfile.ZipFile(xlsx)
    # Sheet order per workbook.xml: rId1 = Chronological Timeline.
    records = parse_sheet(z, "xl/worksheets/sheet1.xml")
    OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    cats: dict[str, int] = {}
    for r in records:
        cats[r.get("category", "?")] = cats.get(r.get("category", "?"), 0) + 1
    print(f"wrote {len(records)} interpretations → {OUT}")
    print("categories:", cats)


if __name__ == "__main__":
    main()
