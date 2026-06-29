import requests

from app.config import get_api_url

API_PREFIX = "/api/v1"


class ApiError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _parse_error(response: requests.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text or response.reason

    detail = body.get("detail")
    if isinstance(detail, list) and detail:
        first = detail[0]
        if isinstance(first, dict):
            return first.get("msg", str(first))
        return str(first)
    if isinstance(detail, dict):
        return detail.get("message", str(detail))
    if isinstance(detail, str):
        return detail
    return body.get("message", response.text or response.reason)


def _request(method, endpoint, token=None, **kwargs):
    api_url = get_api_url()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = requests.request(
            method, f"{api_url}{endpoint}", headers=headers, timeout=30, **kwargs
        )
    except requests.RequestException as exc:
        raise ApiError(
            f"Could not reach API at {api_url}. "
            f"Set API_URL in .env to your backend (e.g. https://jcride-back.onrender.com) "
            f"and restart the app. Details: {exc}"
        ) from exc
    if not response.ok:
        raise ApiError(_parse_error(response), response.status_code)
    return response.json() if response.content else {}


def login(email_or_phone, password):
    return _request(
        "POST",
        f"{API_PREFIX}/auth/login",
        json={"email_or_phone": email_or_phone, "password": password},
    )


def joscity_login(email_or_phone, password):
    return _request(
        "POST",
        f"{API_PREFIX}/auth/joscity-login",
        json={"email_or_phone": email_or_phone, "password": password},
    )


def login_with_joscity_fallback(email_or_phone, password):
    """Try JC-Ride login first; on missing/invalid credentials, try JosCity login."""
    try:
        return login(email_or_phone, password)
    except ApiError as exc:
        if exc.status_code in (401, 403, 404):
            return joscity_login(email_or_phone, password)
        raise


def update_profile(token, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/auth/me",
        token=token,
        json=payload,
    )


def get_profile(token):
    return _request("GET", f"{API_PREFIX}/auth/me", token=token)


def admin_login(email, password):
    return _request(
        "POST",
        f"{API_PREFIX}/admin/auth/login",
        json={"email": email, "password": password},
    )


def register(full_name, phone, email, password, confirm_password=None):
    if confirm_password is None:
        confirm_password = password
    return _request(
        "POST",
        f"{API_PREFIX}/auth/register",
        json={
            "full_name": full_name,
            "phone": phone,
            "email": email,
            "password": password,
            "confirm_password": confirm_password,
        },
    )


def verify_otp(email_or_phone, code):
    return _request(
        "POST",
        f"{API_PREFIX}/auth/verify-otp",
        json={"email_or_phone": email_or_phone, "code": code},
    )


def resend_otp(email_or_phone):
    return _request(
        "POST",
        f"{API_PREFIX}/auth/resend-otp",
        json={"email_or_phone": email_or_phone},
    )


def upload_driver_document(token, document_type, file_storage):
    headers = {"Authorization": f"Bearer {token}"}
    file_storage.stream.seek(0)
    files = {
        "file": (
            file_storage.filename,
            file_storage.stream,
            file_storage.content_type or "application/octet-stream",
        )
    }
    data = {"document_type": document_type}
    try:
        api_url = get_api_url()
        response = requests.post(
            f"{api_url}{API_PREFIX}/drivers/documents/upload",
            headers=headers,
            files=files,
            data=data,
            timeout=60,
        )
    except requests.RequestException as exc:
        raise ApiError(
            f"Could not reach API at {get_api_url()}. "
            f"Set API_URL in .env and restart the app. Details: {exc}"
        ) from exc
    if not response.ok:
        raise ApiError(_parse_error(response), response.status_code)
    return response.json() if response.content else {}


def register_driver(token, payload):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/register",
        token=token,
        json=payload,
    )


def request_ride(token, pickup, dropoff):
    return _request(
        "POST",
        f"{API_PREFIX}/rides/request",
        token=token,
        json={"pickup": pickup, "destination": dropoff},
    )


def set_availability(token, online):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/availability",
        token=token,
        json={"online": online},
    )


def get_admin_stats(token):
    return _request("GET", f"{API_PREFIX}/admin/dashboard/stats", token=token)


def get_admin_revenue(token, period="1Y"):
    return _request(
        "GET",
        f"{API_PREFIX}/admin/analytics/revenue",
        token=token,
        params={"period": period},
    )


def get_admin_ride_tiers(token):
    return _request("GET", f"{API_PREFIX}/admin/analytics/ride-tiers", token=token)


def get_admin_live_trips(token):
    return _request("GET", f"{API_PREFIX}/admin/trips/live", token=token)


def get_admin_users(token, search="", status=None, page=1, limit=20):
    params = {"page": page, "limit": limit}
    if search:
        params["search"] = search
    if status:
        params["status"] = status
    return _request("GET", f"{API_PREFIX}/admin/users", token=token, params=params)


def get_admin_user(token, user_id):
    return _request("GET", f"{API_PREFIX}/admin/users/{user_id}", token=token)


def update_admin_user_status(token, user_id, status):
    return _request(
        "PATCH",
        f"{API_PREFIX}/admin/users/{user_id}/status",
        token=token,
        json={"status": status},
    )


def delete_admin_user(token, user_id):
    return _request("DELETE", f"{API_PREFIX}/admin/users/{user_id}", token=token)


def invite_admin_user(token, name, email, password):
    return _request(
        "POST",
        f"{API_PREFIX}/admin/users/invite-admin",
        token=token,
        json={"name": name, "email": email, "password": password},
    )


def get_admin_driver_stats(token):
    return _request("GET", f"{API_PREFIX}/admin/drivers/stats", token=token)


def get_admin_drivers(token, search="", status=None, page=1, limit=20):
    params = {"page": page, "limit": limit}
    if search:
        params["search"] = search
    if status:
        params["status"] = status
    return _request("GET", f"{API_PREFIX}/admin/drivers", token=token, params=params)


def get_admin_driver(token, driver_id):
    return _request("GET", f"{API_PREFIX}/admin/drivers/{driver_id}", token=token)


def update_admin_driver_status(token, driver_id, status):
    return _request(
        "PATCH",
        f"{API_PREFIX}/admin/drivers/{driver_id}/status",
        token=token,
        json={"status": status},
    )


def get_admin_trips_map(token):
    return _request("GET", f"{API_PREFIX}/admin/trips/map", token=token)


def get_admin_trips(token, status="all", page=1, limit=20):
    params = {"page": page, "limit": limit, "status": status}
    return _request("GET", f"{API_PREFIX}/admin/trips", token=token, params=params)


def get_admin_payment_stats(token):
    return _request("GET", f"{API_PREFIX}/admin/payments/stats", token=token)


def get_admin_payment_transactions(
    token,
    *,
    search="",
    status=None,
    category=None,
    transaction_type=None,
    date_from=None,
    date_to=None,
    page=1,
    limit=20,
):
    params = {"page": page, "limit": limit}
    if search:
        params["search"] = search
    if status:
        params["status"] = status
    if category:
        params["category"] = category
    if transaction_type:
        params["type"] = transaction_type
    if date_from:
        params["date_from"] = date_from
    if date_to:
        params["date_to"] = date_to
    return _request("GET", f"{API_PREFIX}/admin/payments/transactions", token=token, params=params)


def settle_admin_payments(token, amount_ngn=None, notes=None):
    payload = {}
    if amount_ngn is not None:
        payload["amount_ngn"] = amount_ngn
    if notes:
        payload["notes"] = notes
    return _request("POST", f"{API_PREFIX}/admin/payments/settle", token=token, json=payload)


def get_admin_wallet_stats(token):
    return _request("GET", f"{API_PREFIX}/admin/wallet/stats", token=token)


def get_admin_wallet_holders(token, search="", sort="balance", page=1, limit=20):
    params = {"page": page, "limit": limit, "sort": sort}
    if search:
        params["search"] = search
    return _request("GET", f"{API_PREFIX}/admin/wallet/users", token=token, params=params)


def get_admin_analytics_daily_rides(token, days=14):
    return _request("GET", f"{API_PREFIX}/admin/analytics/daily-rides", token=token, params={"days": days})


def get_admin_analytics_success_rate(token):
    return _request("GET", f"{API_PREFIX}/admin/analytics/ride-success-rate", token=token)


def get_admin_analytics_growth(token):
    return _request("GET", f"{API_PREFIX}/admin/analytics/user-driver-growth", token=token)


def get_admin_analytics_heatmap(token, city="Lagos"):
    return _request("GET", f"{API_PREFIX}/admin/analytics/demand-heatmap", token=token, params={"city": city})


def get_admin_support_tickets(token, status=None, search="", page=1, limit=20):
    params = {"page": page, "limit": limit}
    if status:
        params["status"] = status
    if search:
        params["search"] = search
    return _request("GET", f"{API_PREFIX}/admin/support/tickets", token=token, params=params)


def get_admin_support_sla(token):
    return _request("GET", f"{API_PREFIX}/admin/support/sla", token=token)


def get_admin_support_agents(token):
    return _request("GET", f"{API_PREFIX}/admin/support/agents", token=token)


def update_admin_support_ticket(token, ticket_id, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/admin/support/tickets/{ticket_id}",
        token=token,
        json=payload,
    )


def get_admin_ops_notifications(token, severity=None, page=1, limit=50):
    params = {"page": page, "limit": limit}
    if severity:
        params["severity"] = severity
    return _request("GET", f"{API_PREFIX}/admin/notifications/ops", token=token, params=params)


def mark_admin_ops_notifications_read(token):
    return _request("POST", f"{API_PREFIX}/admin/notifications/ops/mark-all-read", token=token)


def get_admin_ops_notification_settings(token):
    return _request("GET", f"{API_PREFIX}/admin/notifications/ops/settings", token=token)


def update_admin_ops_notification_settings(token, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/admin/notifications/ops/settings",
        token=token,
        json=payload,
    )


def get_public_landing_page():
    return _request("GET", f"{API_PREFIX}/public/landing-page")


def get_admin_landing_page(token):
    return _request("GET", f"{API_PREFIX}/admin/settings/landing-page", token=token)


def update_admin_landing_page(token, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/admin/settings/landing-page",
        token=token,
        json=payload,
    )


def get_admin_platform_settings(token):
    return _request("GET", f"{API_PREFIX}/admin/settings/platform", token=token)


def update_admin_platform_settings(token, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/admin/settings/platform",
        token=token,
        json=payload,
    )
