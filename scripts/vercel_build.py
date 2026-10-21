"""Validate Flask startup, then copy static assets for Vercel CDN serving."""
from __future__ import annotations

import importlib
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app" / "static"
TARGET = ROOT / "public" / "static"


def validate_application() -> None:
    # A merge marker in a route module must fail the build, not every request.
    sources = sorted((ROOT / "app").rglob("*.py"))
    sources.extend([ROOT / "run.py", ROOT / "wsgi.py"])
    for source in sources:
        compile(source.read_bytes(), str(source), "exec")

    # Import the exact entry point Vercel invokes, including blueprint registration.
    sys.path.insert(0, str(ROOT))
    try:
        entrypoint = importlib.import_module("wsgi")
        if not callable(getattr(entrypoint, "app", None)):
            raise RuntimeError("wsgi:app must be a callable WSGI application")
    finally:
        sys.path.pop(0)
    print("Validated Python sources and WSGI startup")


def main() -> None:
    validate_application()
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    if TARGET.exists():
        shutil.rmtree(TARGET)
    shutil.copytree(SOURCE, TARGET)
    print(f"Copied {SOURCE} -> {TARGET}")


if __name__ == "__main__":
    main()
