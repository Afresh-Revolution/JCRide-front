"""Driver portal routes."""

from flask import Blueprint, flash, redirect, render_template, request, session, url_for

from app.driver_portal.data import (
    ACTIVE_TRIP,
    DRIVER_PROFILE,
    HERO_STATS,
    METRICS,
    NEARBY_DEMAND,
    NOTIFICATIONS,
    NOTIFICATION_ALERTS,
    NOTIFICATION_CHANNELS,
    DRIVER_SUPPORT_CATEGORIES,
    DRIVER_SUPPORT_FAQ,
    RIDE_REQUESTS,
    WEEKLY_EARNINGS,
)
from app.driver_portal.earnings_service import resolve_earnings_page
from app.driver_portal.profile_service import resolve_profile_page
from app.driver_portal.settings_service import (
    resolve_settings_page,
    settings_to_session_payload,
)
from app.driver_portal.trip_service import (
    api_ride_to_active_trip,
    request_to_active_trip,
    resolve_active_trip,
    trip_map_payload,
)
from app.services.api_client import (
    ApiError,
    accept_driver_ride,
    complete_driver_ride,
    driver_settings_deactivate_request,
    driver_settings_go_offline,
    driver_settings_pause,
    get_driver_profile,
    get_driver_settings,
    login,
    register,
    set_availability,
    submit_driver_support_ticket,
    update_driver_profile,
    update_driver_settings,
)

driver_portal_bp = Blueprint(
    "driver_portal",
    __name__,
    url_prefix="/driver-portal",
    template_folder="../templates/driver_portal",
    static_folder="../static/driver_portal",
)


SERVICE_TIERS = ("economy", "comfort", "premium")
VEHICLE_CATEGORIES = ("car", "bike")
NOTIFICATION_ALERTS_KEY = "driver_notification_alerts"
NOTIFICATION_CHANNELS_KEY = "driver_notification_channels"
NOTIFICATIONS_READ_KEY = "driver_notifications_read"
DRIVER_APP_SETTINGS_KEY = "driver_app_settings"


def _require_driver():
    if not (session.get("driver_token") or session.get("token")):
        flash("Please sign in to access the driver portal.", "error")
        return redirect(url_for("main.driver_login_page"))
    return None


def _driver_token():
    token = session.get("driver_token") or session.get("token")
    if token and token != "demo-token":
        return token
    return None


def _load_driver_profile():
    token = _driver_token()
    if not token:
        return None
    try:
        return get_driver_profile(token)
    except ApiError:
        return None


def _driver_profile():
    driver = _load_driver_profile()
    if driver:
        name = driver.get("full_name") or session.get("driver_name", DRIVER_PROFILE["name"])
        plate = driver.get("plate_number") or DRIVER_PROFILE["plate"]
        return {
            **DRIVER_PROFILE,
            "name": name,
            "plate": plate,
            "initials": "".join(part[0] for part in name.split()[:2]).upper() or "DR",
        }
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


def _notification_items():
    read_ids = set(session.get(NOTIFICATIONS_READ_KEY) or [])
    items = []
    for item in NOTIFICATIONS:
        row = dict(item)
        row["unread"] = item["id"] not in read_ids
        items.append(row)
    return items


def _notification_alert_settings():
    stored = session.get(NOTIFICATION_ALERTS_KEY)
    if stored:
        return stored
    return [dict(row) for row in NOTIFICATION_ALERTS]


def _notification_channel_settings():
    stored = session.get(NOTIFICATION_CHANNELS_KEY)
    if stored:
        return stored
    return [dict(row) for row in NOTIFICATION_CHANNELS]


def _sync_notification_settings_from_api(token):
    try:
        data = get_driver_settings(token)
        alerts = data.get("notification_alerts") or data.get("alerts")
        channels = data.get("notification_channels") or data.get("channels")
        if alerts:
            session[NOTIFICATION_ALERTS_KEY] = alerts
        if channels:
            session[NOTIFICATION_CHANNELS_KEY] = channels
    except ApiError:
        pass


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
            user = result.get("user") or {}
            session["token"] = result.get("access_token", "")
            session["driver_token"] = session["token"]
            session["user_id"] = user.get("id")
            session["email"] = user.get("email") or (email_or_phone if "@" in email_or_phone else "")
            session["phone"] = user.get("phone") or (email_or_phone if "@" not in email_or_phone else "")
            session["name"] = user.get("full_name")
            session["role"] = user.get("role", "driver")
            session["portal"] = "driver"
            session["driver_name"] = user.get("full_name") or DRIVER_PROFILE["name"]
            session["driver_email"] = session["email"]
            session["driver_phone"] = session["phone"]
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
            driver=_load_driver_profile(),
            service_tiers=SERVICE_TIERS,
            vehicle_categories=VEHICLE_CATEGORIES,
        ),
    )


@driver_portal_bp.route("/dashboard/vehicle-profile", methods=["POST"])
def update_vehicle_profile():
    guard = _require_driver()
    if guard:
        return guard

    token = _driver_token()
    if not token:
        flash("Please sign in again.", "error")
        return redirect(url_for("driver_portal.login"))

    service_tier = request.form.get("service_tier", "").strip().lower()
    vehicle_category = request.form.get("vehicle_category", "").strip().lower()
    vehicle_make = request.form.get("vehicle_make", "").strip()
    vehicle_color = request.form.get("vehicle_color", "").strip()
    plate_number = request.form.get("plate_number", "").strip()

    payload = {}
    if service_tier in SERVICE_TIERS:
        payload["service_tier"] = service_tier
    if vehicle_category in VEHICLE_CATEGORIES:
        payload["vehicle_category"] = vehicle_category
    if vehicle_make:
        payload["vehicle_make"] = vehicle_make
    if vehicle_color:
        payload["vehicle_color"] = vehicle_color
    if plate_number:
        payload["plate_number"] = plate_number

    if not payload:
        flash("Fill in at least one field.", "error")
        return redirect(url_for("driver_portal.dashboard"))

    try:
        update_driver_profile(token, payload)
        flash("Vehicle profile saved.", "success")
    except ApiError as exc:
        flash(exc.message, "error")

    return redirect(url_for("driver_portal.dashboard"))


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
    accepted = next((r for r in pending if r["id"] == request_id), None)
    token = _driver_token()

    if token and accepted:
        try:
            result = accept_driver_ride(token, request_id)
            trip = api_ride_to_active_trip(result.get("ride") or result)
            if trip:
                session["active_trip_data"] = trip
        except ApiError:
            if accepted:
                session["active_trip_data"] = request_to_active_trip(accepted)
    elif accepted:
        session["active_trip_data"] = request_to_active_trip(accepted)

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

    trip = resolve_active_trip(_driver_token(), session)
    context = _portal_context("active_trip")
    if trip:
        context["trip"] = trip
        context["map_data"] = trip_map_payload(trip)
    else:
        context["trip"] = None
        context["map_data"] = None

    return render_template("pages/active_trip.html", **context)


@driver_portal_bp.route("/api/active-trip-map")
def api_active_trip_map():
    guard = _require_driver()
    if guard:
        return {"error": "unauthorized"}, 401

    trip = resolve_active_trip(_driver_token(), session)
    if not trip:
        return {"trip": None, "map": None}

    return {
        "trip": {
            "distance_left_km": trip.get("distance_left_km"),
            "earnings_live": trip.get("earnings_live"),
            "trip_time": trip.get("trip_time"),
            "speed_kmh": trip.get("speed_kmh"),
        },
        "map": trip_map_payload(trip),
    }


@driver_portal_bp.route("/active-trip/complete", methods=["POST"])
def complete_trip():
    guard = _require_driver()
    if guard:
        return guard

    trip = resolve_active_trip(_driver_token(), session)
    if not trip:
        flash("No active trip to complete.", "error")
        return redirect(url_for("driver_portal.ride_requests"))

    ride_id = trip.get("id")
    token = _driver_token()
    if token and ride_id:
        try:
            complete_driver_ride(token, ride_id)
        except ApiError as exc:
            flash(exc.message, "error")
            return redirect(url_for("driver_portal.active_trip"))

    session.pop("active_trip_id", None)
    session.pop("active_trip_data", None)
    flash("Trip completed. Great job, captain!", "success")
    return redirect(url_for("driver_portal.dashboard"))


@driver_portal_bp.route("/earnings")
def earnings():
    guard = _require_driver()
    if guard:
        return guard

    page_data = resolve_earnings_page(_driver_token())
    return render_template(
        "pages/earnings.html",
        **_portal_context(
            "earnings",
            earnings=page_data,
            withdrawal=page_data["withdrawal"],
            chart_data={
                "weekly_trend": page_data["weekly_trend"],
                "daily_trips": page_data["daily_trips"],
            },
        ),
    )


@driver_portal_bp.route("/earnings/withdraw", methods=["POST"])
def withdraw_earnings():
    guard = _require_driver()
    if guard:
        return guard

    flash("Withdrawal request submitted. Funds arrive within minutes.", "success")
    return redirect(url_for("driver_portal.earnings"))


@driver_portal_bp.route("/notifications")
def notifications():
    guard = _require_driver()
    if guard:
        return guard

    token = _driver_token()
    if token:
        _sync_notification_settings_from_api(token)

    items = _notification_items()
    unread_count = sum(1 for item in items if item.get("unread"))

    return render_template(
        "pages/notifications.html",
        **_portal_context(
            "notifications",
            notifications=items,
            unread_count=unread_count,
            alert_settings=_notification_alert_settings(),
            channel_settings=_notification_channel_settings(),
        ),
    )


@driver_portal_bp.route("/notifications/mark-read", methods=["POST"])
def mark_notifications_read():
    guard = _require_driver()
    if guard:
        return guard

    session[NOTIFICATIONS_READ_KEY] = [item["id"] for item in NOTIFICATIONS]
    flash("All notifications marked as read.", "success")
    return redirect(url_for("driver_portal.notifications"))


@driver_portal_bp.route("/notifications/settings", methods=["POST"])
def update_notification_setting():
    guard = _require_driver()
    if guard:
        return guard

    setting_id = request.form.get("setting_id", "")
    group = request.form.get("group", "alerts")
    enabled = request.form.get("enabled") == "1"
    session_key = NOTIFICATION_ALERTS_KEY if group == "alerts" else NOTIFICATION_CHANNELS_KEY
    defaults = NOTIFICATION_ALERTS if group == "alerts" else NOTIFICATION_CHANNELS
    current = session.get(session_key) or [dict(row) for row in defaults]

    updated = []
    for row in current:
        item = dict(row)
        if item.get("id") == setting_id:
            item["enabled"] = enabled
        updated.append(item)
    session[session_key] = updated

    token = _driver_token()
    if token:
        try:
            payload_key = "notification_alerts" if group == "alerts" else "notification_channels"
            update_driver_settings(token, {payload_key: updated})
        except ApiError:
            pass

    return redirect(url_for("driver_portal.notifications"))


def _get_app_settings():
    return session.get(DRIVER_APP_SETTINGS_KEY)


def _save_app_settings(settings: dict):
    session[DRIVER_APP_SETTINGS_KEY] = settings_to_session_payload(settings)
    session.modified = True


def _current_settings():
    return resolve_settings_page(_driver_token(), _get_app_settings())


@driver_portal_bp.route("/profile")
def profile():
    guard = _require_driver()
    if guard:
        return guard

    driver_profile = resolve_profile_page(_driver_token())
    return render_template(
        "pages/profile.html",
        **_portal_context("profile", driver_profile=driver_profile),
    )


@driver_portal_bp.route("/settings")
def settings():
    guard = _require_driver()
    if guard:
        return guard

    page_settings = _current_settings()
    return render_template(
        "pages/settings.html",
        **_portal_context("settings", settings=page_settings),
    )


@driver_portal_bp.route("/settings/toggle", methods=["POST"])
def update_settings_toggle():
    guard = _require_driver()
    if guard:
        return guard

    setting_id = request.form.get("setting_id", "")
    group = request.form.get("group", "preferences")
    enabled = request.form.get("enabled") == "1"
    page_settings = _current_settings()
    target = page_settings.get(group) or []

    updated = []
    for row in target:
        item = dict(row)
        if item.get("id") == setting_id:
            item["enabled"] = enabled
        updated.append(item)
    page_settings[group] = updated
    _save_app_settings(page_settings)

    token = _driver_token()
    if token:
        try:
            payload = {group: {row["id"]: row["enabled"] for row in updated}}
            update_driver_settings(token, payload)
        except ApiError:
            pass

    return redirect(url_for("driver_portal.settings"))


@driver_portal_bp.route("/settings/locale", methods=["POST"])
def update_settings_locale():
    guard = _require_driver()
    if guard:
        return guard

    page_settings = _current_settings()
    locale = dict(page_settings.get("locale") or {})
    for key in ("language", "nav_voice", "distance_units", "timezone"):
        value = request.form.get(key, "").strip()
        if value:
            locale[key] = value
    page_settings["locale"] = locale
    _save_app_settings(page_settings)

    token = _driver_token()
    if token:
        try:
            update_driver_settings(token, {"locale": locale})
        except ApiError:
            pass

    return redirect(url_for("driver_portal.settings"))


@driver_portal_bp.route("/settings/go-offline", methods=["POST"])
def settings_go_offline():
    guard = _require_driver()
    if guard:
        return guard

    token = _driver_token()
    if token:
        try:
            driver_settings_go_offline(token)
        except ApiError as exc:
            flash(exc.message, "error")
            return redirect(url_for("driver_portal.settings"))

    session["driver_online"] = False
    flash("You are now offline.", "success")
    return redirect(url_for("driver_portal.settings"))


@driver_portal_bp.route("/settings/pause", methods=["POST"])
def settings_pause():
    guard = _require_driver()
    if guard:
        return guard

    token = _driver_token()
    if token:
        try:
            driver_settings_pause(token)
        except ApiError as exc:
            flash(exc.message, "error")
            return redirect(url_for("driver_portal.settings"))

    session["driver_online"] = False
    flash("Driving paused for up to 7 days.", "success")
    return redirect(url_for("driver_portal.settings"))


@driver_portal_bp.route("/settings/deactivate", methods=["POST"])
def settings_deactivate():
    guard = _require_driver()
    if guard:
        return guard

    token = _driver_token()
    if token:
        try:
            driver_settings_deactivate_request(token)
        except ApiError as exc:
            flash(exc.message, "error")
            return redirect(url_for("driver_portal.settings"))

    flash("Deactivation request submitted. Our support team will follow up.", "success")
    return redirect(url_for("driver_portal.settings"))


@driver_portal_bp.route("/support", methods=["GET", "POST"])
def support():
    guard = _require_driver()
    if guard:
        return guard

    form_trip_id = ""
    form_description = ""

    if request.method == "POST":
        category = request.form.get("category", "").strip()
        description = request.form.get("description", "").strip()
        trip_id = request.form.get("trip_id", "").strip()
        form_trip_id = trip_id
        form_description = description

        if not category or not description:
            flash("Select a category and describe the issue.", "error")
        else:
            token = _driver_token()
            submitted = False
            if token:
                try:
                    submit_driver_support_ticket(token, category, description, trip_id or None)
                    submitted = True
                except ApiError as exc:
                    if exc.status_code not in (404, 405, 501):
                        flash(exc.message, "error")
                        return redirect(url_for("driver_portal.support"))

            if submitted or not token:
                flash("Support ticket submitted. We will respond shortly.", "success")
                return redirect(url_for("driver_portal.support"))

    return render_template(
        "pages/support.html",
        **_portal_context(
            "support",
            support_categories=DRIVER_SUPPORT_CATEGORIES,
            support_faq=DRIVER_SUPPORT_FAQ,
            form_trip_id=form_trip_id,
            form_description=form_description,
        ),
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
    session.pop("driver_email", None)
    session.pop("driver_name", None)
    session.pop("driver_online", None)
    session.pop("pending_ride_requests", None)
    session.pop("active_trip_id", None)
    session.pop("active_trip_data", None)
    session.pop("token", None)
    session.pop("user_id", None)
    session.pop("email", None)
    session.pop("phone", None)
    session.pop("name", None)
    session.pop("role", None)
    session.pop("portal", None)
    flash("Signed out.", "success")
    return redirect(url_for("main.driver_login_page"))
