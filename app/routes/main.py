from flask import Blueprint, flash, get_flashed_messages, redirect, render_template, request, session, url_for
import re

from app.services.api_client import (
    ApiError,
    get_driver_profile,
    get_profile,
    login,
    login_with_joscity_fallback,
    register,
    register_driver,
    request_ride,
    resend_otp,
    set_availability,
    upload_driver_document,
    verify_otp,
)
from app.rider_defaults import (
    BOOK_RIDE_DEFAULTS,
    LIVE_AREA,
    LIVE_TRACKING,
    PROFILE_DEFAULTS,
    PROFILE_MENU,
    RECENT_TRIPS,
    RIDE_HISTORY_TRIPS,
    RIDE_TIERS,
    RIDER_STATS,
    SCHEDULE_VEHICLE_CLASSES,
    SUPPORT_FAQ,
    UPCOMING_SCHEDULED_RIDES,
    WALLET_SUMMARY,
    WALLET_TRANSACTIONS,
    build_live_area_map,
)
from app.services.landing_content import load_landing_page

main_bp = Blueprint("main", __name__)

DRIVER_SIGNUP_KEY = "driver_signup"
RIDER_SIGNUP_KEY = "rider_signup"
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


def _rider_context() -> dict:
    name = session.get("name") or PROFILE_DEFAULTS["full_name"]
    return {
        "rider_name": name,
        "rider_initials": _rider_initials(name),
        "rider_location": RIDER_STATS["location"]["value"],
    }


def _profile_context() -> dict:
    profile = dict(PROFILE_DEFAULTS)
    if session.get("name"):
        profile["full_name"] = session["name"]
    if session.get("email"):
        profile["email"] = session["email"]
    if session.get("phone"):
        profile["phone"] = session["phone"]
    return profile


def _require_rider():
    if not session.get("token"):
        flash("Please sign in to access your rider dashboard.", "error")
        return redirect(url_for("main.rider_login_page"))
    return None


def _handle_login(portal: str):
    if portal not in PORTAL_ROLES:
        portal = "rider"

    phone = request.form.get("phone", "").strip() if request.method == "POST" else ""
    email = request.form.get("email", "").strip() if request.method == "POST" else ""
    email_or_phone = request.form.get("email_or_phone", "").strip() if request.method == "POST" else ""
    remember = request.form.get("remember") == "1" if request.method == "POST" else False

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
                expected_role = PORTAL_ROLES[portal]

                if portal == "driver" and role == "customer":
                    token = result.get("access_token", "")
                    try:
                        get_driver_profile(token)
                    except ApiError as exc:
                        if exc.status_code == 404:
                            if user.get("joscity_user_id"):
                                flash(
                                    "This JosCity account has not completed driver signup. "
                                    "Apply as a driver first — rider JosCity sign-in is not available here.",
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

                if role != expected_role:
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
    """Persist only wizard state required to finish signup — no personal details."""
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


@main_bp.route("/forgot-password")
def forgot_password_page():
    flash("Password reset is coming soon. Contact support if you need help.", "error")
    return redirect(request.referrer or url_for("main.portals_page"))


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
    rider_ctx = _rider_context()
    return render_template(
        "user/dashboard.html",
        active_page="dashboard",
        stats=RIDER_STATS,
        live_area=LIVE_AREA,
        live_area_map=build_live_area_map(rider_ctx["rider_location"]),
        recent_trips=RECENT_TRIPS,
        **rider_ctx,
    )


@main_bp.route("/user/book-ride", methods=["GET", "POST"])
@main_bp.route("/ride", methods=["GET", "POST"], endpoint="ride_page")
def user_book_ride():
    guard = _require_rider()
    if guard:
        return guard

    booking = dict(BOOK_RIDE_DEFAULTS)

    if request.method == "POST":
        pickup = request.form.get("pickup", "").strip()
        dropoff = request.form.get("dropoff", "").strip()
        tier = request.form.get("tier", "economy")
        booking.update({"pickup": pickup, "dropoff": dropoff})
        try:
            request_ride(session["token"], pickup, dropoff)
            flash(f"Ride requested ({tier}) — waiting for a driver.", "success")
        except ApiError as exc:
            flash(exc.message, "error")

    return render_template(
        "user/book_ride.html",
        active_page="book_ride",
        booking=booking,
        ride_tiers=RIDE_TIERS,
        **_rider_context(),
    )


@main_bp.route("/user/schedule-ride")
def user_schedule_ride():
    guard = _require_rider()
    if guard:
        return guard
    return render_template(
        "user/schedule_ride.html",
        active_page="schedule_ride",
        vehicle_classes=SCHEDULE_VEHICLE_CLASSES,
        upcoming_rides=UPCOMING_SCHEDULED_RIDES,
        **_rider_context(),
    )


@main_bp.route("/user/live-tracking")
def user_live_tracking():
    guard = _require_rider()
    if guard:
        return guard
    return render_template(
        "user/live_tracking.html",
        active_page="live_tracking",
        tracking=LIVE_TRACKING,
        **_rider_context(),
    )


@main_bp.route("/user/ride-history")
def user_ride_history():
    guard = _require_rider()
    if guard:
        return guard
    return render_template(
        "user/ride_history.html",
        active_page="ride_history",
        history_trips=RIDE_HISTORY_TRIPS,
        **_rider_context(),
    )


@main_bp.route("/user/wallet")
def user_wallet():
    guard = _require_rider()
    if guard:
        return guard
    wallet = dict(WALLET_SUMMARY)
    if session.get("wallet_balance_ngn") is not None:
        balance = session["wallet_balance_ngn"]
        wallet["balance"] = f"₦{balance:,.2f}"
    return render_template(
        "user/wallet.html",
        active_page="wallet",
        wallet=wallet,
        transactions=WALLET_TRANSACTIONS,
        **_rider_context(),
    )


@main_bp.route("/user/profile", methods=["GET", "POST"])
def user_profile():
    guard = _require_rider()
    if guard:
        return guard
    profile = _profile_context()
    if request.method == "POST":
        session["name"] = request.form.get("full_name", profile["full_name"]).strip()
        session["email"] = request.form.get("email", profile["email"]).strip()
        session["phone"] = request.form.get("phone", profile["phone"]).strip()
        flash("Profile updated.", "success")
        return redirect(url_for("main.user_profile"))
    return render_template(
        "user/profile.html",
        active_page="profile",
        profile=profile,
        profile_menu=PROFILE_MENU,
        **_rider_context(),
    )


@main_bp.route("/user/settings")
def user_settings():
    guard = _require_rider()
    if guard:
        return guard
    return render_template(
        "user/settings.html",
        active_page="settings",
        **_rider_context(),
    )


@main_bp.route("/user/support", methods=["GET", "POST"])
def user_support():
    guard = _require_rider()
    if guard:
        return guard
    if request.method == "POST":
        flash("Support ticket submitted. Our team will respond shortly.", "success")
        return redirect(url_for("main.user_support"))
    return render_template(
        "user/support.html",
        active_page="support",
        faq_items=SUPPORT_FAQ,
        **_rider_context(),
    )


@main_bp.route("/driver", methods=["GET", "POST"])
def driver_page():
    """Legacy route — send drivers to the driver portal dashboard."""
    return redirect(url_for("driver_portal.dashboard"))


@main_bp.route("/logout")
def logout():
    session.clear()
    flash("Signed out.", "success")
    return redirect(url_for("main.home"))
