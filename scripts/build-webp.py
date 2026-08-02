#!/usr/bin/env python3
"""Create the public WebP gallery from local-only originals."""

from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "originals" / "images"
OUTPUT = ROOT / "images"
HERO_SOURCE = ROOT / "originals" / "about-hero.png"
HERO_OUTPUT = ROOT / "assets" / "about-hero.webp"
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".avif"}
MAX_EDGE = 1600


def convert(source: Path, output: Path) -> None:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        output.parent.mkdir(parents=True, exist_ok=True)
        image.save(output, "WEBP", quality=82, method=6)


def main() -> None:
    if not SOURCE.is_dir():
        raise SystemExit(f"Missing local originals: {SOURCE}")

    sources = sorted(p for p in SOURCE.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED)
    expected = {OUTPUT / p.relative_to(SOURCE).with_suffix(".webp") for p in sources}

    for stale in OUTPUT.rglob("*.webp"):
        if stale not in expected:
            stale.unlink()

    for source in sources:
        output = OUTPUT / source.relative_to(SOURCE).with_suffix(".webp")
        if not output.is_file() or output.stat().st_mtime < source.stat().st_mtime:
            convert(source, output)

    if HERO_SOURCE.is_file():
        convert(HERO_SOURCE, HERO_OUTPUT)

    print(f"Generated {len(sources)} WebP gallery images.")


if __name__ == "__main__":
    main()
