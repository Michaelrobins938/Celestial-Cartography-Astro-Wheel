"""SQLAlchemy models: profiles, saved locations, and curated event interpretations."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

DB_PATH = "celestial.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

_SEED_FILE = Path(__file__).resolve().parent.parent / "data" / "interpretations_seed.json"


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    birth_local = Column(String, nullable=False)   # ISO local civil datetime
    place_name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    tz_name = Column(String, nullable=True)
    house_system = Column(String, default="P")
    created_at = Column(DateTime, default=datetime.utcnow)


class SavedLocation(Base):
    __tablename__ = "saved_locations"

    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)


class EventInterpretation(Base):
    """Curated delineation for a timeline event (seeded from astrology_timeline.xlsx)."""

    __tablename__ = "event_interpretations"

    id = Column(Integer, primary_key=True)
    date = Column(String, index=True)          # YYYY-MM-DD
    event_name = Column(String)
    primary_body = Column(String, index=True)  # e.g. Mercury, "Sun/Moon"
    primary_glyph = Column(String)
    action = Column(String)                    # Trine / Ingress / Station Retrograde / ...
    action_glyph = Column(String)
    secondary_body = Column(String)
    secondary_glyph = Column(String)
    position_str = Column(String)              # e.g. "Gemini 5°42'"
    category = Column(String, index=True)      # Eclipse / Aspect / Ingress / Station / ...
    text = Column(String, nullable=False)


class Reading(Base):
    """A dated session note attached to a profile, with optional frozen sky snapshot."""

    __tablename__ = "readings"

    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    title = Column(String, nullable=False)
    focus = Column(String)                      # free tag: career / love / eclipse …
    body_md = Column(String, default="")
    snapshot_json = Column(Text)                # frozen TransitsPayload + selected timeline event


def seed_event_interpretations() -> int:
    """Load curated interpretations from the JSON seed if the table is empty.

    Returns the number of rows added (0 if already seeded).
    """
    with SessionLocal() as s:
        if s.query(EventInterpretation).count() > 0:
            return 0
        if not _SEED_FILE.exists():
            return 0
        records = json.loads(_SEED_FILE.read_text(encoding="utf-8"))
        for r in records:
            s.add(EventInterpretation(
                date=r.get("date"),
                event_name=r.get("event_name"),
                primary_body=r.get("primary_body"),
                primary_glyph=r.get("primary_glyph"),
                action=r.get("action"),
                action_glyph=r.get("action_glyph"),
                secondary_body=r.get("secondary_body"),
                secondary_glyph=r.get("secondary_glyph"),
                position_str=r.get("position_str"),
                category=r.get("category"),
                text=r.get("text"),
            ))
        s.commit()
        return len(records)


def init_db() -> None:
    Base.metadata.create_all(engine)
    seed_event_interpretations()