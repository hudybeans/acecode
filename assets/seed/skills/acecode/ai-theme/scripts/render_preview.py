"""Build an offline theme preview or artwork-only Browser page; no image API."""

import argparse
import base64
import json
import math
from pathlib import Path
import re


COLORS = {"logo_color", "home_title_color", "home_background_color",
          "session_background_color", "user_message_background_color"}
OPACITIES = {"home_composer_opacity", "home_background_opacity",
             "session_background_opacity", "user_message_background_opacity"}
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp", ".svg": "image/svg+xml"}
SCOPES = {"quick": ("home",), "advanced": ("home", "session"),
          "deep": ("home", "session", "user_message")}


def build(plan_path, output_path, artboard=None, width=None, height=None):
    root = Path(__file__).resolve().parent.parent
    plan_path, output_path = Path(plan_path).resolve(), Path(output_path).resolve()
    plan = json.loads(plan_path.read_text(encoding="utf-8-sig"))
    if not isinstance(plan, dict):
        raise ValueError("Theme plan must be an object")
    if plan.get("mode") not in ("light", "dark") or plan.get("scope") not in SCOPES:
        raise ValueError("Set mode=light/dark and scope=quick/advanced/deep")
    appearance, colors = plan.get("appearance", {}), plan.get("colors", {})
    if not isinstance(appearance, dict) or not isinstance(colors, dict):
        raise ValueError("appearance and colors must be objects")
    for key, value in appearance.items():
        if key in COLORS:
            if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
                raise ValueError("Invalid HEX color: " + key)
        elif key in OPACITIES:
            if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1:
                raise ValueError("Opacity must be a number from 0 to 1: " + key)
        elif key != "extend_to_titlebar" or not isinstance(value, bool):
            raise ValueError("Unsupported appearance parameter: " + key)
    if any(not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value) for value in colors.values()):
        raise ValueError("Palette values must use #RRGGBB")
    assets = plan.get("assets", {})
    if not isinstance(assets, dict) or any(key not in SCOPES[plan["scope"]] for key in assets):
        raise ValueError("Assets must match the selected customization scope")
    encoded, inputs, total = {}, {plan_path}, 0
    for key, value in assets.items():
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Provide an actual local image path: " + key)
        path = Path(value)
        path = (plan_path.parent / path).resolve() if not path.is_absolute() else path.resolve()
        if path.suffix.lower() not in MIME or not path.is_file():
            raise ValueError("Unsupported or missing local image: " + str(path))
        total += path.stat().st_size
        if total > 16 * 1024 * 1024:
            raise ValueError("Combined artwork exceeds 16 MiB")
        inputs.add(path)
        encoded[key] = "data:" + MIME[path.suffix.lower()] + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    if output_path in inputs or root in output_path.parents:
        raise ValueError("Write outputs outside the skill and preserve input files")
    if width is not None or height is not None:
        if (not artboard or type(width) is not int or type(height) is not int
                or not 0 < width <= 8192 or not 0 < height <= 8192
                or width * height > 33554432):
            raise ValueError("Artboard width and height must be paired positive integers, at most 8192 per side and 32 megapixels")
    if artboard:
        if artboard not in encoded:
            raise ValueError("An artwork-only page requires a real asset: " + artboard)
        config = json.dumps({"src": encoded[artboard], "width": width, "height": height})
        script = (root / "scripts" / "artboard.js").read_text(encoding="utf-8")
        document = ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
                    '<meta name="viewport" content="width=device-width,initial-scale=1">'
                    '<title>ACECode 独立背景</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;}'
                    '#theme-artwork{display:block;width:100%;height:100%;object-fit:cover;}'
                    '[role=alert]{padding:16px;}</style></head><body>'
                    '<canvas id="theme-artwork" width="0" height="0" data-ready="false" aria-label="独立背景"></canvas>'
                    '<script id="theme-artboard-config" type="application/json">' + config + '</script>'
                    '<script>' + script + '</script></body></html>')
    else:
        document = (root / "assets" / ("preview-" + plan["mode"] + ".html")).read_text(encoding="utf-8")
        payload = {key: plan[key] for key in ("name", "mode", "scope", "appearance", "colors") if key in plan}
        payload["assets"] = encoded
        config = json.dumps(payload, ensure_ascii=True).replace("<", "\\u003c")
        script = (root / "scripts" / "preview.js").read_text(encoding="utf-8")
        styles = (root / "scripts" / "preview.css").read_text(encoding="utf-8")
        document = document.replace("</head>", "<style>" + styles + "</style></head>")
        document = document.replace("</body>", '<script id="theme-preview-config" type="application/json">' + config +
                                    "</script><script>" + script + "</script></body>")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(document, encoding="utf-8")
    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--artboard", choices=("home", "session", "user_message"))
    parser.add_argument("--width", type=int, help="Explicitly agreed artwork width; requires --height")
    parser.add_argument("--height", type=int, help="Explicitly agreed artwork height; requires --width")
    args = parser.parse_args()
    try:
        print(build(args.plan, args.output, args.artboard, args.width, args.height))
    except (OSError, ValueError) as error:
        parser.exit(1, "Theme preview: " + str(error) + "\n")
