#!/usr/bin/env python3
"""Install FIFA Tournament Hub V43.4.0 additive shell into an existing site root."""
from __future__ import annotations

import argparse
import re
import shutil
from datetime import datetime
from pathlib import Path

VERSION = "43.4.0"
CSS_TAG = '  <link rel="stylesheet" href="v43-4-game-shell.css?v=43.4.0" data-v434-asset="css" />'
JS_TAG = '  <script src="v43-4-game-shell.js?v=43.4.0" data-v434-asset="js"></script>'


def backup(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = path.with_name(f"{path.name}.before_v43_4_{stamp}.bak")
    shutil.copy2(path, target)
    return target


def patch_index(index: Path) -> tuple[bool, list[str]]:
    text = index.read_text(encoding="utf-8")
    notes: list[str] = []
    changed = False
    if 'data-v434-asset="css"' not in text:
        if "</head>" not in text:
            raise RuntimeError("index.html does not contain </head>.")
        text = text.replace("</head>", f"{CSS_TAG}\n</head>", 1)
        changed = True
        notes.append("CSS reference added")
    if 'data-v434-asset="js"' not in text:
        if "</body>" not in text:
            raise RuntimeError("index.html does not contain </body>.")
        text = text.replace("</body>", f"{JS_TAG}\n</body>", 1)
        changed = True
        notes.append("JavaScript reference added")
    if changed:
        backup(index)
        index.write_text(text, encoding="utf-8")
    return changed, notes


def patch_service_worker(path: Path) -> tuple[bool, list[str]]:
    if not path.exists():
        return False, ["service-worker.js not found; query-versioned assets will still update online"]
    text = path.read_text(encoding="utf-8")
    original = text
    notes: list[str] = []

    # Replace the known FIFA cache namespace while preserving quote style.
    text, count = re.subn(
        r"fifa-tournament-hub-v[0-9][A-Za-z0-9._-]*",
        "fifa-tournament-hub-v43-4-0-official-english",
        text,
    )
    if count:
        notes.append(f"cache namespace updated ({count} occurrence{'s' if count != 1 else ''})")

    # Add the two files to a likely pre-cache array when possible.
    assets = ["./v43-4-game-shell.css", "./v43-4-game-shell.js"]
    for asset in assets:
        if asset in text:
            continue
        patterns = [
            r"(const\s+(?:APP_SHELL|PRECACHE_ASSETS|ASSETS|FILES_TO_CACHE)\s*=\s*\[)",
            r"(addAll\s*\(\s*\[)",
        ]
        inserted = False
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                pos = match.end()
                text = text[:pos] + f"\n  {asset!r}," + text[pos:]
                inserted = True
                notes.append(f"{asset} added to pre-cache list")
                break
        if not inserted:
            notes.append(f"could not identify pre-cache array for {asset}; cache key was still updated")

    changed = text != original
    if changed:
        backup(path)
        path.write_text(text, encoding="utf-8")
    return changed, notes


def main() -> int:
    parser = argparse.ArgumentParser(description="Install FIFA V43.4.0 Official Game Shell + English Pack")
    parser.add_argument("site_root", nargs="?", default=".", help="Existing website root containing index.html")
    args = parser.parse_args()

    package_root = Path(__file__).resolve().parent
    source_dir = package_root / "github"
    site_root = Path(args.site_root).resolve()
    index = site_root / "index.html"
    if not index.exists():
        raise SystemExit(f"ERROR: {index} was not found.")

    for name in ("v43-4-game-shell.css", "v43-4-game-shell.js"):
        shutil.copy2(source_dir / name, site_root / name)
        print(f"COPIED: {name}")

    changed, notes = patch_index(index)
    print("INDEX:", "patched" if changed else "already integrated")
    for note in notes:
        print("  -", note)

    sw_changed, sw_notes = patch_service_worker(site_root / "service-worker.js")
    print("SERVICE WORKER:", "patched" if sw_changed else "unchanged")
    for note in sw_notes:
        print("  -", note)

    print("\nInstallation complete.")
    print("Publish the site, then perform one hard refresh (Ctrl+F5).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
