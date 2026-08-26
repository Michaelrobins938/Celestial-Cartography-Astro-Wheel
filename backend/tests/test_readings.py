"""Readings CRUD tests. Run: cd backend && .venv/bin/python tests/test_readings.py

Swaps models.engine/SessionLocal onto a temp-file SQLite BEFORE importing app.main
(main calls models.init_db() at import time; endpoint fns resolve SessionLocal at
call time, so the swap isolates the real celestial.db completely).
"""

from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_tmp = tempfile.mkdtemp()

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: E402

_test_engine = create_engine(
    f"sqlite:///{_tmp}/test.db", connect_args={"check_same_thread": False}
)
models.engine = _test_engine
models.SessionLocal = sessionmaker(bind=_test_engine, autoflush=False, autocommit=False)
models.init_db()

# Seed one profile directly.
with models.SessionLocal() as s:
    p = models.Profile(name="Test Native", birth_local="1995-08-31T07:08:00",
                       place_name="Fort Worth", lat=32.7555, lon=-97.3308,
                       tz_name="America/Chicago", house_system="P")
    s.add(p)
    s.commit()
    PID = p.id

import importlib  # noqa: E402

from fastapi import HTTPException  # noqa: E402

main = importlib.import_module("app.main")

# CREATE
r = main.create_reading(PID, main.ReadingCreate(
    title="Saturn opposition debrief", focus="career",
    body_md="Strong Saturn themes.\n\n- delayed gratification\n- structure holds"))
assert isinstance(r["id"], int) and r["title"].startswith("Saturn"), r
RID = r["id"]
assert r["created_at"] is not None and r["created_at"].endswith("Z"), r

# LIST (ordered newest first)
rows = main.list_readings(PID)
assert len(rows) == 1 and rows[0]["id"] == RID, rows

# UPDATE (partial)
upd = main.update_reading(RID, main.ReadingUpdate(body_md="revised after session"))
assert upd["body_md"] == "revised after session"
assert upd["title"].startswith("Saturn"), upd  # untouched field preserved

# DELETE
assert main.delete_reading(RID) == {"ok": True}
assert main.list_readings(PID) == []

# UNKNOWN PROFILE -> 404
try:
    main.create_reading(99999, main.ReadingCreate(title="ghost"))
    raise SystemExit("FAIL: expected HTTPException 404 for unknown profile")
except HTTPException as e:
    assert e.status_code == 404, e.status_code

# UNKNOWN READING -> 404
try:
    main.delete_reading(99999)
    raise SystemExit("FAIL: expected HTTPException 404 for unknown reading")
except HTTPException as e:
    assert e.status_code == 404, e.status_code

print("readings CRUD: all assertions passed")
