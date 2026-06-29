from flask import Blueprint, flash, redirect, render_template, request, session, url_for
import re

from app.services.api_client import (
    ApiError,
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
from app.services.landing_content import load_landing_page

main_bp = Blueprint("main", __name__)

DRIVER_SIGNUP_KEY = "driver_signup"
RIDER_SIGNUP_KEY = "rider_signup"
DRIVER_SIGNUP_STEPS = {
    1: "Personal info",
    2: "Vehicle info",
    3: "Documents",
    4: "OTP verification",
    5: "Submitted",
}

VEHICLE_TIER_MAP = {
    "economy": ("car", "economy"),
    "comfort": ("car", "comfort"),
    "premium": ("car", "premium"),
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


def _handle_login(portal: str):
    if portal not in PORTAL_ROLES:
        portal = "rider"

    phone = request.form.get("phone", "").strip() if request.method == "POST" else ""
    email = request.form.get("email", "").strip() if request.method == "POST" else ""
    remember = request.form.get("remember") == "1" if request.method == "POST" else False

    if request.method == "POST":
        password = request.form.get("password", "")
        identifier = _resolve_login_identifier(phone, email)
        if not identifier:
            flash(
                "Enter your email address." if portal == "rider" else "Enter your phone number.",
                "error",
            )
        elif not password:
            flash("Enter your password.", "error")
        else:
            try:
                if portal == "rider":
                    result = login_with_joscity_fallback(identifier, password)
                else:
                    result = login(identifier, password)
                user = result.get("user") or {}
                role = user.get("role", "")
                expected_role = PORTAL_ROLES[portal]

                if role != expected_role:
                    account_name = "driver" if role == "driver" else "rider"
                    flash(
                        f"This account is registered as a {account_name}. "
                        f"Please sign in through the {account_name} portal.",
                        "error",
                    )
                else:
                    session["token"] = result.get("access_token", "")
                    session["user_id"] = user.get("id")
                    session["email"] = user.get("email") or email
                    session["phone"] = user.get("phone") or phone
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
                        if user.get("joscity_user_id")
                        else "Signed in successfully.",
                        "success",
                    )
                    if portal == "driver":
                        return redirect(url_for("main.driver_page"))
                    return redirect(url_for("main.ride_page"))
            except ApiError as exc:
                flash(exc.message, "error")

    return render_template(
        "auth/login_split.html",
        portal=portal,
        phone=phone,
        email=email,
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
    return _handle_login("driver")


def _get_driver_signup() -> dict:
    return dict(session.get(DRIVER_SIGNUP_KEY) or {})


def _save_driver_signup(data: dict) -> None:
    session[DRIVER_SIGNUP_KEY] = data
    session.modified = True


def _clear_driver_signup() -> None:
    session.pop(DRIVER_SIGNUP_KEY, None)


def _driver_signup_step() -> int:
    step = _get_driver_signup().get("step", 1)
    try:
        step = int(step)
    except (TypeError, ValueError):
        step = 1
    return max(1, min(step, 5))


def _driver_login_identifier(signup: dict) -> str:
    return _signup_identifier(signup)


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
        if action == "back" and step > 1:
            signup["step"] = step - 1
            _save_driver_signup(signup)
            return redirect(url_for("main.driver_register_page"))
        if action == "dashboard" and step == 5:
            token = signup.get("access_token")
            if token:
                session["token"] = token
                session["user_id"] = signup.get("user_id")
                session["email"] = signup.get("email")
                session["phone"] = signup.get("phone")
                session["name"] = signup.get("full_name")
                session["role"] = "driver"
                session["portal"] = "driver"
                _clear_driver_signup()
                return redirect(url_for("main.driver_page"))
            flash("Complete verification before continuing.", "error")
            signup["step"] = 4
            _save_driver_signup(signup)
            return redirect(url_for("main.driver_register_page"))

    if request.method == "POST":
        posted_step = request.form.get("step", type=int) or step
        action = request.form.get("action", "continue")

        if action == "resend" and posted_step == 4:
            identifier = _driver_login_identifier(signup)
            if not identifier:
                flash("Start your application again.", "error")
                return redirect(url_for("main.driver_register_page"))
            try:
                resend_otp(identifier)
                flash("A new verification code was sent to your email.", "success")
            except ApiError as exc:
                flash(exc.message, "error")
            signup["step"] = 4
            _save_driver_signup(signup)
            return redirect(url_for("main.driver_register_page"))

        if posted_step == 1:
            full_name = request.form.get("full_name", "").strip()
            phone = request.form.get("phone", "").strip()
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")
            confirm_password = request.form.get("confirm_password", "")
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
                signup.update(
                    {
                        "step": 2,
                        "full_name": full_name,
                        "phone": phone,
                        "email": email,
                        "password": password,
                    }
                )
                _save_driver_signup(signup)
                return redirect(url_for("main.driver_register_page"))

        elif posted_step == 2:
            vehicle_tier = request.form.get("vehicle_tier", "economy")
            vehicle_model = request.form.get("vehicle_model", "").strip()
            vehicle_color = request.form.get("vehicle_color", "").strip()
            plate_number = request.form.get("plate_number", "").strip().upper()
            if vehicle_tier not in VEHICLE_TIER_MAP:
                flash("Select a vehicle type.", "error")
            elif len(vehicle_model) < 1:
                flash("Enter your vehicle model.", "error")
            elif len(vehicle_color) < 1:
                flash("Enter your vehicle color.", "error")
            elif len(plate_number) < 2:
                flash("Enter your plate number.", "error")
            else:
                category, tier = VEHICLE_TIER_MAP[vehicle_tier]
                signup.update(
                    {
                        "step": 3,
                        "vehicle_tier": vehicle_tier,
                        "vehicle_category": category,
                        "service_tier": tier,
                        "vehicle_model": vehicle_model,
                        "vehicle_color": vehicle_color,
                        "plate_number": plate_number,
                    }
                )
                _save_driver_signup(signup)
                return redirect(url_for("main.driver_register_page"))

        elif posted_step == 3:
            license_file = request.files.get("driver_license")
            papers_file = request.files.get("vehicle_papers")
            nin_file = request.files.get("nin_document")
            for label, doc in (
                ("Driver license", license_file),
                ("Vehicle papers", papers_file),
                ("National ID / NIN", nin_file),
            ):
                error = _validate_upload(doc)
                if error:
                    flash(f"{label}: {error}", "error")
                    break
            else:
                try:
                    if not signup.get("access_token"):
                        result = register(
                            signup["full_name"],
                            signup["phone"],
                            signup["email"],
                            signup["password"],
                        )
                        signup["access_token"] = result.get("access_token", "")
                        user = result.get("user") or {}
                        signup["user_id"] = user.get("id")
                        signup.pop("password", None)
                        delivery = result.get("otp_delivery")
                        if delivery == "not_configured":
                            flash(
                                "Account created, but email delivery is not configured. "
                                "Contact support for your verification code.",
                                "error",
                            )
                        elif delivery != "sent":
                            flash("Account created. Check your email for a verification code.", "success")

                    token = signup.get("access_token")
                    if not token:
                        flash("Could not start your application. Try again.", "error")
                    else:
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
                        signup["step"] = 4
                        _save_driver_signup(signup)
                        flash("Documents uploaded. Enter the verification code sent to your email.", "success")
                        return redirect(url_for("main.driver_register_page"))
                except ApiError as exc:
                    flash(exc.message, "error")

        elif posted_step == 4:
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
                    documents = signup.get("documents") or {}
                    register_driver(
                        token,
                        {
                            "vehicle_category": signup.get("vehicle_category", "car"),
                            "service_tier": signup.get("service_tier", "economy"),
                            "vehicle_model": signup.get("vehicle_model", ""),
                            "vehicle_color": signup.get("vehicle_color", ""),
                            "plate_number": signup.get("plate_number", ""),
                            "driver_license_url": documents.get("driver_license_url", ""),
                            "vehicle_papers_url": documents.get("vehicle_papers_url", ""),
                            "nin_document_url": documents.get("nin_document_url", ""),
                        },
                    )
                    signup["step"] = 5
                    _save_driver_signup(signup)
                    flash("Application submitted successfully.", "success")
                    return redirect(url_for("main.driver_register_page"))
                except ApiError as exc:
                    flash(exc.message, "error")

        step = _driver_signup_step()
        signup = _get_driver_signup()

    return render_template(
        "auth/driver_register.html",
        step=step,
        total_steps=5,
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
                    flash("Welcome to JCRide! Your account is ready.", "success")
                    return redirect(url_for("main.ride_page"))
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


@main_bp.route("/ride", methods=["GET", "POST"])
def ride_page():
    if request.method == "POST":
        pickup = request.form.get("pickup", "").strip()
        dropoff = request.form.get("dropoff", "").strip()
        token = session.get("token")
        if not token:
            flash("Ride booking is coming soon.", "error")
        else:
            try:
                request_ride(token, pickup, dropoff)
                flash("Ride requested — waiting for a driver.", "success")
            except ApiError as exc:
                flash(exc.message, "error")
    return render_template("ride.html")


@main_bp.route("/driver", methods=["GET", "POST"])
def driver_page():
    online = session.get("driver_online", False)
    if request.method == "POST":
        token = session.get("token")
        if not token:
            flash("Driver onboarding is coming soon.", "error")
        else:
            action = request.form.get("action")
            try:
                new_status = action == "online"
                set_availability(token, new_status)
                session["driver_online"] = new_status
                flash("You are now online." if new_status else "You are now offline.", "success")
                online = new_status
            except ApiError as exc:
                flash(exc.message, "error")
    return render_template("driver.html", online=online)


@main_bp.route("/logout")
def logout():
    session.clear()
    flash("Signed out.", "success")
    return redirect(url_for("main.home"))
