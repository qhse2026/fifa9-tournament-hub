#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run() -> None:
    subprocess.run(["node", "--check", str(ROOT / "github" / "v43-4-game-shell.js")], check=True)
    subprocess.run(["python", "-m", "py_compile", str(ROOT / "install_v43_4.py")], check=True)

    with tempfile.TemporaryDirectory() as tmp:
        site = Path(tmp)
        (site / "index.html").write_text(
            """<!doctype html><html lang='tr' data-language='tr'><head><meta charset='utf-8'><link rel='stylesheet' href='styles.css'></head><body><div id='app'></div><script src='language.js'></script><script src='app.js'></script></body></html>""",
            encoding="utf-8",
        )
        (site / "service-worker.js").write_text(
            """const CACHE_NAME='fifa-tournament-hub-v43-3-0-live-motion';\nconst APP_SHELL=['./','./index.html'];\nself.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL))));""",
            encoding="utf-8",
        )
        subprocess.run(["python", str(ROOT / "install_v43_4.py"), str(site)], check=True)
        index = (site / "index.html").read_text(encoding="utf-8")
        worker = (site / "service-worker.js").read_text(encoding="utf-8")
        assert 'data-v434-asset="css"' in index
        assert 'data-v434-asset="js"' in index
        assert (site / "v43-4-game-shell.css").exists()
        assert (site / "v43-4-game-shell.js").exists()
        assert "fifa-tournament-hub-v43-4-0-official-english" in worker
        assert "./v43-4-game-shell.css" in worker
        assert "./v43-4-game-shell.js" in worker

        # Re-running must be idempotent for HTML references.
        subprocess.run(["python", str(ROOT / "install_v43_4.py"), str(site)], check=True)
        index2 = (site / "index.html").read_text(encoding="utf-8")
        assert index2.count('data-v434-asset="css"') == 1
        assert index2.count('data-v434-asset="js"') == 1

    js = (ROOT / "github" / "v43-4-game-shell.js").read_text(encoding="utf-8")
    required = [
        'enterMode("official")',
        'enterMode("test")',
        "showGate()",
        "function setLanguage",
        "MutationObserver",
        "FIFA_APP_CONTEXT",
        "auditEnglishCoverage",
        "shutdown-mode",
    ]
    for marker in required:
        assert marker in js, marker

    print("V43.4.0 smoke test: PASS")


if __name__ == "__main__":
    run()
