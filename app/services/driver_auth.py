"""Driver authentication flow shared by main and driver portal routes."""

from flask import flash, redirect, session, url_for

from app.services.api_client import ApiError, get_profile, login
from app.services.auth_utils import (
    apply_driver_session,
    extract_access_token,
    extract_user,
    is_driver_role,
    is_rider_role,
    normalize_role,
)


def driver_dashboard_redirect():
    return redirect(url_for("driver_portal.dashboard"))


def driver_is_authenticated() -> bool:
    return bool(session.get("driver_token"))


def authenticate_driver(identifier: str, password: str, remember: bool = False):
    """
    Log in a driver via the API, populate session, and return the API payload.
    Raises ApiError on failure or if the account is not a driver.
    """
    identifier = identifier.strip()
    result = login(identifier, password)

    token = extract_access_token(result)
    user = extract_user(result)

    if token and not user.get("role"):
        try:
            profile = get_profile(token)
            profile_user = extract_user(profile) or profile
            if profile_user:
                user = {**user, **profile_user}
                if "user" in result and isinstance(result["user"], dict):
                    result["user"] = {**result["user"], **profile_user}
        except ApiError:
            pass

    role = normalize_role(user.get("role", ""))
    if is_rider_role(role):
        raise ApiError(
            "This account is registered as a rider. Please sign in through the rider portal.",
            403,
        )

    # Driver portal: allow if role is driver OR role omitted (backend quirk)
    if role and not is_driver_role(role):
        raise ApiError(
            f"This account cannot access the driver portal (role: {role}).",
            403,
        )

    apply_driver_session(result, identifier, remember)
    return result


def handle_driver_login_post(identifier: str, password: str, remember: bool = False):
    """Authenticate driver or flash an error. Returns a redirect response or None."""
    identifier = identifier.strip()
    if not identifier:
        flash("Enter your email or phone number.", "error")
        return None
    if not password:
        flash("Enter your password.", "error")
        return None

    try:
        authenticate_driver(identifier, password, remember)
        flash("Signed in successfully.", "success")
        return driver_dashboard_redirect()
    except ApiError as exc:
        flash(exc.message, "error")
        return None
    except ValueError:
        flash("Login succeeded but the server did not return a token. Try again.", "error")
        return None
