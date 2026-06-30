"""Helpers for static assets."""

import os

from flask import current_app, url_for


def static_url(filename: str) -> str:
    """Return a static file URL with a cache-busting query from file mtime."""
    url = url_for("static", filename=filename)
    try:
        static_root = current_app.static_folder
        if static_root:
            path = os.path.join(static_root, filename.replace("/", os.sep))
            if os.path.isfile(path):
                return f"{url}?v={int(os.path.getmtime(path))}"
    except RuntimeError:
        pass
    return url
