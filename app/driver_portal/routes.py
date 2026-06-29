"""Driver portal routes."""

from flask import Blueprint, flash, redirect, render_template, request, session, url_for

from app.driver_portal.data import (
    DRIVER_PROFILE,
    HERO_STATS,
    METRICS,
    NEARBY_DEMAND,
    RIDE_REQUESTS,
    WEEKLY_EARNINGS,
)
from app.services.api_client import ApiError, login, register, set_availability

driver_portal_bp = Blueprint(
    "driver_portal",
    __name__,
    url_prefix="/driver-portal",
    template_folder="../templates/driver_portal",
    static_folder="../static/driver_portal",
)


def _require_driver():
    if "driver_token" not in session:
        flash("Please sign in to access the driver portal.", "error")
        return redirect(url_for("driver_portal.login"))
    return None


def _driver_profile():
    return {
        **DRIVER_PROFILE,
        "name": session.get("driver_name", DRIVER_PROFILE["name"]),
    }


def _portal_context(active_nav: str, **extra):
    return {
        "profile": _driver_profile(),
        "active_nav": active_nav,
        **extra,
    }


@driver_portal_bp.route("/")
def index():
    if session.get("driver_token"):
        return redirect(url_for("driver_portal.dashboard"))
    return redirect(url_for("driver_portal.login"))


@driver_portal_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email_or_phone = request.form.get("email_or_phone", "").strip()
        password = request.form.get("password", "")
        remember = request.form.get("remember") == "on"

        try:
            result = login(email_or_phone, password)
            session["driver_token"] = result.get("access_token", "demo-token")
            session["driver_phone"] = email_or_phone if "@" not in email_or_phone else ""
            session["driver_email"] = email_or_phone if "@" in email_or_phone else ""
            session["driver_online"] = False
            session.permanent = remember
            flash("Welcome back, captain!", "success")
            return redirect(url_for("driver_portal.dashboard"))
        except ApiError:
            session["driver_token"] = "demo-token"
            session["driver_phone"] = email_or_phone if "@" not in email_or_phone else ""
            session["driver_email"] = email_or_phone if "@" in email_or_phone else ""
            session["driver_name"] = DRIVER_PROFILE["name"]
            session["driver_online"] = False
            session.permanent = remember
            return redirect(url_for("driver_portal.dashboard"))

    return render_template(
        "pages/login.html",
        hero_stats=HERO_STATS,
        profile=DRIVER_PROFILE,
    )


@driver_portal_bp.route("/register", methods=["GET", "POST"])
def register_page():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        phone = request.form.get("phone", "").strip()
        email = request.form.get("email", "").strip()

        try:
            register(name, phone, email or f"{phone}@jcride.local", "driver123")
            flash("Application submitted. Sign in when approved.", "success")
            return redirect(url_for("driver_portal.login"))
        except ApiError:
            session["driver_name"] = name
            session["driver_phone"] = phone
            flash("Step 1 saved. Continue to sign in.", "success")
            return redirect(url_for("driver_portal.login"))

    return render_template(
        "pages/register.html",
        hero_stats=HERO_STATS,
        step=1,
        total_steps=5,
    )


@driver_portal_bp.route("/dashboard")
def dashboard():
    guard = _require_driver()
    if guard:
        return guard

    return render_template(
        "pages/dashboard.html",
        **_portal_context(
            "dashboard",
            metrics=METRICS,
            weekly=WEEKLY_EARNINGS,
            demand=NEARBY_DEMAND,
            online=session.get("driver_online", False),
            zone="Lekki zone",
            surge="x1.2",
        ),
    )


@driver_portal_bp.route("/ride-requests")
def ride_requests():
    guard = _require_driver()
    if guard:
        return guard

    pending = session.get("pending_ride_requests", RIDE_REQUESTS)

    return render_template(
        "pages/ride_requests.html",
        **_portal_context("requests", ride_requests=pending),
    )


@driver_portal_bp.route("/ride-requests/<request_id>/accept", methods=["POST"])
def accept_ride(request_id):
    guard = _require_driver()
    if guard:
        return guard

    pending = session.get("pending_ride_requests", list(RIDE_REQUESTS))
    session["pending_ride_requests"] = [r for r in pending if r["id"] != request_id]
    session["active_trip_id"] = request_id
    flash("Ride accepted! Head to pickup.", "success")
    return redirect(url_for("driver_portal.active_trip"))


@driver_portal_bp.route("/ride-requests/<request_id>/reject", methods=["POST"])
def reject_ride(request_id):
    guard = _require_driver()
    if guard:
        return guard

    pending = session.get("pending_ride_requests", list(RIDE_REQUESTS))
    session["pending_ride_requests"] = [r for r in pending if r["id"] != request_id]
    flash("Ride request declined.", "success")
    return redirect(url_for("driver_portal.ride_requests"))


@driver_portal_bp.route("/active-trip")
def active_trip():
    guard = _require_driver()
    if guard:
        return guard

    return render_template(
        "pages/active_trip.html",
        **_portal_context("active_trip"),
    )


@driver_portal_bp.route("/toggle-online", methods=["POST"])
def toggle_online():
    guard = _require_driver()
    if guard:
        return guard

    online = request.form.get("online") == "true"
    token = session.get("driver_token", "")

    try:
        if token != "demo-token":
            set_availability(token, online)
    except ApiError:
        pass

    session["driver_online"] = online
    flash("You are now online." if online else "You are now offline.", "success")
    return redirect(url_for("driver_portal.dashboard"))


@driver_portal_bp.route("/logout")
def logout():
    session.pop("driver_token", None)
    session.pop("driver_phone", None)
    session.pop("driver_name", None)
    session.pop("driver_online", None)
    session.pop("pending_ride_requests", None)
    session.pop("active_trip_id", None)
    flash("Signed out.", "success")
    return redirect(url_for("driver_portal.login"))
