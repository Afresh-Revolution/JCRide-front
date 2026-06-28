"""Copy Flask static assets into public/ for Vercel CDN serving."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app" / "static"
TARGET = ROOT / "public" / "static"


def main() -> None:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    if TARGET.exists():
        shutil.rmtree(TARGET)
    shutil.copytree(SOURCE, TARGET)
    print(f"Copied {SOURCE} -> {TARGET}")


if __name__ == "__main__":
    main()
