"""Gate portal routes so they are only reachable through in-app entry actions."""

from __future__ import annotations

from flask import flash, redirect, request, session, url_for

BLOCKED_NAV_MESSAGE = (
    "This page can't be opened directly. Use the portal buttons on the home page to sign in."
)

RIDER_ENTRY_KEY = "rider_portal_entry"
DRIVER_ENTRY_KEY = "driver_portal_entry"
ADMIN_ENTRY_KEY = "admin_portal_entry"

RIDER_ROLES = frozenset({"customer", "rider"})

PUBLIC_ENDPOINTS = frozenset(
    {
        "main.home",
        "main.portals_page",
        "main.enter_rider_portal",
        "main.enter_driver_portal",
        "main.enter_rider_register",
        "main.enter_driver_register",
        "admin.enter_portal",
        "main.logout",
        "admin.logout",
        "driver_portal.logout",
    }
)

RIDER_AUTH_ENDPOINTS = frozenset(
    {
        "main.rider_login_page",
        "main.user_register_page",
        "main.register_page",
        "main.forgot_password_page",
    }
)

DRIVER_AUTH_ENDPOINTS = frozenset(
    {
        "main.driver_login_page",
        "main.driver_register_page",
        "driver_portal.login",
        "driver_portal.register_page",
    }
)

ADMIN_AUTH_ENDPOINTS = frozenset({"admin.login_page"})


def grant_rider_entry() -> None:
    session[RIDER_ENTRY_KEY] = True
    session.modified = True


def grant_driver_entry() -> None:
    session[DRIVER_ENTRY_KEY] = True
    session.modified = True


def grant_admin_entry() -> None:
    session[ADMIN_ENTRY_KEY] = True
    session.modified = True


def revoke_rider_entry() -> None:
    session.pop(RIDER_ENTRY_KEY, None)


def revoke_driver_entry() -> None:
    session.pop(DRIVER_ENTRY_KEY, None)


def revoke_admin_entry() -> None:
    session.pop(ADMIN_ENTRY_KEY, None)


def has_rider_entry() -> bool:
    return bool(session.get(RIDER_ENTRY_KEY))


def has_driver_entry() -> bool:
    return bool(session.get(DRIVER_ENTRY_KEY))


def has_admin_entry() -> bool:
    return bool(session.get(ADMIN_ENTRY_KEY))


def is_authenticated_rider() -> bool:
    return bool(session.get("token")) and (session.get("role") or "").lower() in RIDER_ROLES


def is_authenticated_driver() -> bool:
    role = (session.get("role") or "").lower()
    return bool(session.get("driver_token") or (session.get("token") and role == "driver"))


def is_authenticated_admin() -> bool:
    return bool(session.get("admin_token"))


def _redirect_home():
    flash(BLOCKED_NAV_MESSAGE, "info")
    return redirect(url_for("main.home"))


def _is_api_path(path: str) -> bool:
    return "/api/" in path


def _login_portal() -> str:
    return (request.args.get("portal") or request.form.get("portal") or "rider").strip().lower()


def enforce_navigation_guard():
    endpoint = request.endpoint
    if not endpoint or endpoint.startswith("static") or endpoint.startswith("pwa."):
        return None
    if endpoint == "api_config_check":
        return None
    if endpoint in PUBLIC_ENDPOINTS:
        return None
    if request.path.startswith("/static/"):
        return None
    if _is_api_path(request.path):
        return None

    path = request.path

    if path.startswith("/admin"):
        if is_authenticated_admin():
            return None
        if endpoint in ADMIN_AUTH_ENDPOINTS and has_admin_entry():
            return None
        return _redirect_home()

    if path.startswith("/driver-portal") or path == "/driver":
        if is_authenticated_driver():
            return None
        if endpoint in DRIVER_AUTH_ENDPOINTS and has_driver_entry():
            return None
        return _redirect_home()

    rider_path = path.startswith("/user") or path == "/ride"
    rider_auth_endpoint = endpoint in RIDER_AUTH_ENDPOINTS or (
        endpoint == "main.login_page" and _login_portal() != "driver"
    )

    if rider_path or rider_auth_endpoint:
        if is_authenticated_rider():
            return None
        if rider_auth_endpoint and has_rider_entry():
            return None
        return _redirect_home()

    driver_auth_endpoint = endpoint in DRIVER_AUTH_ENDPOINTS or (
        endpoint == "main.login_page" and _login_portal() == "driver"
    )
    if driver_auth_endpoint:
        if is_authenticated_driver():
            return None
        if has_driver_entry():
            return None
        return _redirect_home()

    return None
