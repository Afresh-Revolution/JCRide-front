"""PWA routes - manifest, service worker, offline page at root scope."""

from pathlib import Path

from flask import Blueprint, Response, send_from_directory

pwa_bp = Blueprint("pwa", __name__)

_PWA_DIR = Path(__file__).resolve().parent.parent / "static" / "pwa"


@pwa_bp.get("/sw.js")
def service_worker():
    response = send_from_directory(_PWA_DIR, "sw.js", mimetype="application/javascript")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Service-Worker-Allowed"] = "/"
    return response


@pwa_bp.get("/manifest.webmanifest")
def web_manifest():
    response = send_from_directory(_PWA_DIR, "manifest.webmanifest", mimetype="application/manifest+json")
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@pwa_bp.get("/offline")
def offline_page():
    response = send_from_directory(_PWA_DIR, "offline.html", mimetype="text/html; charset=utf-8")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@pwa_bp.get("/robots.txt")
def robots_txt():
    return send_from_directory(_PWA_DIR, "robots.txt", mimetype="text/plain; charset=utf-8")


@pwa_bp.get("/browserconfig.xml")
def browser_config():
    return send_from_directory(_PWA_DIR, "browserconfig.xml", mimetype="application/xml; charset=utf-8")


@pwa_bp.get("/sitemap.xml")
def sitemap_xml():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>/portals</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>/login</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>/register</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
</urlset>"""
    return Response(xml, mimetype="application/xml; charset=utf-8")
