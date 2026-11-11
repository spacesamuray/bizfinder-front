"""Copy the Bizfinder app into the web version (site/app/), so both run the same code.

The app itself is in bizfinder/static/: change it there, then run this again. It copies
app.js, app.css, vendor/ and brand/, and writes site/app/index.html from the app's page
with relative paths, the web mode switched on (data-hosted) and the web version's own
scripts added: service.js (sign-in check, account) and demo-api.js (sample searches,
until the backend is online).

Run from the project folder:  python3 site/tools/sync_app.py
"""

import shutil
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[2]
STATIC = PROJECT / "bizfinder" / "static"
APP = PROJECT / "site" / "app"

ADDED = """    <meta name="robots" content="noindex" />
    <link rel="stylesheet" href="service.css" />
    <!-- The web version: the sign-in check and account (service.js) and, until the backend
         is online, answers from the sample searches (demo-api.js). -->
    <script src="../auth.js"></script>
    <script src="service.js"></script>
    <script src="demo-api.js"></script>
  </head>"""


def main():
    APP.mkdir(parents=True, exist_ok=True)
    for name in ("app.js", "app.css"):
        shutil.copy2(STATIC / name, APP / name)
    for folder in ("vendor", "brand"):
        shutil.rmtree(APP / folder, ignore_errors=True)
        shutil.copytree(STATIC / folder, APP / folder)

    page = (STATIC / "index.html").read_text(encoding="utf-8")
    for old, new in (
        ('<html lang="en">', '<html lang="en" data-hosted="true">'),
        ("/static/", ""),
        ("  </head>", ADDED),
    ):
        if old not in page:
            raise SystemExit(f"bizfinder/static/index.html changed: can't find {old!r}. Update sync_app.py.")
        page = page.replace(old, new, 1 if old != "/static/" else -1)
    note = "<!-- Made by site/tools/sync_app.py from bizfinder/static/index.html: edit that one, then run it again. -->\n"
    (APP / "index.html").write_text(page.replace("<!doctype html>\n", "<!doctype html>\n" + note, 1), encoding="utf-8")
    print(f"Copied the app into {APP.relative_to(PROJECT)}/")


if __name__ == "__main__":
    main()
