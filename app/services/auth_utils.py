"""Shared helpers for login responses and driver session state."""


def extract_access_token(payload: dict) -> str:
    if not payload:
        return ""
    for key in ("access_token", "token", "accessToken"):
        value = payload.get(key)
        if value:
            return str(value)
    data = payload.get("data") or {}
    if isinstance(data, dict):
        for key in ("access_token", "token", "accessToken"):
            value = data.get(key)
            if value:
                return str(value)
    return ""


def extract_user(payload: dict) -> dict:
    if not payload:
        return {}
    user = payload.get("user")
    if isinstance(user, dict) and user:
        return user
    data = payload.get("data") or {}
    if isinstance(data, dict):
        nested = data.get("user")
        if isinstance(nested, dict):
            return nested
    return {}


def normalize_role(role: str) -> str:
    return (role or "").strip().lower()


def is_driver_role(role: str) -> bool:
    return normalize_role(role) in {"driver", "driver_partner", "drivers"}


def is_rider_role(role: str) -> bool:
    return normalize_role(role) in {"customer", "rider", "user", "passenger"}


def apply_driver_session(result: dict, identifier: str = "", remember: bool = False) -> dict:
    """Persist driver auth in Flask session. Returns the user dict."""
    from flask import session

    token = extract_access_token(result)
    user = extract_user(result)

    if not token:
        raise ValueError("missing_access_token")

    session["token"] = token
    session["driver_token"] = token
    session["user_id"] = user.get("id")
    session["name"] = user.get("full_name") or user.get("name")
    session["driver_name"] = session["name"]
    session["role"] = normalize_role(user.get("role", "")) or "driver"
    session["portal"] = "driver"
    session["driver_online"] = session.get("driver_online", False)

    email = user.get("email") or ""
    phone = user.get("phone") or ""
    if identifier and "@" in identifier:
        session["driver_email"] = identifier
        session["driver_phone"] = phone
        session["email"] = email or identifier
        session["phone"] = phone
    elif identifier:
        session["driver_phone"] = identifier
        session["driver_email"] = email
        session["phone"] = identifier
        session["email"] = email
    else:
        session["email"] = email
        session["phone"] = phone
        session["driver_email"] = email
        session["driver_phone"] = phone

    session.permanent = remember
    return user
