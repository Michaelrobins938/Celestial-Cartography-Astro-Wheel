"""Vercel serverless entrypoint — mounts the FastAPI app for /api/* requests."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from app.main import app  # noqa: E402
