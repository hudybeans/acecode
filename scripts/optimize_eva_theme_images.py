"""Quantize approved EVA artwork without changing its dimensions or composition.

Dependencies: Pillow==11.3.0 imagequant==1.1.5 (see docs/themes.md).
"""

import argparse
import hashlib
import json
from pathlib import Path

import imagequant
from PIL import Image


def save_indexed(image: Image.Image, destination: Path) -> dict:
    indices, palette = imagequant.quantize_raw_rgba_bytes(
        image.tobytes(), image.width, image.height,
        max_colors=256, dithering_level=0.4, min_quality=0, max_quality=100,
    )
    indexed = Image.frombytes("P", image.size, indices)
    indexed.putpalette(palette, rawmode="RGBA")
    indexed.save(destination, optimize=True, compress_level=9)
    with Image.open(destination) as verified:
        verified.load()
        if verified.mode != "P" or verified.size != image.size:
            raise ValueError("Indexed PNG verification failed")
    data = destination.read_bytes()
    return {"file": destination.name, "width": image.width, "height": image.height,
            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--background", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    args = parser.parse_args()
    output = args.output_directory.resolve()
    if args.background.resolve() in (output / "background.png", output / "thumbnail.png"):
        parser.error("Use an output directory separate from the approved source image")
    with Image.open(args.background) as source:
        if source.format != "PNG":
            parser.error("Expected the approved PNG artwork")
        background = source.convert("RGBA")
    if background.getextrema()[3] != (255, 255):
        parser.error("Expected opaque artwork; do not flatten source transparency")
    width = min(320, background.width)
    height = max(1, round(background.height * width / background.width))
    thumbnail = background.resize((width, height), Image.Resampling.LANCZOS)
    output.mkdir(parents=True, exist_ok=True)
    report = [save_indexed(background, output / "background.png"),
              save_indexed(thumbnail, output / "thumbnail.png")]
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
