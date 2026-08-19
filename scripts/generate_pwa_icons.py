"""Generate PWA icon sizes from logo-main.png."""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Install Pillow: pip install pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "app" / "static" / "images" / "logo-main.png"
OUT = ROOT / "app" / "static" / "pwa" / "icons"
SIZES = [72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512, 1024]
MASKABLE_SIZES = [192, 512]
MONOCHROME_SIZES = [192, 512]
BG = (1, 12, 20, 255)  # #010C14 — matches the JR glass icon fill


def fit_on_canvas(img: Image.Image, size: int, padding_ratio: float = 0.0) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BG)
    inner = int(size * (1 - padding_ratio * 2))
    fitted = img.copy()
    fitted.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    if fitted.mode != "RGBA":
        fitted = fitted.convert("RGBA")
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def monochrome(img: Image.Image, size: int) -> Image.Image:
    canvas = fit_on_canvas(img, size, padding_ratio=0.12)
    gray = canvas.convert("L")
    out = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    out.paste(gray, (0, 0))
    return out


def main() -> None:
    if not SRC.is_file():
        print(f"Missing source logo: {SRC}", file=sys.stderr)
        sys.exit(1)

    OUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SRC).convert("RGBA")

    for size in SIZES:
        icon = fit_on_canvas(source, size, padding_ratio=0.08)
        icon.save(OUT / f"icon-{size}.png", optimize=True)
        if size in (152, 167, 180):
            icon.save(OUT / f"apple-touch-icon-{size}.png", optimize=True)

    for size in MASKABLE_SIZES:
        maskable = fit_on_canvas(source, size, padding_ratio=0.18)
        maskable.save(OUT / f"icon-maskable-{size}.png", optimize=True)

    for size in MONOCHROME_SIZES:
        mono = monochrome(source, size)
        mono.save(OUT / f"icon-monochrome-{size}.png", optimize=True)

    # Favicon sizes
    fit_on_canvas(source, 32, 0.06).save(OUT / "favicon-32.png", optimize=True)
    fit_on_canvas(source, 16, 0.04).save(OUT / "favicon-16.png", optimize=True)

    print(f"Generated icons in {OUT}")


if __name__ == "__main__":
    main()
