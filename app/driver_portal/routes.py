"""Driver portal routes."""

from flask import Blueprint, flash, jsonify, redirect, render_template, request, session, url_for

from app.driver_api_transforms import support_faq_for_driver
from app.driver_portal.dashboard_service import resolve_dashboard
from app.driver_portal.data import DRIVER_SUPPORT_CATEGORIES, HERO_STATS
from app.driver_portal.earnings_service import resolve_earnings_page, resolve_earnings_transactions
from app.driver_portal.notifications_service import (
    resolve_notification_settings,
    resolve_notifications_inbox,
)
from app.driver_portal.profile_service import resolve_profile_page
from app.driver_portal.ride_requests_service import resolve_ride_requests
from app.driver_portal.settings_service import (
    locale_form_to_api,
    notification_alert_to_api,
    notification_channel_to_api,
    resolve_settings_page,
    settings_to_session_payload,
    settings_toggle_to_api,
)
from app.driver_portal.trip_service import api_ride_to_active_trip, resolve_active_trip, trip_map_payload
from app.services.api_client import (
    ApiError,
    accept_driver_ride,
    cancel_driver_ride,
    complete_driver_ride,
    create_support_ticket,
    driver_ride_arrived,
    driver_settings_deactivate_request,
    driver_settings_go_offline,
    driver_settings_pause,
    get_driver_profile,
    get_driver_payout_account,
    get_driver_ride_requests,
    list_support_tickets,
    login,
    mark_all_notifications_read,
    mark_notification_read,
    register,
    register_device,
    reject_driver_ride,
    set_availability,
    start_ride,
    update_driver_profile,
    update_driver_settings,
    update_notification_preferences,
    upsert_driver_payout_account,
    withdraw_wallet,
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


def _require_driver_api():
    if not _driver_token():
        return jsonify({"error": "unauthorized"}), 401
    return None


def _driver_api_error(exc: ApiError):
    return jsonify({"error": exc.message}), exc.status_code


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
    name = session.get("driver_name") or "Driver"
    rating = 0
    plate = "—"
    approval_status = ""
    initials = "DR"

    if driver:
        name = driver.get("full_name") or name
        rating = float(driver.get("rating_avg") or 0)
        plate = driver.get("plate_number") or "—"
        approval_status = str(driver.get("status") or "").replace("_", " ").title()
        initials = "".join(part[0] for part in name.split()[:2]).upper() or "DR"
        session["driver_online"] = bool(driver.get("is_online"))

    return {
        "name": name,
        "initials": initials,
        "rating": rating,
        "plate": plate,
        "approval_status": approval_status,
    }


def _portal_context(active_nav: str, **extra):
    return {
        "profile": _driver_profile(),
        "active_nav": active_nav,
        **extra,
    }


def _get_app_settings():
    return session.get(DRIVER_APP_SETTINGS_KEY)


def _save_app_settings(settings: dict):
    session[DRIVER_APP_SETTINGS_KEY] = settings_to_session_payload(settings)
    session.modified = True


def _current_settings():
    page_settings, _ = resolve_settings_page(_driver_token(), _get_app_settings())
    return page_settings


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
            session["driver_name"] = user.get("full_name") or "Driver"
            session["driver_email"] = session["email"]
            session["driver_phone"] = session["phone"]
            session["driver_online"] = False
            session.permanent = remember
            flash("Welcome back, captain!", "success")
            return redirect(url_for("driver_portal.dashboard"))
        except ApiError as exc:
            flash(exc.message or "Sign in failed. Check your credentials.", "error")
            return redirect(url_for("driver_portal.login"))

    return render_template(
        "pages/login.html",
        hero_stats=HERO_STATS,
        profile={"name": "Driver", "initials": "DR", "rating": 0, "plate": "—"},
    )


@driver_portal_bp.route("/register", methods=["GET", "POST"])
def register_page():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        phone = request.form.get("phone", "").strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "driver123").strip() or "driver123"

        try:
            register(name, phone, email or f"{phone}@josride.local", password)
            flash("Application submitted. Sign in when approved.", "success")
            return redirect(url_for("driver_portal.login"))
        except ApiError as exc:
            flash(exc.message or "Registration failed. Try again.", "error")
            return redirect(url_for("driver_portal.register_page"))

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

    token = _driver_token()
    dashboard_data, api_connected = resolve_dashboard(token)
    driver = _load_driver_profile()
    online = bool(driver.get("is_online")) if driver else session.get("driver_online", False)

    return render_template(
        "pages/dashboard.html",
        **_portal_context(
            "dashboard",
            metrics=dashboard_data["metrics"],
            weekly=dashboard_data["weekly"],
            demand=dashboard_data["demand"],
            online=online,
            zone=dashboard_data["zone"],
            surge=dashboard_data["surge"],
            driver=driver,
            api_connected=api_connected,
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

    requests_list, api_connected = resolve_ride_requests(_driver_token())

    return render_template(
        "pages/ride_requests.html",
        **_portal_context("requests", ride_requests=requests_list, api_connected=api_connected),
    )


@driver_portal_bp.route("/ride-requests/<request_id>/accept", methods=["POST"])
def accept_ride(request_id):
    guard = _require_driver()
    if guard:
        return guard

    token = _driver_token()
    if not token:
        flash("Please sign in again.", "error")
        return redirect(url_for("driver_portal.login"))

    try:
        result = accept_driver_ride(token, request_id)
        trip = api_ride_to_active_trip(result.get("ride") or result)
        if trip.get("id"):
            session["active_trip_id"] = trip["id"]
        flash("Ride accepted! Head to pickup.", "success")
        return redirect(url_for("driver_portal.active_trip"))
    except ApiError as exc:
        flash(exc.message, "error")
        return redirect(url_for("driver_portal.ride_requests"))


@driver_portal_bp.route("/ride-requests/<request_id>/reject", methods=["POST"])
def reject_ride(request_id):
    guard = _require_driver()
    if guard:
        return guard

    token = _driver_token()
    if token:
        try:
            reject_driver_ride(token, request_id)
        except ApiError as exc:
            flash(exc.message, "error")
            return redirect(url_for("driver_portal.ride_requests"))

    flash("Ride request declined.", "success")
    return redirect(url_for("driver_portal.ride_requests"))


@driver_portal_bp.route("/active-trip")
def active_trip():
    guard = _require_driver()
    if guard:
        return guard

    trip = resolve_active_trip(_driver_token())
    context = _portal_context("active_trip", api_connected=bool(_driver_token()))
    if trip:
        context["trip"] = trip
        context["map_data"] = trip_map_payload(trip)
    else:
        context["trip"] = None
        context["map_data"] = None

    return render_template("pages/active_trip.html", **context)


@driver_portal_bp.route("/api/active-trip-map")
def api_active_trip_map():
    guard = _require_driver_api()
    if guard:
        return guard

    trip = resolve_active_trip(_driver_token())
    if not trip:
        return jsonify({"trip": None, "map": None})

    return jsonify(
        {
            "trip": {
                "distance_left_km": trip.get("distance_left_km"),
                "earnings_live": trip.get("earnings_live"),
                "trip_time": trip.get("trip_time"),
                "speed_kmh": trip.get("speed_kmh"),
            },
            "map": trip_map_payload(trip),
        }
    )


@driver_portal_bp.route("/active-trip/arrived", methods=["POST"])
def active_trip_arrived():
    guard = _require_driver()
    if guard:
        return guard

    trip = resolve_active_trip(_driver_token())
    if not trip:
        flash("No active trip.", "error")
        return redirect(url_for("driver_portal.ride_requests"))

    token = _driver_token()
    if token:
        try:
            driver_ride_arrived(token, trip["id"])
            flash("Marked as arrived at pickup.", "success")
        except ApiError as exc:
            flash(exc.message, "error")

    return redirect(url_for("driver_portal.active_trip"))


@driver_portal_bp.route("/active-trip/start", methods=["POST"])
def active_trip_start():
    guard = _require_driver()
    if guard:
        return guard

    trip = resolve_active_trip(_driver_token())
    if not trip:
        flash("No active trip.", "error")
        return redirect(url_for("driver_portal.ride_requests"))

    token = _driver_token()
    if token:
        try:
            start_ride(token, trip["id"])
            flash("Trip started.", "success")
        except ApiError as exc:
            flash(exc.message, "error")

    return redirect(url_for("driver_portal.active_trip"))


@driver_portal_bp.route("/active-trip/complete", methods=["POST"])
def complete_trip():
    guard = _require_driver()
    if guard:
        return guard

    trip = resolve_active_trip(_driver_token())
    if not trip:
        flash("No active trip to complete.", "error")
        return redirect(url_for("driver_portal.ride_requests"))

    token = _driver_token()
    if token:
        try:
            complete_driver_ride(token, trip["id"])
        except ApiError as exc:
            flash(exc.message, "error")
            return redirect(url_for("driver_portal.active_trip"))

    session.pop("active_trip_id", None)
    flash("Trip completed. Great job, captain!", "success")
    return redirect(url_for("driver_portal.dashboard"))


@driver_portal_bp.route("/active-trip/cancel", methods=["POST"])
def cancel_trip():
    guard = _require_driver()
    if guard:
        return guard

    trip = resolve_active_trip(_driver_token())
    if not trip:
        flash("No active trip to cancel.", "error")
        return redirect(url_for("driver_portal.ride_requests"))

    token = _driver_token()
    if token:
        try:
            cancel_driver_ride(token, trip["id"])
        except ApiError as exc:
            flash(exc.message, "error")
            return redirect(url_for("driver_portal.active_trip"))

    session.pop("active_trip_id", None)
    flash("Trip cancelled.", "success")
    return redirect(url_for("driver_portal.dashboard"))


@driver_portal_bp.route("/earnings")
def earnings():
    guard = _require_driver()
    if guard:
        return guard

    page_data, api_connected = resolve_earnings_page(_driver_token())
    transactions, tx_ok = resolve_earnings_transactions(_driver_token())
    payout = None
    token = _driver_token()
    if token:
        try:
            payout = get_driver_payout_account(token)
        except ApiError:
            pass
    return render_template(
        "pages/earnings.html",
        **_portal_context(
            "earnings",
            earnings=page_data,
            withdrawal=page_data["withdrawal"],
            transactions=transactions,
            payout=payout,
            api_connected=api_connected or tx_ok,
            chart_data={
                "weekly_trend": page_data["weekly_trend"],
                "daily_trips": page_data["daily_trips"],
            },
        ),
    )


@driver_portal_bp.route("/earnings/payout-account", methods=["POST"])
def save_payout_account():
    guard = _require_driver()
    if guard:
        return guard
    token = _driver_token()
    if not token:
        flash("Please sign in again.", "error")
        return redirect(url_for("driver_portal.login"))
    bank_name = request.form.get("bank_name", "").strip()
    account_number = request.form.get("account_number", "").strip()
    account_name = request.form.get("account_name", "").strip()
    if not bank_name or not account_number or not account_name:
        flash("Enter bank name, account number, and account name.", "error")
        return redirect(url_for("driver_portal.earnings"))
    try:
        upsert_driver_payout_account(
            token,
            {
                "bank_name": bank_name,
                "account_number": account_number,
                "account_name": account_name,
            },
        )
        flash("Payout account saved.", "success")
    except ApiError as exc:
        flash(exc.message, "error")
    return redirect(url_for("driver_portal.earnings"))


@driver_portal_bp.route("/profile/documents/upload", methods=["POST"])
def upload_profile_document():
    guard = _require_driver()
    if guard:
        return guard
    token = _driver_token()
    if not token:
        flash("Please sign in again.", "error")
        return redirect(url_for("driver_portal.profile"))
    document_type = request.form.get("document_type", "").strip()
    upload = request.files.get("file")
    if not document_type or not upload:
        flash("Select a document type and file.", "error")
        return redirect(url_for("driver_portal.profile"))
    try:
        from app.services.api_client import upload_driver_document

        upload_driver_document(token, document_type, upload)
        flash("Document uploaded for review.", "success")
    except ApiError as exc:
        flash(exc.message, "error")
    return redirect(url_for("driver_portal.profile"))


@driver_portal_bp.route("/api/devices/register", methods=["POST"])
def driver_api_register_device():
    guard = _require_driver_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            register_device(
                _driver_token(),
                payload.get("device_token", ""),
                payload.get("platform", "web"),
            )
        )
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/earnings/transactions")
def driver_api_earnings_transactions():
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        from app.services.api_client import get_driver_earnings_transactions

        return jsonify(get_driver_earnings_transactions(_driver_token(), limit=50))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/demand/nearby")
def driver_api_demand():
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        from app.services.api_client import get_driver_nearby_demand

        return jsonify(get_driver_nearby_demand(_driver_token()))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/payout-account", methods=["GET", "PUT"])
def driver_api_payout_account():
    guard = _require_driver_api()
    if guard:
        return guard
    token = _driver_token()
    if request.method == "GET":
        try:
            return jsonify(get_driver_payout_account(token) or {})
        except ApiError as exc:
            return _driver_api_error(exc)
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(upsert_driver_payout_account(token, payload))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/rides/active/navigation")
def driver_api_active_navigation():
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        from app.services.api_client import get_driver_active_trip_navigation

        return jsonify(get_driver_active_trip_navigation(_driver_token()) or {})
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/performance")
def driver_api_performance():
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        from app.services.api_client import get_driver_performance

        return jsonify(get_driver_performance(_driver_token()))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/earnings/withdraw", methods=["POST"])
def withdraw_earnings():
    guard = _require_driver()
    if guard:
        return guard

    token = _driver_token()
    if not token:
        flash("Please sign in again.", "error")
        return redirect(url_for("driver_portal.login"))

    page_data, _ = resolve_earnings_page(token)
    amount = float(page_data["withdrawal"].get("amount_raw") or 0)
    bank_name = request.form.get("bank_name", "").strip()
    account_number = request.form.get("account_number", "").strip()
    account_name = request.form.get("account_name", "").strip() or session.get("driver_name", "")

    payout = None
    try:
        payout = get_driver_payout_account(token)
    except ApiError:
        pass

    if payout and not bank_name:
        bank_name = payout.get("bank_name") or ""
    if payout and not account_number:
        flash("Saved payout account found but account number is masked. Re-enter account number to withdraw.", "error")
        return redirect(url_for("driver_portal.earnings"))

    if bank_name and account_number and account_name:
        try:
            upsert_driver_payout_account(
                token,
                {
                    "bank_name": bank_name,
                    "account_number": account_number,
                    "account_name": account_name,
                },
            )
        except ApiError:
            pass

    if amount <= 0:
        flash("No balance available to withdraw.", "error")
        return redirect(url_for("driver_portal.earnings"))
    if not bank_name or not account_number or not account_name:
        flash("Add bank name, account number, and account name to withdraw.", "error")
        return redirect(url_for("driver_portal.earnings"))

    try:
        withdraw_wallet(token, amount, bank_name, account_number, account_name)
        flash("Withdrawal request submitted.", "success")
    except ApiError as exc:
        flash(exc.message, "error")

    return redirect(url_for("driver_portal.earnings"))


@driver_portal_bp.route("/notifications")
def notifications():
    guard = _require_driver()
    if guard:
        return guard

    token = _driver_token()
    items, inbox_ok = resolve_notifications_inbox(token)
    alerts, channels, settings_ok = resolve_notification_settings(token)
    unread_count = sum(1 for item in items if item.get("unread"))

    return render_template(
        "pages/notifications.html",
        **_portal_context(
            "notifications",
            notifications=items,
            unread_count=unread_count,
            alert_settings=alerts,
            channel_settings=channels,
            api_connected=inbox_ok or settings_ok,
        ),
    )


@driver_portal_bp.route("/notifications/mark-read", methods=["POST"])
def mark_notifications_read():
    guard = _require_driver()
    if guard:
        return guard

    token = _driver_token()
    if token:
        try:
            mark_all_notifications_read(token)
        except ApiError as exc:
            flash(exc.message, "error")
            return redirect(url_for("driver_portal.notifications"))

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
    token = _driver_token()

    if token:
        try:
            if group == "alerts":
                driver_payload, prefs_payload = notification_alert_to_api(setting_id, enabled)
                if driver_payload:
                    update_driver_settings(token, driver_payload)
                if prefs_payload:
                    update_notification_preferences(token, prefs_payload)
            else:
                channel_payload = notification_channel_to_api(setting_id, enabled)
                if channel_payload:
                    update_notification_preferences(token, channel_payload)
        except ApiError:
            pass

    return redirect(url_for("driver_portal.notifications"))


@driver_portal_bp.route("/profile")
def profile():
    guard = _require_driver()
    if guard:
        return guard

    driver_profile, api_connected = resolve_profile_page(_driver_token())
    return render_template(
        "pages/profile.html",
        **_portal_context("profile", driver_profile=driver_profile, api_connected=api_connected),
    )


@driver_portal_bp.route("/settings")
def settings():
    guard = _require_driver()
    if guard:
        return guard

    page_settings, api_connected = resolve_settings_page(_driver_token(), _get_app_settings())
    return render_template(
        "pages/settings.html",
        **_portal_context("settings", settings=page_settings, api_connected=api_connected),
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
            payload = settings_toggle_to_api(group, setting_id, enabled)
            if payload:
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
            update_driver_settings(token, locale_form_to_api(locale))
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
    token = _driver_token()

    if request.method == "POST":
        category = request.form.get("category", "").strip()
        description = request.form.get("description", "").strip()
        trip_id = request.form.get("trip_id", "").strip()
        form_trip_id = trip_id
        form_description = description

        if not category or not description:
            flash("Select a category and describe the issue.", "error")
        elif not token:
            flash("Please sign in again.", "error")
            return redirect(url_for("driver_portal.login"))
        else:
            try:
                create_support_ticket(
                    token,
                    {
                        "category": category,
                        "subject": category,
                        "description": description,
                        "ride_id": trip_id or None,
                    },
                )
                flash("Support ticket submitted. We will respond shortly.", "success")
                return redirect(url_for("driver_portal.support"))
            except ApiError as exc:
                flash(exc.message, "error")

    tickets = []
    tickets_ok = False
    if token:
        try:
            data = list_support_tickets(token, limit=10)
            tickets = data.get("tickets") or []
            tickets_ok = True
        except ApiError:
            pass

    faq_items = support_faq_for_driver()

    return render_template(
        "pages/support.html",
        **_portal_context(
            "support",
            support_categories=DRIVER_SUPPORT_CATEGORIES,
            support_faq=faq_items,
            support_tickets=tickets,
            form_trip_id=form_trip_id,
            form_description=form_description,
            api_connected=tickets_ok or bool(faq_items),
        ),
    )


@driver_portal_bp.route("/toggle-online", methods=["POST"])
def toggle_online():
    guard = _require_driver()
    if guard:
        return guard

    online = request.form.get("online") == "true"
    token = _driver_token()

    if not token:
        flash("Please sign in again.", "error")
        return redirect(url_for("driver_portal.login"))

    try:
        set_availability(token, online)
        session["driver_online"] = online
        flash("You are now online." if online else "You are now offline.", "success")
    except ApiError as exc:
        flash(exc.message, "error")

    return redirect(url_for("driver_portal.dashboard"))


@driver_portal_bp.route("/logout")
def logout():
    for key in (
        "driver_token",
        "driver_phone",
        "driver_email",
        "driver_name",
        "driver_online",
        "active_trip_id",
        "token",
        "user_id",
        "email",
        "phone",
        "name",
        "role",
        "portal",
        DRIVER_APP_SETTINGS_KEY,
    ):
        session.pop(key, None)
    flash("Signed out.", "success")
    return redirect(url_for("main.driver_login_page"))


# ── Driver JSON API (proxies to JosRide-back) ──


@driver_portal_bp.route("/api/dashboard")
def driver_api_dashboard():
    guard = _require_driver_api()
    if guard:
        return guard
    data, _ = resolve_dashboard(_driver_token())
    return jsonify(data)


@driver_portal_bp.route("/api/ride-requests")
def driver_api_ride_requests():
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        data = get_driver_ride_requests(_driver_token())
        items = data if isinstance(data, list) else data.get("requests") or data.get("rides") or []
        return jsonify({"requests": items})
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/ride-requests/<ride_id>/accept", methods=["POST"])
def driver_api_accept_ride(ride_id):
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        return jsonify(accept_driver_ride(_driver_token(), ride_id))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/ride-requests/<ride_id>/reject", methods=["POST"])
def driver_api_reject_ride(ride_id):
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        return jsonify(reject_driver_ride(_driver_token(), ride_id))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/rides/<ride_id>/arrived", methods=["POST"])
def driver_api_ride_arrived(ride_id):
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        return jsonify(driver_ride_arrived(_driver_token(), ride_id))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/rides/<ride_id>/start", methods=["POST"])
def driver_api_start_ride(ride_id):
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        return jsonify(start_ride(_driver_token(), ride_id))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/rides/<ride_id>/complete", methods=["POST"])
def driver_api_complete_ride(ride_id):
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        return jsonify(complete_driver_ride(_driver_token(), ride_id))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/rides/<ride_id>/cancel", methods=["POST"])
def driver_api_cancel_ride(ride_id):
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        return jsonify(cancel_driver_ride(_driver_token(), ride_id))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/notifications/<notification_id>/read", methods=["POST"])
def driver_api_notification_read(notification_id):
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        return jsonify(mark_notification_read(_driver_token(), notification_id))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/notifications/read-all", methods=["POST"])
def driver_api_notifications_read_all():
    guard = _require_driver_api()
    if guard:
        return guard
    try:
        return jsonify(mark_all_notifications_read(_driver_token()))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/availability", methods=["POST"])
def driver_api_availability():
    guard = _require_driver_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    online = bool(payload.get("online"))
    try:
        return jsonify(set_availability(_driver_token(), online))
    except ApiError as exc:
        return _driver_api_error(exc)


@driver_portal_bp.route("/api/wallet/withdraw", methods=["POST"])
def driver_api_wallet_withdraw():
    guard = _require_driver_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        amount = float(payload.get("amount_ngn") or 0)
        return jsonify(
            withdraw_wallet(
                _driver_token(),
                amount,
                payload.get("bank_name", ""),
                payload.get("account_number", ""),
                payload.get("account_name", ""),
            )
        )
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_amount"}), 400
    except ApiError as exc:
        return _driver_api_error(exc)
