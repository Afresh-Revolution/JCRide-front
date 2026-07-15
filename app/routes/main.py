from flask import Blueprint, flash, get_flashed_messages, jsonify, redirect, render_template, request, session, url_for
from datetime import datetime
import base64
import json
import re
import uuid

from app.services.api_client import (
    ApiError,
    cancel_delivery,
    cancel_ride,
    cancel_scheduled_ride,
    create_scheduled_ride,
    create_support_ticket,
    create_wallet_funding_request,
    estimate_delivery,
    estimate_ride,
    estimate_ride_coords,
    get_current_delivery,
    get_current_ride,
    get_driver_profile,
    get_notification_preferences,
    get_profile,
    get_ride_messages,
    send_ride_message,
    get_rider_data_export,
    get_user_settings,
    get_wallet,
    get_account_policy,
    pay_cancellation_fee,
    unlock_account,
    get_wallet_transactions,
    initialize_paystack,
    list_notifications,
    list_scheduled_rides,
    list_support_tickets,
    login,
    login_with_joscity_fallback,
    mark_all_notifications_read,
    mark_notification_read,
    pause_account,
    rate_driver,
    register,
    create_ride_share_link,
    create_live_chat_session,
    create_saved_location,
    create_trusted_contact,
    delete_saved_location,
    delete_trusted_contact,
    forgot_password,
    get_customer_dashboard_summary,
    get_customer_profile_extras,
    get_nearby_drivers,
    get_referral_info,
    get_support_faq,
    list_customer_rides,
    list_saved_locations,
    list_trusted_contacts,
    reset_password,
    search_rider,
    register_device,
    register_driver,
    request_account_deactivation,
    request_account_deletion,
    request_delivery,
    request_ride,
    request_ride_coords,
    resend_otp,
    ride_call_intent,
    ride_call_accept,
    ride_call_end,
    ride_call_reject,
    ride_call_start,
    ride_call_token,
    ride_calls,
    set_availability,
    start_ride,
    trigger_ride_sos,
    update_notification_preferences,
    update_customer_profile_extras,
    update_profile,
    update_user_settings,
    upload_driver_document,
    verify_otp,
    verify_paystack,
    withdraw_wallet,
)
from app.config import get_public_app_url, get_ws_url
from app.rider_api_transforms import (
    contacts_to_share_ui,
    dashboard_stats_from_api,
    default_ride_tiers,
    faq_from_api,
    nearby_drivers_to_map,
    build_wallet_summary,
    delivery_estimate_to_defaults,
    estimate_to_booking_fields,
    estimate_to_tiers,
    live_area_from_location,
    live_area_map_for_location,
    notifications_to_ui,
    notification_channels_from_api,
    notification_topics_from_api,
    prefs_update_from_ui,
    profile_from_api,
    rewrite_referral_invite_url,
    ride_to_active_trip,
    ride_to_history_trip,
    ride_to_recent_trip,
    ride_to_tracking,
    rider_location_from_rides,
    scheduled_ride_to_ui,
    settings_from_api,
    support_category_slug,
    support_ticket_to_ui,
    tracking_step_for_status,
    wallet_transactions_to_ui,
)
from app.rider_defaults import (
    BIKE_DELIVERY_DEFAULTS,
    BOOK_RIDE_DEFAULTS,
    LIVE_AREA,
    LIVE_TRACKING,
    NOTIFICATION_CHANNELS,
    NOTIFICATION_TOPICS,
    PROFILE_DEFAULTS,
    PROFILE_MENU,
    RECENT_TRIPS,
    RIDE_HISTORY_TRIPS,
    RIDER_NOTIFICATIONS,
    SCHEDULE_CLASS_LABELS,
    SCHEDULE_FARE_RANGES,
    SCHEDULE_FORM,
    SCHEDULE_VEHICLE_CLASSES,
    SETTINGS_DEFAULTS,
    SHARE_RIDE,
    SUPPORT_FAQ,
    TRACKING_FINDING,
    UPCOMING_SCHEDULED_RIDES,
    WALLET_SUMMARY,
    WALLET_TRANSACTIONS,
    build_live_area_map,
    build_route_map,
    build_route_map_from_ride,
)
from app.services.landing_content import load_landing_page
from app.services.navigation_guard import (
    grant_driver_entry,
    grant_rider_entry,
    is_authenticated_driver,
    is_authenticated_rider,
    revoke_driver_entry,
    revoke_rider_entry,
)

main_bp = Blueprint("main", __name__)

DRIVER_SIGNUP_KEY = "driver_signup"
RIDER_SIGNUP_KEY = "rider_signup"
RIDER_NOTIFICATION_STATES_KEY = "rider_notification_states"
RIDER_NOTIFICATION_PREFS_KEY = "rider_notification_prefs"
DRIVER_SIGNUP_STEPS = {
    1: "Personal info",
    2: "Documents",
    3: "OTP verification",
    4: "Submitted",
}

ALLOWED_DOC_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}
MAX_DOC_BYTES = 5 * 1024 * 1024
PASSWORD_SYMBOL_RE = re.compile(r'[!@#$%^&*(),.?":{}|<>\-_+=\[\]\\;/`~]')


def _password_is_valid(password: str) -> bool:
    return len(password) >= 8 and bool(PASSWORD_SYMBOL_RE.search(password))


def _mask_email(email: str) -> str:
    email = email.strip().lower()
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 1:
        masked_local = "*"
    else:
        masked_local = f"{local[0]}***"
    return f"{masked_local}@{domain}"


def _signup_identifier(signup: dict) -> str:
    return (signup.get("email") or signup.get("phone") or "").strip()

PORTAL_ROLES = {
    "rider": "customer",
    "driver": "driver",
}

RIDER_ROLES = frozenset({"customer", "rider"})


def _role_matches_portal(role: str, portal: str) -> bool:
    role = (role or "").strip().lower()
    expected = PORTAL_ROLES.get(portal, "")
    if portal == "rider":
        return role in RIDER_ROLES or role == expected
    return role == expected


def _resolve_login_identifier(phone: str, email: str) -> str:
    phone = phone.strip()
    email = email.strip().lower()
    return email or phone


def _set_driver_portal_session(result: dict, identifier: str = "") -> None:
    """Mirror login state into keys used by the driver portal."""
    user = result.get("user") or {}
    session["driver_token"] = result.get("access_token", session.get("token", ""))
    session["driver_name"] = user.get("full_name") or session.get("name")
    if identifier and "@" in identifier:
        session["driver_email"] = identifier
        session["driver_phone"] = user.get("phone") or session.get("phone") or ""
    elif identifier:
        session["driver_phone"] = identifier
        session["driver_email"] = user.get("email") or session.get("email") or ""
    session.setdefault("driver_online", False)


def _rider_initials(name: str) -> str:
    parts = [part for part in name.split() if part]
    if not parts:
        return "JR"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return f"{parts[0][0]}{parts[-1][0]}".upper()


def _rider_token() -> str | None:
    return session.get("token")


def _referral_for_ui(referral: dict | None) -> dict | None:
    return rewrite_referral_invite_url(referral, base_url=get_public_app_url())


def _jwt_user_id(token: str | None) -> str | None:
    if not token:
        return None
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload))
        return data.get("sub") or data.get("user_id")
    except (ValueError, json.JSONDecodeError, TypeError):
        return None


def _resolved_rider_user_id() -> str | None:
    return session.get("user_id") or _jwt_user_id(_rider_token())


def _safe_rider_api(callable_fn, default=None):
    token = _rider_token()
    if not token:
        return default, False
    try:
        return callable_fn(token), True
    except ApiError:
        return default, False


def _rider_rides_export() -> tuple[list[dict], bool]:
    def _fetch(token):
        payload = list_customer_rides(token, limit=100) or {}
        rides = payload.get("rides") or []
        if rides:
            return rides
        export = get_rider_data_export(token) or {}
        return list(export.get("rides") or [])

    return _safe_rider_api(_fetch, [])


def _sync_rider_wallet_session(wallet: dict | None) -> None:
    if wallet and wallet.get("balance") is not None:
        session["wallet_balance_ngn"] = wallet.get("balance")


def _parse_schedule_time(date_str: str, time_str: str) -> datetime:
    parsed_date = _parse_schedule_date(date_str)
    time_str = (time_str or "08:00 AM").strip()
    for fmt in ("%I:%M %p", "%H:%M"):
        try:
            parsed_time = datetime.strptime(time_str, fmt).time()
            return datetime.combine(parsed_date.date(), parsed_time)
        except ValueError:
            continue
    return parsed_date


def _schedule_reminder_minutes(label: str) -> int:
    digits = re.findall(r"\d+", label or "")
    if digits:
        return max(5, min(int(digits[0]), 1440))
    return 30


def _rider_context() -> dict:
    name = session.get("name") or "Rider"
    has_gps = session.get("rider_lat") is not None and session.get("rider_lng") is not None
    location = session.get("rider_location") if has_gps else "Detecting location…"
    badge = session.get("rider_badge") or "Rider"
    notifications = _notifications_inbox()
    unread_count = sum(1 for item in notifications if item.get("unread"))
    return {
        "rider_name": name,
        "rider_initials": _rider_initials(name),
        "rider_location": location,
        "rider_meta": f"{location} · {badge}",
        "notifications_unread_count": unread_count,
    }


def _profile_context() -> dict:
    profile, ok = _safe_rider_api(get_profile)
    extras = None
    if ok:
        extras, extras_ok = _safe_rider_api(get_customer_profile_extras)
        if not extras_ok:
            extras = None
    if ok:
        mapped = profile_from_api(profile)
        if extras:
            if extras.get("date_of_birth"):
                mapped["dob"] = str(extras["date_of_birth"])
            if extras.get("nin"):
                mapped["nin"] = extras["nin"]
            if extras.get("emergency_contact_name"):
                mapped["emergency_contact_name"] = extras["emergency_contact_name"]
            if extras.get("emergency_contact_phone"):
                mapped["emergency_contact_phone"] = extras["emergency_contact_phone"]
        session["name"] = mapped["full_name"]
        session["email"] = mapped["email"]
        session["phone"] = mapped["phone"]
        session["rider_badge"] = mapped.get("badge") or "Rider"
        return mapped
    return profile_from_api(
        {
            "user": {
                "full_name": session.get("name"),
                "email": session.get("email"),
                "phone": session.get("phone"),
            }
        }
    )


def _clear_stale_requested_ride(token: str | None) -> None:
    """Cancel a leftover `requested` ride so a new booking is not blocked server-side."""
    if not token:
        return
    try:
        current = get_current_ride(token)
        ride = (current or {}).get("ride") or (current or {}).get("data") or current
        if not ride or ride.get("status") != "requested":
            return
        ride_id = ride.get("id") or ride.get("ride_id")
        if ride_id:
            cancel_ride(token, ride_id, reason="Replaced by a new ride request")
    except ApiError:
        pass


def _tracking_page_context() -> dict:
    active = session.get("active_trip") or {}

    def _load_current(token):
        ride = get_current_ride(token)
        if ride:
            return ride.get("ride") or ride.get("data") or ride
        delivery = get_current_delivery(token)
        if delivery:
            return delivery.get("ride") or delivery.get("data") or delivery
        return None

    ride, ok = _safe_rider_api(_load_current)
    if ok and ride:
        active = ride_to_active_trip(ride)
        session["active_trip"] = active
    elif ok:
        # API succeeded and there is no live ride — drop stale session trip state.
        session.pop("active_trip", None)
        active = {}

    tracking, finding = ride_to_tracking(ride if ok else None)
    vehicle_type = active.get("vehicle_type") or "car"
    status = (ride or {}).get("status") if ok and ride else active.get("status")
    driver_ready = status in ("accepted", "driver_assigned", "driver_arrived", "in_progress", "completed")

    if ok and ride:
        tracking["step"] = tracking_step_for_status(status)

    if active.get("pickup"):
        tracking["pickup"] = active["pickup"]
        finding["pickup"] = active["pickup"]
    if active.get("dropoff"):
        tracking["destination"] = active["dropoff"]
        finding["destination"] = active["dropoff"]
    if active.get("fare"):
        finding["fare_estimate"] = active["fare"]
    if active.get("booking_id"):
        tracking["booking_id"] = active["booking_id"]
    if active.get("stops") and not tracking.get("stops"):
        tracking["stops"] = active["stops"]

    route_map = (
        build_route_map_from_ride(
            ride,
            badge_label=tracking.get("status_label", "Live trip"),
            vehicle_type=vehicle_type,
        )
        if ok and ride
        else build_route_map(
            tracking["pickup"],
            tracking["destination"],
            badge_label=tracking.get("status_label", "Live trip"),
            vehicle_type=vehicle_type,
        )
    )
    return {
        "tracking": tracking,
        "finding": finding,
        "route_map": route_map,
        "tracking_live": bool(ok and ride),
        "show_finding": not (ok and ride and driver_ready),
        "ride_id": active.get("ride_id") or ((ride or {}).get("id") if ok else None),
        "ride_status": status,
        "rider_user_id": _resolved_rider_user_id(),
        "ws_url": get_ws_url(),
    }


def _user_api_error(exc: ApiError):
    return jsonify({"error": exc.message}), exc.status_code


def _notifications_inbox() -> list[dict]:
    def _fetch(token):
        payload = list_notifications(token) or {}
        return notifications_to_ui(payload.get("notifications") or [])

    notifications, ok = _safe_rider_api(_fetch, [])
    return notifications if ok else []


def _notification_channels() -> list[dict]:
    def _fetch(token):
        return get_notification_preferences(token)

    prefs, ok = _safe_rider_api(_fetch)
    if ok:
        return notification_channels_from_api(prefs)

    stored = (session.get(RIDER_NOTIFICATION_PREFS_KEY) or {}).get("channels") or {}
    channels = []
    for row in NOTIFICATION_CHANNELS:
        item = dict(row)
        if row["id"] in stored:
            item["enabled"] = bool(stored[row["id"]])
        channels.append(item)
    return channels


def _notification_topics() -> list[dict]:
    def _fetch(token):
        return get_notification_preferences(token)

    prefs, ok = _safe_rider_api(_fetch)
    if ok:
        return notification_topics_from_api(prefs)

    stored = (session.get(RIDER_NOTIFICATION_PREFS_KEY) or {}).get("topics") or {}
    topics = []
    for row in NOTIFICATION_TOPICS:
        item = dict(row)
        if row["id"] in stored:
            item["enabled"] = bool(stored[row["id"]])
        topics.append(item)
    return topics


def _notifications_inbox_meta(notifications: list[dict]) -> dict:
    unread_count = sum(1 for item in notifications if item.get("unread"))
    return {"unread_count": unread_count}


def _require_rider():
    if not session.get("token"):
        flash("Please sign in to access your rider dashboard.", "error")
        return redirect(url_for("main.rider_login_page"))
    return None


def _require_rider_api():
    if not session.get("token"):
        return jsonify({"error": "unauthorized"}), 401
    return None


def _parse_schedule_date(date_str: str) -> datetime:
    date_str = (date_str or "").strip()
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return datetime.now()


def _format_schedule_list_datetime(parsed_date: datetime, time_str: str) -> str:
    time_str = (time_str or "08:00 AM").strip()
    return f"{parsed_date.strftime('%a, %d %b')} · {time_str}"


def _format_schedule_success_when(parsed_date: datetime, time_str: str) -> str:
    time_str = (time_str or "08:00 AM").strip()
    return f"{parsed_date.strftime('%a, %d %b')} at {time_str}"


def _schedule_fare_display(vehicle_class: str) -> str:
    low, high = SCHEDULE_FARE_RANGES.get(vehicle_class, SCHEDULE_FARE_RANGES["comfort"])
    if low == high:
        return low
    return f"{low} – {high}"


def _upcoming_scheduled_rides() -> list[dict]:
    def _fetch(token):
        payload = list_scheduled_rides(token) or {}
        return [scheduled_ride_to_ui(item) for item in payload.get("scheduled_rides") or []]

    rides, ok = _safe_rider_api(_fetch, [])
    if ok:
        return rides
    return list(session.get("rider_scheduled_rides") or [])


def _handle_login(portal: str):
    if portal not in PORTAL_ROLES:
        portal = "rider"

    phone = request.form.get("phone", "").strip() if request.method == "POST" else ""
    email = request.form.get("email", "").strip() if request.method == "POST" else ""
    email_or_phone = request.form.get("email_or_phone", "").strip() if request.method == "POST" else ""
    remember = request.form.get("remember") == "1" if request.method == "POST" else False

    if request.method == "GET":
        message = (request.args.get("message") or "").strip()
        if message:
            flash(message, "error")

    if request.method == "POST":
        get_flashed_messages()
        password = request.form.get("password", "")
        if portal == "driver":
            identifier = email_or_phone.strip()
        else:
            identifier = _resolve_login_identifier(phone, email)
        if not identifier:
            flash(
                "Enter your email address."
                if portal == "rider"
                else "Enter your email or phone number.",
                "error",
            )
        elif not password:
            flash("Enter your password.", "error")
        else:
            try:
                if portal == "driver":
                    result = login(identifier, password)
                else:
                    result = login_with_joscity_fallback(identifier, password)
                user = result.get("user") or {}
                role = user.get("role", "")

                if portal == "driver" and role == "customer":
                    token = result.get("access_token", "")
                    try:
                        get_driver_profile(token)
                    except ApiError as exc:
                        if exc.status_code == 404:
                            if user.get("joscity_user_id"):
                                flash(
                                    "This JosCity account has not completed driver signup. "
                                    "Apply as a driver first - rider JosCity sign-in is not available here.",
                                    "error",
                                )
                            else:
                                flash(
                                    "Your driver application is not complete yet. "
                                    "Continue signup to upload documents and verify your account.",
                                    "error",
                                )
                            _resume_driver_signup_from_login(result, identifier)
                            return redirect(
                                url_for("main.driver_register_page", action="resume")
                            )
                        raise
                    profile = get_profile(token)
                    user = profile.get("user") or {}
                    role = user.get("role", "")
                    result = {
                        "access_token": token,
                        "user": user,
                        "wallet": profile.get("wallet") or result.get("wallet") or {},
                    }

                if not _role_matches_portal(role, portal):
                    account_name = "driver" if role == "driver" else "rider"
                    flash(
                        f"This account is registered as a {account_name}. "
                        f"Please sign in through the {account_name} portal.",
                        "error",
                    )
                else:
                    if portal == "driver":
                        _establish_driver_session(result, identifier, remember=remember)
                        _clear_driver_signup()
                        grant_driver_entry()
                        flash("Signed in successfully.", "success")
                        return redirect(url_for("driver_portal.dashboard"))

                    session["token"] = result.get("access_token", "")
                    session["user_id"] = user.get("id")
                    session["email"] = user.get("email") or (identifier if "@" in identifier else email)
                    session["phone"] = user.get("phone") or (identifier if "@" not in identifier else phone)
                    session["name"] = user.get("full_name")
                    session["role"] = role
                    session["portal"] = portal
                    session["joscity_user_id"] = user.get("joscity_user_id")
                    wallet = result.get("wallet") or {}
                    if wallet.get("balance_ngn") is not None:
                        session["wallet_balance_ngn"] = wallet.get("balance_ngn")
                    session.permanent = remember
                    grant_rider_entry()
                    flash(
                        "Signed in with JosCity."
                        if portal == "rider" and user.get("joscity_user_id")
                        else "Signed in successfully.",
                        "success",
                    )
                    return redirect(url_for("main.user_dashboard"))
            except ApiError as exc:
                flash(exc.message, "error")

    return render_template(
        "auth/login_split.html",
        portal=portal,
        phone=phone,
        email=email,
        email_or_phone=email_or_phone,
        remember=remember,
    )


@main_bp.route("/")
def home():
    return render_template("home.html", landing=load_landing_page())


@main_bp.route("/portals")
def portals_page():
    return render_template("portals.html")


@main_bp.route("/enter/rider", methods=["POST"])
def enter_rider_portal():
    grant_rider_entry()
    if is_authenticated_rider():
        return redirect(url_for("main.user_dashboard"))
    return redirect(url_for("main.rider_login_page"))


@main_bp.route("/enter/driver", methods=["POST"])
def enter_driver_portal():
    grant_driver_entry()
    if is_authenticated_driver():
        return redirect(url_for("driver_portal.dashboard"))
    return redirect(url_for("main.driver_login_page"))


@main_bp.route("/enter/rider/register", methods=["POST"])
def enter_rider_register():
    grant_rider_entry()
    if is_authenticated_rider():
        return redirect(url_for("main.user_dashboard"))
    return redirect(url_for("main.user_register_page"))


@main_bp.route("/enter/driver/register", methods=["POST"])
def enter_driver_register():
    grant_driver_entry()
    if is_authenticated_driver():
        return redirect(url_for("driver_portal.dashboard"))
    return redirect(url_for("main.driver_register_page"))


@main_bp.route("/login", methods=["GET", "POST"])
def login_page():
    portal = request.args.get("portal") or request.form.get("portal") or "rider"
    return _handle_login(portal)


@main_bp.route("/auth/rider-login", methods=["GET", "POST"])
def rider_login_page():
    return _handle_login("rider")


@main_bp.route("/auth/driver-login", methods=["GET", "POST"])
def driver_login_page():
    if request.method == "GET":
        _clear_driver_signup()
    return _handle_login("driver")


def _get_driver_signup() -> dict:
    return dict(session.get(DRIVER_SIGNUP_KEY) or {})


def _driver_signup_resume_step(signup: dict) -> int:
    if signup.get("documents"):
        return 3 if not signup.get("email_verified") else 4
    if signup.get("registered"):
        return 2 if signup.get("email_verified") else 3
    return 1


def _save_driver_signup(data: dict) -> None:
    """Persist only wizard state required to finish signup - no personal details."""
    allowed = {
        "step",
        "access_token",
        "user_id",
        "email",
        "email_verified",
        "registered",
        "documents",
        "vehicle_type",
    }
    session[DRIVER_SIGNUP_KEY] = {key: data[key] for key in allowed if key in data}
    session.modified = True


def _clear_driver_signup() -> None:
    session.pop(DRIVER_SIGNUP_KEY, None)


def _driver_signup_step() -> int:
    step = _get_driver_signup().get("step", 1)
    try:
        step = int(step)
    except (TypeError, ValueError):
        step = 1
    return max(1, min(step, 4))


def _driver_login_identifier(signup: dict) -> str:
    return _signup_identifier(signup)


def _driver_account_verified(user: dict) -> bool:
    return bool(user.get("email_verified") or user.get("phone_verified"))


def _store_driver_signup_auth(signup: dict, result: dict) -> None:
    user = result.get("user") or {}
    signup["access_token"] = result.get("access_token", "")
    signup["user_id"] = user.get("id")
    signup["registered"] = True
    signup["email_verified"] = _driver_account_verified(user)
    signup.pop("password", None)


def _submit_driver_application(signup: dict, token: str) -> dict:
    documents = signup.get("documents") or {}
    license_url = documents.get("driver_license_url", "")
    papers_url = documents.get("vehicle_papers_url", "")
    nin_url = documents.get("nin_document_url", "")
    if not all(len(url) >= 8 for url in (license_url, papers_url, nin_url)):
        raise ApiError("Upload all required documents before submitting.", 400)
    register_driver(
        token,
        {
            "driver_license_url": license_url,
            "vehicle_papers_url": papers_url,
            "nin_document_url": nin_url,
            "vehicle_category": signup.get("vehicle_type") or "car",
        },
    )
    profile = get_profile(token)
    user = profile.get("user") or {}
    if user.get("role") != "driver":
        raise ApiError(
            "Driver application could not be completed. Please try again or contact support.",
            502,
        )
    return profile


def _resume_driver_signup_from_login(result: dict, identifier: str) -> None:
    user = result.get("user") or {}
    signup = {
        "access_token": result.get("access_token", ""),
        "user_id": user.get("id"),
        "email": user.get("email") or (identifier if "@" in identifier else ""),
        "email_verified": _driver_account_verified(user),
        "registered": True,
    }
    signup["step"] = _driver_signup_resume_step(signup)
    _save_driver_signup(signup)


def _establish_driver_session(result: dict, identifier: str = "", remember: bool = False) -> None:
    user = result.get("user") or {}
    role = user.get("role", "")
    session["token"] = result.get("access_token", "")
    session["user_id"] = user.get("id")
    session["email"] = user.get("email") or (identifier if "@" in identifier else "")
    session["phone"] = user.get("phone") or (identifier if "@" not in identifier else "")
    session["name"] = user.get("full_name")
    session["role"] = role
    session["portal"] = "driver"
    session.pop("joscity_user_id", None)
    wallet = result.get("wallet") or {}
    if wallet.get("balance_ngn") is not None:
        session["wallet_balance_ngn"] = wallet.get("balance_ngn")
    session.permanent = remember
    _set_driver_portal_session(result, identifier)


def _validate_upload(file_storage) -> str | None:
    if not file_storage or not file_storage.filename:
        return "Each document is required."
    if file_storage.content_type not in ALLOWED_DOC_TYPES:
        return "Documents must be PDF, JPG, or PNG (max 5MB)."
    file_storage.stream.seek(0, 2)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if size > MAX_DOC_BYTES:
        return "Each document must be 5MB or smaller."
    return None


@main_bp.route("/auth/driver-register", methods=["GET", "POST"])
def driver_register_page():
    signup = _get_driver_signup()
    step = _driver_signup_step()

    if request.method == "GET":
        action = request.args.get("action")
        if action == "restart":
            _clear_driver_signup()
            return redirect(url_for("main.driver_register_page"))
        if step == 1 and action not in ("back", "resume"):
            _clear_driver_signup()
            signup = {}
            step = 1
        if action == "back" and step > 1:
            signup["step"] = step - 1
            _save_driver_signup(signup)
            return redirect(url_for("main.driver_register_page"))
        if action == "dashboard" and step == 4:
            token = signup.get("access_token")
            if token:
                try:
                    profile = get_profile(token)
                    user = profile.get("user") or {}
                    if user.get("role") != "driver":
                        flash(
                            "Your driver application is not complete yet. Continue signup.",
                            "error",
                        )
                        signup["step"] = _driver_signup_resume_step(signup)
                        _save_driver_signup(signup)
                        return redirect(url_for("main.driver_register_page", action="resume"))
                    _establish_driver_session(
                        {
                            "access_token": token,
                            "user": user,
                            "wallet": profile.get("wallet") or {},
                        },
                        signup.get("email", ""),
                    )
                    _clear_driver_signup()
                    return redirect(url_for("driver_portal.dashboard"))
                except ApiError as exc:
                    flash(exc.message, "error")
            flash("Complete verification before continuing.", "error")
            signup["step"] = 3
            _save_driver_signup(signup)
            return redirect(url_for("main.driver_register_page"))

    if request.method == "POST":
        posted_step = request.form.get("step", type=int) or step
        action = request.form.get("action", "continue")

        if action == "resend" and posted_step == 3:
            identifier = _driver_login_identifier(signup)
            if not identifier:
                flash("Start your application again.", "error")
                return redirect(url_for("main.driver_register_page"))
            try:
                resend_otp(identifier)
                flash("A new verification code was sent to your email.", "success")
            except ApiError as exc:
                flash(exc.message, "error")
            signup["step"] = 3
            _save_driver_signup(signup)
            return redirect(url_for("main.driver_register_page"))

        if posted_step == 1:
            full_name = request.form.get("full_name", "").strip()
            phone = request.form.get("phone", "").strip()
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")
            confirm_password = request.form.get("confirm_password", "")
            vehicle_type = request.form.get("vehicle_type", "car").strip().lower()
            if vehicle_type not in {"car", "bike"}:
                vehicle_type = "car"
            signup = _get_driver_signup()
            signup["vehicle_type"] = vehicle_type
            _save_driver_signup(signup)
            if len(full_name) < 2:
                flash("Enter your full name.", "error")
            elif len(phone) < 6:
                flash("Enter a valid phone number.", "error")
            elif not email:
                flash("Enter your email address.", "error")
            elif len(password) < 8:
                flash("Password must be at least 8 characters.", "error")
            elif password != confirm_password:
                flash("Passwords do not match.", "error")
            else:
                signup = _get_driver_signup()
                if signup.get("registered") and signup.get("access_token"):
                    signup["email"] = email
                    signup["vehicle_type"] = vehicle_type
                    signup["step"] = 2
                    _save_driver_signup(signup)
                    flash("Continue your driver application.", "success")
                    return redirect(url_for("main.driver_register_page"))

                try:
                    result = register(
                        full_name,
                        phone,
                        email,
                        password,
                        confirm_password=confirm_password,
                    )
                    signup = {
                        "step": 2,
                        "email": email,
                        "vehicle_type": vehicle_type,
                    }
                    _store_driver_signup_auth(signup, result)
                    delivery = result.get("otp_delivery")
                    if delivery == "not_configured":
                        flash(
                            "Account created, but email delivery is not configured. "
                            "Contact support for your verification code.",
                            "error",
                        )
                    elif delivery == "already_verified":
                        flash("Account verified. Continue to upload your documents.", "success")
                    elif delivery != "sent":
                        flash("Account created. Continue to upload your documents.", "success")
                except ApiError as exc:
                    if exc.status_code == 409 and "already registered as a driver" in exc.message.lower():
                        flash(exc.message, "error")
                    elif exc.status_code == 409:
                        try:
                            result = login(email, password)
                            user = result.get("user") or {}
                            token = result.get("access_token", "")
                            if user.get("role") == "driver":
                                flash(
                                    "This account is already registered as a driver. Sign in instead.",
                                    "error",
                                )
                                return redirect(url_for("main.driver_login_page"))
                            try:
                                get_driver_profile(token)
                            except ApiError as driver_exc:
                                if driver_exc.status_code == 404:
                                    _resume_driver_signup_from_login(result, email)
                                    flash("Continue your driver application.", "success")
                                    return redirect(
                                        url_for("main.driver_register_page", action="resume")
                                    )
                                raise
                            flash(
                                "This account is already registered as a driver. Sign in instead.",
                                "error",
                            )
                            return redirect(url_for("main.driver_login_page"))
                        except ApiError:
                            flash(
                                "That email or phone is already registered. "
                                "Sign in with your existing password or use a different email.",
                                "error",
                            )
                    else:
                        flash(exc.message, "error")
                    return redirect(url_for("main.driver_register_page"))

                _save_driver_signup(signup)
                return redirect(url_for("main.driver_register_page"))

        elif posted_step == 2:
            license_file = request.files.get("driver_license")
            papers_file = request.files.get("vehicle_papers")
            nin_file = request.files.get("nin_document")

            doc_error = None
            for label, doc in (
                ("Driver license", license_file),
                ("Vehicle papers", papers_file),
                ("National ID / NIN", nin_file),
            ):
                doc_error = _validate_upload(doc)
                if doc_error:
                    flash(f"{label}: {doc_error}", "error")
                    break

            if doc_error is None:
                try:
                    token = signup.get("access_token")
                    if not token:
                        flash("Complete step 1 before uploading documents.", "error")
                        signup["step"] = 1
                        _save_driver_signup(signup)
                        return redirect(url_for("main.driver_register_page"))

                    uploads = {
                        "driver_license_url": upload_driver_document(
                            token, "license", license_file
                        ),
                        "vehicle_papers_url": upload_driver_document(
                            token, "vehicle_papers", papers_file
                        ),
                        "nin_document_url": upload_driver_document(
                            token, "nin", nin_file
                        ),
                    }
                    signup["documents"] = {
                        key: value.get("file_url", "")
                        for key, value in uploads.items()
                    }
                    token = signup.get("access_token")
                    if signup.get("email_verified") and token:
                        try:
                            _submit_driver_application(signup, token)
                            signup["step"] = 4
                            _save_driver_signup(signup)
                            flash("Application submitted successfully.", "success")
                            return redirect(url_for("main.driver_register_page"))
                        except ApiError as exc:
                            flash(exc.message, "error")
                            signup["step"] = 2
                            _save_driver_signup(signup)
                            return redirect(url_for("main.driver_register_page"))
                    signup["step"] = 3
                    _save_driver_signup(signup)
                    flash(
                        "Documents uploaded. Enter the verification code sent to your email.",
                        "success",
                    )
                    return redirect(url_for("main.driver_register_page"))
                except ApiError as exc:
                    flash(exc.message, "error")

        elif posted_step == 3:
            code = request.form.get("otp_code", "").replace(" ", "").strip()
            identifier = _driver_login_identifier(signup)
            if len(code) < 6:
                flash("Enter the 6-digit verification code.", "error")
            elif not identifier:
                flash("Start your application again.", "error")
                _clear_driver_signup()
                return redirect(url_for("main.driver_register_page"))
            else:
                try:
                    verify_result = verify_otp(identifier, code)
                    token = verify_result.get("access_token") or signup.get("access_token")
                    user = verify_result.get("user") or {}
                    signup["access_token"] = token
                    signup["user_id"] = user.get("id") or signup.get("user_id")
                    signup["email_verified"] = _driver_account_verified(user)
                    _submit_driver_application(signup, token)
                    signup["step"] = 4
                    _save_driver_signup(signup)
                    flash("Application submitted successfully.", "success")
                    return redirect(url_for("main.driver_register_page"))
                except ApiError as exc:
                    flash(exc.message, "error")
                    signup["step"] = 3
                    _save_driver_signup(signup)
                    return redirect(url_for("main.driver_register_page"))

        step = _driver_signup_step()
        signup = _get_driver_signup()

    return render_template(
        "auth/driver_register.html",
        step=step,
        total_steps=4,
        step_label=DRIVER_SIGNUP_STEPS.get(step, ""),
        signup=signup,
    )


@main_bp.route("/forgot-password", methods=["GET", "POST"])
def forgot_password_page():
    if request.method == "POST":
        email_or_phone = request.form.get("email_or_phone", "").strip()
        step = request.form.get("step", "request")
        if step == "reset":
            try:
                reset_password(
                    email_or_phone,
                    request.form.get("code", "").strip(),
                    request.form.get("new_password", ""),
                    request.form.get("confirm_password", ""),
                )
                flash("Password updated. You can sign in now.", "success")
                return redirect(url_for("main.rider_login_page"))
            except ApiError as exc:
                flash(exc.message, "error")
        else:
            try:
                forgot_password(email_or_phone)
                flash("Reset code sent to your email.", "success")
                return render_template(
                    "auth/forgot_password.html",
                    email_or_phone=email_or_phone,
                    step="reset",
                )
            except ApiError as exc:
                flash(exc.message, "error")
        return render_template(
            "auth/forgot_password.html",
            email_or_phone=email_or_phone,
            step=step,
        )
    return render_template("auth/forgot_password.html", step="request")


def _get_rider_signup() -> dict:
    return dict(session.get(RIDER_SIGNUP_KEY) or {})


def _save_rider_signup(data: dict) -> None:
    session[RIDER_SIGNUP_KEY] = data
    session.modified = True


def _clear_rider_signup() -> None:
    session.pop(RIDER_SIGNUP_KEY, None)


def _rider_signup_step() -> int:
    step = _get_rider_signup().get("step", 1)
    try:
        step = int(step)
    except (TypeError, ValueError):
        step = 1
    return max(1, min(step, 3))


@main_bp.route("/auth/user-register", methods=["GET", "POST"])
@main_bp.route("/register", methods=["GET", "POST"], endpoint="register_page")
def user_register_page():
    signup = _get_rider_signup()
    step = _rider_signup_step()

    if request.method == "GET":
        role = request.args.get("role")
        if role == "driver":
            return redirect(url_for("main.driver_register_page"))
        action = request.args.get("action")
        if action == "restart":
            _clear_rider_signup()
            return redirect(url_for("main.user_register_page"))
        if action == "back" and step > 1:
            signup["step"] = step - 1
            _save_rider_signup(signup)
            return redirect(url_for("main.user_register_page"))
        ref = request.args.get("ref")
        if ref:
            signup["referral_code"] = ref.strip().upper()
            _save_rider_signup(signup)

    if request.method == "POST":
        posted_step = request.form.get("step", type=int) or step
        action = request.form.get("action", "continue")

        if action == "resend" and posted_step == 3:
            identifier = _signup_identifier(signup)
            if not identifier:
                flash("Start your registration again.", "error")
                return redirect(url_for("main.user_register_page"))
            try:
                resend_otp(identifier)
                flash("A new verification code was sent to your email.", "success")
            except ApiError as exc:
                flash(exc.message, "error")
            signup["step"] = 3
            _save_rider_signup(signup)
            return redirect(url_for("main.user_register_page"))

        if posted_step == 1:
            full_name = request.form.get("full_name", "").strip()
            phone = request.form.get("phone", "").strip()
            email = request.form.get("email", "").strip().lower()
            if len(full_name) < 2:
                flash("Enter your full name.", "error")
            elif len(phone) < 6:
                flash("Enter a valid phone number.", "error")
            elif not email:
                flash("Enter your email address.", "error")
            else:
                previous_email = signup.get("email")
                previous_phone = signup.get("phone")
                signup.update(
                    {
                        "step": 2,
                        "full_name": full_name,
                        "phone": phone,
                        "email": email,
                    }
                )
                if email != previous_email or phone != previous_phone:
                    signup.pop("access_token", None)
                    signup.pop("registered", None)
                _save_rider_signup(signup)
                return redirect(url_for("main.user_register_page"))

        elif posted_step == 2:
            password = request.form.get("password", "")
            confirm_password = request.form.get("confirm_password", "")
            if not _password_is_valid(password):
                flash("Password must be at least 8 characters and include one symbol.", "error")
            elif password != confirm_password:
                flash("Passwords do not match.", "error")
            else:
                signup["password"] = password
                if not signup.get("registered"):
                    try:
                        result = register(
                            signup["full_name"],
                            signup["phone"],
                            signup["email"],
                            password,
                            referral_code=signup.get("referral_code"),
                        )
                        signup["access_token"] = result.get("access_token", "")
                        user = result.get("user") or {}
                        signup["user_id"] = user.get("id")
                        signup["registered"] = True
                        signup.pop("password", None)
                        delivery = result.get("otp_delivery")
                        if delivery == "not_configured":
                            flash(
                                "Account created, but email delivery is not configured. "
                                "Contact support for your verification code.",
                                "error",
                            )
                        else:
                            flash("Check your email for a 6-digit verification code.", "success")
                    except ApiError as exc:
                        flash(exc.message, "error")
                        _save_rider_signup(signup)
                        return redirect(url_for("main.user_register_page"))
                signup["step"] = 3
                _save_rider_signup(signup)
                return redirect(url_for("main.user_register_page"))

        elif posted_step == 3:
            code = request.form.get("otp_code", "").replace(" ", "").strip()
            identifier = _signup_identifier(signup)
            if len(code) < 6:
                flash("Enter the full 6-digit verification code.", "error")
            elif not identifier:
                flash("Start your registration again.", "error")
                _clear_rider_signup()
                return redirect(url_for("main.user_register_page"))
            else:
                try:
                    result = verify_otp(identifier, code)
                    user = result.get("user") or {}
                    token = result.get("access_token", "")
                    session["token"] = token
                    session["user_id"] = user.get("id") or signup.get("user_id")
                    session["email"] = user.get("email") or signup.get("email")
                    session["phone"] = user.get("phone") or signup.get("phone")
                    session["name"] = user.get("full_name") or signup.get("full_name")
                    session["role"] = user.get("role", "customer")
                    session["portal"] = "rider"
                    grant_rider_entry()
                    _clear_rider_signup()
                    flash("Welcome to JosRide! Your account is ready.", "success")
                    return redirect(url_for("main.user_dashboard"))
                except ApiError as exc:
                    flash(exc.message, "error")

        step = _rider_signup_step()
        signup = _get_rider_signup()

    masked_contact = _mask_email(signup.get("email", "")) if signup.get("email") else ""
    return render_template(
        "auth/user_register.html",
        step=step,
        total_steps=3,
        signup=signup,
        masked_contact=masked_contact,
    )


@main_bp.route("/user/dashboard")
def user_dashboard():
    guard = _require_rider()
    if guard:
        return guard

    has_gps = session.get("rider_lat") is not None and session.get("rider_lng") is not None
    display_location = session.get("rider_location") if has_gps else "Detecting location…"
    summary, summary_ok = _safe_rider_api(get_customer_dashboard_summary)
    stats = dashboard_stats_from_api((summary or {}).get("stats"))
    stats["location"] = {"value": display_location}
    account_policy = (summary or {}).get("account_policy") or {} if summary_ok else {}
    referral = _referral_for_ui((summary or {}).get("referral") if summary_ok else None)
    recent_rides = (summary or {}).get("recent_rides") or [] if summary_ok else []
    recent_trips = [ride_to_recent_trip(item) for item in recent_rides[:3]]
    live_area = live_area_from_location(display_location)
    map_config = live_area_map_for_location(display_location)
    map_config["location_label"] = display_location
    map_config["live_drivers_api"] = True
    map_config["avg_pickup_minutes"] = 4
    rider_ctx = _rider_context()
    return render_template(
        "user/dashboard.html",
        active_page="dashboard",
        stats=stats,
        live_area=live_area,
        live_area_map=map_config,
        recent_trips=recent_trips,
        referral=referral,
        account_policy=account_policy,
        api_connected={
            "dashboard": summary_ok,
            "live_drivers": True,
            "referral": bool(referral),
        },
        **rider_ctx,
    )


@main_bp.route("/user/book-ride", methods=["GET", "POST"])
@main_bp.route("/ride", methods=["GET", "POST"], endpoint="ride_page")
def user_book_ride():
    guard = _require_rider()
    if guard:
        return guard

    booking = {
        "pickup": "",
        "dropoff": "",
        "distance": "-",
        "duration": "-",
        "est_fare": "-",
    }
    ride_tiers = default_ride_tiers()
    token = _rider_token()

    if request.method == "POST":
        pickup = request.form.get("pickup", "").strip()
        dropoff = request.form.get("dropoff", "").strip()
        tier = request.form.get("tier", "economy")
        vehicle_category = request.form.get("vehicle_category", "car").strip().lower() or "car"
        pickup_lat = request.form.get("pickup_lat", type=float)
        pickup_lng = request.form.get("pickup_lng", type=float)
        dest_lat = request.form.get("destination_lat", type=float)
        dest_lng = request.form.get("destination_lng", type=float)
        stop_addresses = request.form.getlist("stop_address")
        stop_lats = request.form.getlist("stop_lat")
        stop_lngs = request.form.getlist("stop_lng")
        stops = []
        for idx, address in enumerate(stop_addresses):
            address = address.strip()
            if not address:
                continue
            try:
                stops.append(
                    {
                        "address": address,
                        "lat": float(stop_lats[idx]),
                        "lng": float(stop_lngs[idx]),
                    }
                )
            except (TypeError, ValueError, IndexError):
                continue

        if not pickup or not dropoff:
            flash("Enter both pickup and destination.", "error")
            return redirect(url_for("main.user_book_ride"))
        if None in (pickup_lat, pickup_lng, dest_lat, dest_lng):
            flash("Select locations from the suggestions so we can route your trip.", "error")
            return redirect(url_for("main.user_book_ride"))

        try:
            _clear_stale_requested_ride(token)
            if stops:
                result = request_ride_coords(
                    token,
                    pickup,
                    dropoff,
                    pickup_lat,
                    pickup_lng,
                    dest_lat,
                    dest_lng,
                    tier=tier,
                    stops=stops,
                    vehicle_category=vehicle_category,
                )
            else:
                result = request_ride_coords(
                    token,
                    pickup,
                    dropoff,
                    pickup_lat,
                    pickup_lng,
                    dest_lat,
                    dest_lng,
                    tier=tier,
                    vehicle_category=vehicle_category,
                )
            ride = (result or {}).get("ride") or result or {}
            session["active_trip"] = ride_to_active_trip(ride)
            drivers_notified = (result or {}).get("drivers_notified")
            if drivers_notified == 0:
                flash(
                    "Ride requested — waiting for nearby drivers. We'll notify you when one accepts.",
                    "success",
                )
            else:
                flash(f"Ride requested ({tier}) - waiting for a driver.", "success")
        except ApiError as exc:
            session["active_trip"] = {
                "pickup": pickup,
                "dropoff": dropoff,
                "tier": tier,
                "vehicle_type": "car",
            }
            flash(exc.message, "error")
        return redirect(url_for("main.user_live_tracking", reset=1))

    empty_map = {
        "pickup": None,
        "dropoff": None,
        "route": [],
        "drivers": [],
        "map_zoom": 12,
        "pickup_label": "",
        "dropoff_label": "",
        "badge_label": "Enter pickup & destination",
        "map_center": {"lat": 6.5244, "lng": 3.3792},
    }

    return render_template(
        "user/book_ride.html",
        active_page="book_ride",
        booking=booking,
        ride_tiers=ride_tiers,
        route_map=empty_map,
        **_rider_context(),
    )


@main_bp.route("/user/bike-delivery", methods=["GET", "POST"])
def user_bike_delivery():
    guard = _require_rider()
    if guard:
        return guard

    delivery = {
        "pickup": "",
        "dropoff": "",
        "package_notes": "",
        "recipient_name": "",
        "recipient_phone": "",
        "distance": "-",
        "eta": "-",
        "fare": "-",
        "fare_num": 0,
        "insurance_cap": "-",
        "pickup_eta": "-",
    }
    token = _rider_token()

    if request.method == "POST":
        pickup = request.form.get("pickup", "").strip()
        dropoff = request.form.get("dropoff", "").strip()
        package_notes = request.form.get("package_notes", "").strip()
        recipient_name = request.form.get("recipient_name", "").strip()
        recipient_phone = request.form.get("recipient_phone", "").strip()
        delivery.update({
            "pickup": pickup,
            "dropoff": dropoff,
            "package_notes": package_notes,
            "recipient_name": recipient_name,
            "recipient_phone": recipient_phone,
        })

        if not pickup or not dropoff:
            flash("Enter both pickup and drop-off locations.", "error")
        elif not recipient_name or not recipient_phone:
            flash("Enter recipient name and phone number.", "error")
        else:
            try:
                result = request_delivery(
                    token,
                    pickup,
                    dropoff,
                    package_notes or "Package delivery",
                    recipient_name,
                    recipient_phone,
                )
                ride = (result or {}).get("delivery") or result or {}
                session["active_trip"] = ride_to_active_trip(ride)
                flash("Bike delivery requested - courier on the way.", "success")
            except ApiError as exc:
                session["active_trip"] = {
                    "pickup": pickup,
                    "dropoff": dropoff,
                    "fare": delivery["fare"],
                    "vehicle_type": "bike",
                }
                flash(exc.message, "error")
            return redirect(url_for("main.user_live_tracking", reset=1))

    if token and delivery["pickup"] and delivery["dropoff"]:
        try:
            estimate = estimate_delivery(token, delivery["pickup"], delivery["dropoff"])
            delivery.update(
                delivery_estimate_to_defaults(estimate, delivery["pickup"], delivery["dropoff"])
            )
        except ApiError:
            pass

    return render_template(
        "user/bike_delivery.html",
        active_page="bike_delivery",
        delivery=delivery,
        route_map=build_route_map(
            delivery["pickup"],
            delivery["dropoff"],
            badge_label="Pickup - Drop-off · Bike courier",
            vehicle_type="bike",
        ),
        **_rider_context(),
    )


@main_bp.route("/user/schedule-ride", methods=["GET", "POST"])
def user_schedule_ride():
    guard = _require_rider()
    if guard:
        return guard

    if request.args.get("dismiss") == "1":
        session.pop("schedule_success", None)
        return redirect(url_for("main.user_schedule_ride"))

    schedule_form = dict(SCHEDULE_FORM)
    vehicle_classes = [dict(item) for item in SCHEDULE_VEHICLE_CLASSES]

    if request.method == "POST":
        pickup = request.form.get("pickup", "").strip()
        destination = request.form.get("destination", "").strip()
        date_str = request.form.get("date", "").strip()
        time_str = request.form.get("time", "").strip()
        vehicle_class = request.form.get("vehicle_class", "comfort")
        repeat = request.form.get("repeat", "Once")
        reminder = request.form.get("reminder", "30 min before")

        schedule_form.update({
            "pickup": pickup,
            "destination": destination,
            "date": date_str or schedule_form["date"],
            "time": time_str or schedule_form["time"],
            "repeat": repeat,
            "reminder": reminder,
            "vehicle_class": vehicle_class,
        })
        fare_low, fare_high = SCHEDULE_FARE_RANGES.get(
            vehicle_class, SCHEDULE_FARE_RANGES["comfort"]
        )
        schedule_form["fare_low"] = fare_low
        schedule_form["fare_high"] = fare_high

        for item in vehicle_classes:
            item["selected"] = item["id"] == vehicle_class

        if not pickup or not destination:
            flash("Enter both pickup and destination.", "error")
        else:
            token = _rider_token()
            scheduled_for = _parse_schedule_time(
                date_str or schedule_form["date"],
                time_str or schedule_form["time"],
            )
            from app.rider_defaults import resolve_location_coords
            from app.rider_api_transforms import infer_city

            pickup_coords = resolve_location_coords(pickup)
            dest_coords = resolve_location_coords(destination)
            api_ok = False
            try:
                create_scheduled_ride(
                    token,
                    {
                        "pickup_address": pickup,
                        "pickup_lat": pickup_coords["lat"],
                        "pickup_lng": pickup_coords["lng"],
                        "destination_address": destination,
                        "destination_lat": dest_coords["lat"],
                        "destination_lng": dest_coords["lng"],
                        "city": infer_city(pickup or destination),
                        "service_tier": vehicle_class,
                        "scheduled_for": scheduled_for.isoformat(),
                        "reminder_minutes_before": _schedule_reminder_minutes(reminder),
                    },
                )
                api_ok = True
            except ApiError as exc:
                flash(exc.message, "error")

            if api_ok:
                parsed_date = _parse_schedule_date(date_str or schedule_form["date"])
                class_label = SCHEDULE_CLASS_LABELS.get(vehicle_class, "Comfort")
                session["schedule_success"] = {
                    "when": _format_schedule_success_when(
                        parsed_date, time_str or schedule_form["time"]
                    ),
                    "class": class_label,
                    "reminder": reminder,
                }
                return redirect(url_for("main.user_schedule_ride"))

    upcoming_rides = _upcoming_scheduled_rides()
    return render_template(
        "user/schedule_ride.html",
        active_page="schedule_ride",
        vehicle_classes=vehicle_classes,
        schedule_form=schedule_form,
        upcoming_rides=upcoming_rides,
        upcoming_count=len(upcoming_rides),
        schedule_success=session.get("schedule_success"),
        **_rider_context(),
    )


@main_bp.route("/user/live-tracking")
def user_live_tracking():
    guard = _require_rider()
    if guard:
        return guard
    context = _tracking_page_context()
    # Confirmed no live ride (API ok, empty) — leave tracking immediately.
    if not context.get("tracking_live") and not context.get("ride_id"):
        flash("No active trip. Book a new ride when you are ready.", "info")
        return redirect(url_for("main.user_book_ride"))
    return render_template(
        "user/live_tracking.html",
        active_page="live_tracking",
        **context,
        **_rider_context(),
    )


@main_bp.route("/user/live-tracking/cancel", methods=["GET", "POST"])
def user_cancel_ride_request():
    guard = _require_rider()
    if guard:
        return guard
    active = session.get("active_trip") or {}
    ride_id = active.get("ride_id")
    token = _rider_token()
    payload = request.get_json(silent=True) if request.method == "POST" else {}
    reason = (payload or {}).get("reason")
    reason_code = (payload or {}).get("reason_code")
    if token and ride_id:
        try:
            if active.get("request_type") == "delivery" or active.get("vehicle_type") == "bike":
                result = cancel_delivery(token, ride_id, reason=reason, reason_code=reason_code)
            else:
                result = cancel_ride(token, ride_id, reason=reason, reason_code=reason_code)
            session.pop("active_trip", None)
            if request.method == "POST" or request.headers.get("Accept", "").find("application/json") >= 0:
                return jsonify(result)
            flash(result.get("message") or "Ride request cancelled.", "info")
            return redirect(url_for("main.user_dashboard"))
        except ApiError as exc:
            if request.method == "POST" or request.headers.get("Accept", "").find("application/json") >= 0:
                return _user_api_error(exc)
            flash(exc.message, "error")
            return redirect(url_for("main.user_live_tracking"))
    session.pop("active_trip", None)
    if request.method == "POST":
        return jsonify({"message": "Ride request cancelled."})
    flash("Ride request cancelled.", "info")
    return redirect(url_for("main.user_dashboard"))


@main_bp.route("/user/api/rides/<ride_id>/cancel", methods=["POST"])
def user_api_cancel_ride(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    active = session.get("active_trip") or {}
    try:
        if active.get("request_type") == "delivery" or active.get("vehicle_type") == "bike":
            result = cancel_delivery(
                _rider_token(),
                ride_id,
                reason=payload.get("reason"),
                reason_code=payload.get("reason_code"),
            )
        else:
            result = cancel_ride(
                _rider_token(),
                ride_id,
                reason=payload.get("reason"),
                reason_code=payload.get("reason_code"),
            )
        session.pop("active_trip", None)
        return jsonify(result)
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/live-tracking/share")
def user_share_ride():
    guard = _require_rider()
    if guard:
        return guard
    share = {
        "contacts": [],
        "share_message": "",
        "share_url": "",
    }
    rider_name = session.get("name") or "Rider"
    active = session.get("active_trip") or {}
    ride_id = active.get("ride_id")
    token = _rider_token()

    contacts_data, contacts_ok = _safe_rider_api(list_trusted_contacts, [])
    if contacts_ok and contacts_data:
        share["contacts"] = contacts_to_share_ui(contacts_data)

    share_url = ""
    if token and ride_id:
        try:
            link = create_ride_share_link(token, ride_id)
            share_url = link.get("share_url")
            share["share_message"] = (
                f"I'm sharing my JosRide trip with you. Track live: {share_url}"
            )
        except ApiError:
            pass

    share["share_url"] = share_url
    tracking, _ = ride_to_tracking(None)
    ride, ride_ok = _safe_rider_api(lambda t: get_current_ride(t) or get_current_delivery(t))
    if ride_ok and ride:
        tracking, _ = ride_to_tracking(ride)
    elif active.get("booking_id"):
        tracking["booking_id"] = active["booking_id"]
    return render_template(
        "user/share_ride.html",
        active_page="live_tracking",
        tracking=tracking,
        share=share,
        **_rider_context(),
    )


@main_bp.route("/user/ride-history")
def user_ride_history():
    guard = _require_rider()
    if guard:
        return guard
    rides, ok = _rider_rides_export()
    history_trips = (
        [ride_to_history_trip(item) for item in rides]
        if ok and rides
        else []
    )
    return render_template(
        "user/ride_history.html",
        active_page="ride_history",
        history_trips=history_trips,
        api_connected=ok,
        **_rider_context(),
    )


@main_bp.route("/user/wallet")
def user_wallet():
    guard = _require_rider()
    if guard:
        return guard
    wallet_data, wallet_ok = _safe_rider_api(get_wallet)
    policy_data, policy_ok = _safe_rider_api(get_account_policy)
    tx_data, tx_ok = _safe_rider_api(lambda token: get_wallet_transactions(token, limit=20))
    if wallet_ok:
        _sync_rider_wallet_session(wallet_data)
    wallet = build_wallet_summary(wallet_data if wallet_ok else None)
    transactions = (
        wallet_transactions_to_ui((tx_data or {}).get("transactions") or [])
        if tx_ok
        else []
    )
    return render_template(
        "user/wallet.html",
        active_page="wallet",
        wallet=wallet,
        transactions=transactions,
        account_policy=policy_data if policy_ok else {},
        api_connected=wallet_ok,
        user_email=session.get("email") or "",
        **_rider_context(),
    )


@main_bp.route("/user/profile", methods=["GET", "POST"])
def user_profile():
    guard = _require_rider()
    if guard:
        return guard
    profile = _profile_context()
    if request.method == "POST":
        payload = {
            "full_name": request.form.get("full_name", profile["full_name"]).strip(),
            "email": request.form.get("email", profile["email"]).strip(),
            "phone": request.form.get("phone", profile["phone"]).strip(),
        }
        dob = request.form.get("dob", "").strip()
        extras_payload = {}
        if dob:
            extras_payload["date_of_birth"] = dob
        ec_name = request.form.get("emergency_contact_name", "").strip()
        ec_phone = request.form.get("emergency_contact_phone", "").strip()
        if ec_name:
            extras_payload["emergency_contact_name"] = ec_name
        if ec_phone:
            extras_payload["emergency_contact_phone"] = ec_phone
        nin = request.form.get("nin", "").strip()
        if nin:
            extras_payload["nin"] = nin
        token = _rider_token()
        try:
            update_profile(token, payload)
            if extras_payload:
                update_customer_profile_extras(token, extras_payload)
            session["name"] = payload["full_name"]
            session["email"] = payload["email"]
            session["phone"] = payload["phone"]
            flash("Profile updated.", "success")
        except ApiError as exc:
            flash(exc.message, "error")
        return redirect(url_for("main.user_profile"))
    return render_template(
        "user/profile.html",
        active_page="profile",
        profile=profile,
        **_rider_context(),
    )


@main_bp.route("/user/settings")
def user_settings():
    guard = _require_rider()
    if guard:
        return guard
    settings_data, ok = _safe_rider_api(get_user_settings)
    settings = settings_from_api(settings_data if ok else None)
    has_active_trip = bool(session.get("active_trip"))
    return render_template(
        "user/settings.html",
        active_page="settings",
        settings=settings,
        api_connected=ok,
        has_active_trip=has_active_trip,
        **_rider_context(),
    )


@main_bp.route("/user/notifications")
def user_notifications():
    guard = _require_rider()
    if guard:
        return guard

    notifications = _notifications_inbox()
    return render_template(
        "user/notifications.html",
        active_page="notifications",
        notifications=notifications,
        inbox_meta=_notifications_inbox_meta(notifications),
        notification_channels=_notification_channels(),
        notification_topics=_notification_topics(),
        **_rider_context(),
    )


@main_bp.route("/user/api/notifications/<notification_id>/read", methods=["POST"])
def user_notification_mark_read(notification_id):
    guard = _require_rider_api()
    if guard:
        return guard

    token = _rider_token()
    try:
        mark_notification_read(token, notification_id)
    except ApiError as exc:
        return jsonify({"error": exc.message}), exc.status_code

    notifications = _notifications_inbox()
    return jsonify({
        "ok": True,
        "inbox_meta": _notifications_inbox_meta(notifications),
    })


@main_bp.route("/user/api/notifications/read-all", methods=["POST"])
def user_notifications_mark_all_read():
    guard = _require_rider_api()
    if guard:
        return guard

    token = _rider_token()
    try:
        mark_all_notifications_read(token)
    except ApiError as exc:
        return jsonify({"error": exc.message}), exc.status_code

    notifications = _notifications_inbox()
    return jsonify({
        "ok": True,
        "inbox_meta": _notifications_inbox_meta(notifications),
    })


@main_bp.route("/user/api/notifications/preferences", methods=["PATCH"])
def user_notifications_preferences():
    guard = _require_rider_api()
    if guard:
        return guard

    payload = request.get_json(silent=True) or {}
    group = payload.get("group")
    pref_id = payload.get("id")
    enabled = bool(payload.get("enabled"))

    valid_groups = {
        "channels": {row["id"] for row in NOTIFICATION_CHANNELS},
        "topics": {row["id"] for row in NOTIFICATION_TOPICS},
    }
    if group not in valid_groups or pref_id not in valid_groups[group]:
        return jsonify({"error": "invalid_preference"}), 400

    token = _rider_token()
    update_payload = prefs_update_from_ui(group, pref_id, enabled)
    if update_payload:
        try:
            update_notification_preferences(token, update_payload)
            return jsonify({"ok": True})
        except ApiError:
            pass

    prefs = dict(session.get(RIDER_NOTIFICATION_PREFS_KEY) or {})
    prefs.setdefault(group, {})
    prefs[group][pref_id] = enabled
    session[RIDER_NOTIFICATION_PREFS_KEY] = prefs

    return jsonify({"ok": True})


@main_bp.route("/user/support", methods=["GET", "POST"])
def user_support():
    guard = _require_rider()
    if guard:
        return guard
    if request.method == "POST":
        category = request.form.get("category", "Other").strip()
        description = request.form.get("description", "").strip()
        trip_id = request.form.get("trip_id", "").strip()
        if not description:
            flash("Describe the issue before submitting.", "error")
            return redirect(url_for("main.user_support"))
        try:
            create_support_ticket(
                _rider_token(),
                {
                    "category": support_category_slug(category),
                    "subject": category,
                    "description": description,
                    "ride_id": trip_id or None,
                },
            )
            flash("Support ticket submitted. Our team will respond shortly.", "success")
        except ApiError as exc:
            flash(exc.message, "error")
        return redirect(url_for("main.user_support"))

    tickets_data, tickets_ok = _safe_rider_api(lambda token: list_support_tickets(token, limit=10))
    support_tickets = (
        [support_ticket_to_ui(item) for item in (tickets_data or {}).get("tickets") or []]
        if tickets_ok
        else []
    )
    faq_data, faq_ok = _safe_rider_api(lambda token: get_support_faq(), None)
    faq_items = faq_from_api(faq_data) if faq_ok and faq_data else []
    return render_template(
        "user/support.html",
        active_page="support",
        faq_items=faq_items,
        support_tickets=support_tickets,
        api_connected=tickets_ok,
        **_rider_context(),
    )


# ── Rider JSON API (proxies to JosRide-back) ──


@main_bp.route("/user/api/rides/current")
def user_api_current_ride():
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        ride = get_current_ride(_rider_token())
        if not ride:
            ride = get_current_delivery(_rider_token())
        if ride:
            payload = ride.get("ride") or ride.get("data") or ride
            if isinstance(payload, dict) and payload.get("id"):
                session["active_trip"] = ride_to_active_trip(payload)
            return jsonify({"ride": payload})
        session.pop("active_trip", None)
        return jsonify({"ride": None})
    except ApiError as exc:
        if exc.status_code in (401, 403):
            session.pop("active_trip", None)
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/clear-active", methods=["POST"])
def user_api_clear_active_ride():
    """Clear stale Flask trip session after remote cancel (admin/driver/customer)."""
    guard = _require_rider_api()
    if guard:
        return guard
    session.pop("active_trip", None)
    return jsonify({"ok": True})


@main_bp.route("/user/api/rides/<ride_id>/start", methods=["POST"])
def user_api_start_ride(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(start_ride(_rider_token(), ride_id))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/<ride_id>/rate", methods=["POST"])
def user_api_rate_ride(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        rating = int(payload.get("rating", 0))
        return jsonify(
            rate_driver(_rider_token(), ride_id, rating, payload.get("comment"))
        )
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/<ride_id>/sos", methods=["POST"])
def user_api_ride_sos(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            trigger_ride_sos(
                _rider_token(),
                ride_id,
                payload.get("lat"),
                payload.get("lng"),
                payload.get("message"),
            )
        )
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/<ride_id>/call", methods=["POST"])
def user_api_ride_call(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            ride_call_intent(_rider_token(), ride_id, payload.get("target", "driver"))
        )
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/<ride_id>/call/token", methods=["POST"])
def user_api_ride_call_token(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(ride_call_token(_rider_token(), ride_id))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/<ride_id>/call/start", methods=["POST"])
def user_api_ride_call_start(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(ride_call_start(_rider_token(), ride_id)), 201
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/<ride_id>/call/accept", methods=["POST"])
def user_api_ride_call_accept(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(ride_call_accept(_rider_token(), ride_id))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/<ride_id>/call/reject", methods=["POST"])
def user_api_ride_call_reject(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(ride_call_reject(_rider_token(), ride_id))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/<ride_id>/call/end", methods=["POST"])
def user_api_ride_call_end(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(ride_call_end(_rider_token(), ride_id))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/<ride_id>/calls", methods=["GET"])
def user_api_ride_calls(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(ride_calls(_rider_token(), ride_id))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/<ride_id>/messages", methods=["GET", "POST"])
def user_api_ride_messages(ride_id):
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        if request.method == "POST":
            payload = request.get_json(silent=True) or {}
            message = (payload.get("message") or "").strip()
            if not message:
                return jsonify({"error": "message is required"}), 422
            return jsonify(send_ride_message(_rider_token(), ride_id, message)), 201
        return jsonify(get_ride_messages(_rider_token(), ride_id))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/wallet/paystack/initialize", methods=["POST"])
def user_api_paystack_initialize():
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        amount = float(payload.get("amount_ngn", 0))
        callback = payload.get("callback_url") or url_for("main.user_wallet", _external=True)
        return jsonify(
            initialize_paystack(
                _rider_token(),
                amount,
                email=payload.get("email") or session.get("email"),
                callback_url=callback,
            )
        )
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/wallet/paystack/verify", methods=["POST"])
def user_api_paystack_verify():
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(verify_paystack(_rider_token(), payload.get("reference", "")))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/wallet/fund-request", methods=["POST"])
def user_api_wallet_fund_request():
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            create_wallet_funding_request(
                _rider_token(),
                float(payload.get("amount_ngn", 0)),
                payload.get("bank_name", ""),
                payload.get("account_name", ""),
                payload.get("proof_url"),
            )
        )
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/wallet/withdraw", methods=["POST"])
def user_api_wallet_withdraw():
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            withdraw_wallet(
                _rider_token(),
                float(payload.get("amount_ngn", 0)),
                payload.get("bank_name", ""),
                payload.get("account_number", ""),
                payload.get("account_name", ""),
            )
        )
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/wallet/account-policy")
def user_api_account_policy():
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(get_account_policy(_rider_token()))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/wallet/pay-cancellation-fee", methods=["POST"])
def user_api_pay_cancellation_fee():
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(pay_cancellation_fee(_rider_token()))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/wallet/unlock-account", methods=["POST"])
def user_api_unlock_account():
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(unlock_account(_rider_token()))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/settings", methods=["PATCH"])
def user_api_settings():
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(update_user_settings(_rider_token(), payload))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/settings/pause", methods=["POST"])
def user_api_settings_pause():
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(pause_account(_rider_token(), payload.get("pause_until")))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/settings/deactivate-request", methods=["POST"])
def user_api_settings_deactivate():
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        result = request_account_deactivation(_rider_token())
        session.clear()
        return jsonify(result)
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/settings/delete-request", methods=["POST"])
def user_api_settings_delete():
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        result = request_account_deletion(_rider_token())
        session.clear()
        return jsonify(result)
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/settings/data-export")
def user_api_settings_export():
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(get_rider_data_export(_rider_token()))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/support/tickets")
def user_api_support_tickets():
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(list_support_tickets(_rider_token()))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/devices/register", methods=["POST"])
def user_api_register_device():
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            register_device(
                _rider_token(),
                payload.get("device_token", ""),
                payload.get("platform", "web"),
            )
        )
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/rides/estimate", methods=["POST"])
def user_api_ride_estimate():
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    try:
        estimate = estimate_ride_coords(
            _rider_token(),
            payload.get("pickup_address", ""),
            payload.get("destination_address", ""),
            payload.get("pickup_lat"),
            payload.get("pickup_lng"),
            payload.get("destination_lat"),
            payload.get("destination_lng"),
            tier=payload.get("service_tier", "economy"),
            stops=payload.get("stops"),
            city=payload.get("city"),
            vehicle_category=payload.get("vehicle_category", "car"),
        )
        return jsonify(estimate)
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/location", methods=["POST"])
def user_api_save_location():
    guard = _require_rider_api()
    if guard:
        return guard
    payload = request.get_json(silent=True) or {}
    label = (payload.get("label") or "").strip()
    lat = payload.get("lat")
    lng = payload.get("lng")
    if label and lat is not None and lng is not None:
        session["rider_location"] = label
        session["rider_lat"] = float(lat)
        session["rider_lng"] = float(lng)
    return jsonify({"ok": True, "label": label, "lat": lat, "lng": lng})


@main_bp.route("/user/api/nearby-drivers")
def user_api_nearby_drivers():
    guard = _require_rider_api()
    if guard:
        return guard
    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    if lat is None or lng is None:
        return jsonify({"error": "lat and lng required"}), 400
    try:
        return jsonify(
            get_nearby_drivers(
                _rider_token(),
                lat,
                lng,
                radius_km=request.args.get("radius_km", 1500, type=float),
            )
        )
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/search")
def user_api_search():
    guard = _require_rider_api()
    if guard:
        return guard
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"error": "q required"}), 400
    try:
        return jsonify(search_rider(_rider_token(), query))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/referral")
def user_api_referral():
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(_referral_for_ui(get_referral_info(_rider_token())))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/dashboard-summary")
def user_api_dashboard_summary():
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        summary = get_customer_dashboard_summary(_rider_token())
        stats = dashboard_stats_from_api((summary or {}).get("stats"))
        location_label = session.get("rider_location")
        if location_label:
            stats["location"] = {"value": location_label}
        account_policy = (summary or {}).get("account_policy") or {}
        referral = _referral_for_ui((summary or {}).get("referral"))
        recent_rides = (summary or {}).get("recent_rides") or []
        recent_trips = [ride_to_recent_trip(item) for item in recent_rides[:3]]
        return jsonify(
            {
                "stats": stats,
                "account_policy": account_policy,
                "referral": referral,
                "recent_trips": recent_trips,
            }
        )
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/support/live-chat", methods=["POST"])
def user_api_live_chat():
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        return jsonify(create_live_chat_session(_rider_token()))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/contacts", methods=["GET", "POST"])
def user_api_contacts():
    guard = _require_rider_api()
    if guard:
        return guard
    token = _rider_token()
    if request.method == "GET":
        try:
            return jsonify({"contacts": list_trusted_contacts(token)})
        except ApiError as exc:
            return _user_api_error(exc)
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(create_trusted_contact(token, payload))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/contacts/<contact_id>", methods=["DELETE"])
def user_api_delete_contact(contact_id):
    guard = _require_rider_api()
    if guard:
        return guard
    try:
        delete_trusted_contact(_rider_token(), contact_id)
        return jsonify({"ok": True})
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/user/api/saved-locations", methods=["GET", "POST"])
def user_api_saved_locations():
    guard = _require_rider_api()
    if guard:
        return guard
    token = _rider_token()
    if request.method == "GET":
        try:
            return jsonify({"locations": list_saved_locations(token)})
        except ApiError as exc:
            return _user_api_error(exc)
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(create_saved_location(token, payload))
    except ApiError as exc:
        return _user_api_error(exc)


@main_bp.route("/driver", methods=["GET", "POST"])
def driver_page():
    """Legacy URL - send drivers to the real driver portal."""
    if session.get("driver_token") or session.get("role") == "driver":
        return redirect(url_for("driver_portal.dashboard"))
    return redirect(url_for("main.home"))


@main_bp.route("/logout")
def logout():
    session.clear()
    flash("Signed out.", "success")
    return redirect(url_for("main.home"))
