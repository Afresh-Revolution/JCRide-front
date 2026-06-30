import time

import requests
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import ReadTimeout, RequestException, Timeout

from app.config import get_api_timeout, get_api_url

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


def _connection_error_message(api_url: str, exc: RequestException) -> str:
    detail = str(exc)
    if "actively refused" in detail or "10061" in detail or "Connection refused" in detail:
        return (
            f"Backend is not running at {api_url}. "
            "Start it from the JCRide-back folder: python run.py"
        )
    if isinstance(exc, (ReadTimeout, Timeout)) or "timed out" in detail.lower():
        return (
            f"Backend at {api_url} did not respond in time. "
            "On Render free tier the server may be waking up—wait a moment and try again, "
            "or set API_URL=http://localhost:8000 in .env and run JCRide-back locally."
        )
    return f"Could not reach API at {api_url}. Details: {exc}"


def _request(method, endpoint, token=None, **kwargs):
    api_url = get_api_url()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    timeout = kwargs.pop("timeout", get_api_timeout())
    max_attempts = 2
    last_exc: RequestException | None = None

    for attempt in range(max_attempts):
        try:
            response = requests.request(
                method, f"{api_url}{endpoint}", headers=headers, timeout=timeout, **kwargs
            )
            break
        except RequestException as exc:
            last_exc = exc
            retryable = isinstance(exc, (ReadTimeout, Timeout, RequestsConnectionError))
            if attempt < max_attempts - 1 and retryable:
                time.sleep(2)
                continue
            raise ApiError(_connection_error_message(api_url, exc)) from exc
    else:
        raise ApiError(_connection_error_message(api_url, last_exc)) from last_exc
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


def get_driver_profile(token):
    return _request("GET", f"{API_PREFIX}/drivers/me", token=token)


def update_driver_profile(token, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/drivers/me",
        token=token,
        json=payload,
    )


def get_driver_ride_requests(token):
    return _request("GET", f"{API_PREFIX}/drivers/ride-requests", token=token)


def get_driver_active_ride(token):
    return _request("GET", f"{API_PREFIX}/drivers/rides/active", token=token)


def accept_driver_ride(token, ride_id):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/rides/{ride_id}/accept",
        token=token,
    )


def reject_driver_ride(token, ride_id):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/rides/{ride_id}/reject",
        token=token,
    )


def driver_ride_arrived(token, ride_id):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/rides/{ride_id}/arrived",
        token=token,
    )


def complete_driver_ride(token, ride_id):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/rides/{ride_id}/complete",
        token=token,
    )


def cancel_driver_ride(token, ride_id):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/rides/{ride_id}/cancel",
        token=token,
    )


def get_driver_dashboard(token):
    return _request("GET", f"{API_PREFIX}/drivers/dashboard", token=token)


def get_driver_earnings(token):
    return _request("GET", f"{API_PREFIX}/drivers/earnings", token=token)


def get_driver_earnings_transactions(token, page=1, limit=20):
    return _request(
        "GET",
        f"{API_PREFIX}/drivers/earnings/transactions",
        token=token,
        params={"page": page, "limit": limit},
    )


def get_driver_settings(token):
    return _request("GET", f"{API_PREFIX}/drivers/settings", token=token)


def update_driver_settings(token, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/drivers/settings",
        token=token,
        json=payload,
    )


def driver_settings_go_offline(token):
    return _request("POST", f"{API_PREFIX}/drivers/settings/go-offline", token=token)


def driver_settings_pause(token):
    return _request("POST", f"{API_PREFIX}/drivers/settings/pause", token=token)


def driver_settings_deactivate_request(token):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/settings/deactivate-request",
        token=token,
    )


def submit_driver_support_ticket(token, category, description, trip_id=None):
    payload = {"category": category, "description": description}
    if trip_id:
        payload["trip_id"] = trip_id
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/support/tickets",
        token=token,
        json=payload,
    )


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
    api_url = get_api_url()
    timeout = get_api_timeout()
    max_attempts = 2
    last_exc: RequestException | None = None

    for attempt in range(max_attempts):
        try:
            response = requests.post(
                f"{api_url}{API_PREFIX}/drivers/documents/upload",
                headers=headers,
                files=files,
                data=data,
                timeout=timeout,
            )
            break
        except RequestException as exc:
            last_exc = exc
            retryable = isinstance(exc, (ReadTimeout, Timeout, RequestsConnectionError))
            if attempt < max_attempts - 1 and retryable:
                time.sleep(2)
                file_storage.stream.seek(0)
                continue
            raise ApiError(_connection_error_message(api_url, exc)) from exc
    else:
        raise ApiError(_connection_error_message(api_url, last_exc)) from last_exc
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
    return _request("GET", f"{API_PREFIX}/admin/dashboard", token=token)


def get_admin_revenue(token, period="1Y"):
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    period_map = {
        "1M": ("day", now - timedelta(days=30)),
        "3M": ("week", now - timedelta(days=92)),
        "1Y": ("month", now - timedelta(days=365)),
        "All": ("month", None),
    }
    bucket, date_from = period_map.get(period, ("month", now - timedelta(days=365)))
    params = {"period": bucket}
    if date_from is not None:
        params["date_from"] = date_from.isoformat()
    params["date_to"] = now.isoformat()
    return _request(
        "GET",
        f"{API_PREFIX}/admin/analytics/revenue-growth",
        token=token,
        params=params,
    )


def get_admin_ride_tiers(token):
    return _request("GET", f"{API_PREFIX}/admin/analytics/ride-tier-split", token=token)


def get_admin_live_trips(token):
    return _request("GET", f"{API_PREFIX}/admin/live-trips", token=token)


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


def delete_admin_driver(token, driver_id):
    return _request("DELETE", f"{API_PREFIX}/admin/drivers/{driver_id}", token=token)


def get_admin_bike_delivery_stats(token):
    return _request("GET", f"{API_PREFIX}/admin/bike-delivery/stats", token=token)


def get_admin_bike_delivery_pricing(token):
    return _request("GET", f"{API_PREFIX}/admin/bike-delivery/pricing", token=token)


def get_admin_bike_delivery_zones(token):
    return _request("GET", f"{API_PREFIX}/admin/bike-delivery/zones", token=token)


def get_admin_bike_delivery_riders(token, search="", status=None, page=1, limit=20):
    params = {"page": page, "limit": limit}
    if search:
        params["search"] = search
    if status:
        params["status"] = status
    return _request("GET", f"{API_PREFIX}/admin/bike-delivery/riders", token=token, params=params)


def get_admin_bike_delivery_rider(token, rider_id):
    return _request("GET", f"{API_PREFIX}/admin/bike-delivery/riders/{rider_id}", token=token)


def onboard_admin_bike_rider(token, payload):
    return _request(
        "POST",
        f"{API_PREFIX}/admin/bike-delivery/riders",
        token=token,
        json=payload,
    )


def update_admin_bike_rider_status(token, rider_id, status):
    return _request(
        "PATCH",
        f"{API_PREFIX}/admin/bike-delivery/riders/{rider_id}/status",
        token=token,
        json={"status": status},
    )


def get_admin_trips_map(token):
    return get_admin_live_trips(token)


def get_admin_trips(token, status="all", page=1, limit=20):
    params = {"page": page, "limit": limit}
    status_map = {
        "completed": "completed",
        "cancelled": "cancelled",
    }
    if status and status not in {"all", "active"}:
        params["status"] = status_map.get(status, status)
    return _request("GET", f"{API_PREFIX}/admin/rides", token=token, params=params)


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


def get_admin_analytics_cities(token):
    return _request("GET", f"{API_PREFIX}/admin/analytics/city-performance", token=token)


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


def get_admin_bike_delivery_settings(token):
    return _request("GET", f"{API_PREFIX}/admin/settings/bike-delivery", token=token)


def update_admin_bike_delivery_settings(token, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/admin/settings/bike-delivery",
        token=token,
        json=payload,
    )
