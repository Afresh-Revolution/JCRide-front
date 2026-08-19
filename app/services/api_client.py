import time

import requests
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import ReadTimeout, RequestException, Timeout

from app.config import get_api_timeout, get_api_urls

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


def _connection_error_message(api_urls: list[str], exc: RequestException | None) -> str:
    tried = " → ".join(api_urls)
    detail = str(exc) if exc else "unknown error"
    if "actively refused" in detail or "10061" in detail or "Connection refused" in detail:
        return (
            f"Could not reach any backend ({tried}). "
            "Start JosRide-back locally or confirm the deployed API URL in .env."
        )
    if isinstance(exc, (ReadTimeout, Timeout)) or "timed out" in detail.lower():
        return (
            f"Backend did not respond in time ({tried}). "
            "On Render free tier the server may be waking up-wait a moment and try again."
        )
    return f"Could not reach API ({tried}). Details: {detail}"


def _frontend_origin_header() -> dict[str, str]:
    """Tell the API which public site origin generated this server-side request."""
    try:
        from flask import has_request_context, request

        if not has_request_context():
            return {}
        from app.config import get_public_app_url

        origin = get_public_app_url()
        if origin:
            return {"X-Frontend-Origin": origin}
    except Exception:
        return {}
    return {}


def _request(method, endpoint, token=None, **kwargs):
    headers = {"Content-Type": "application/json", **_frontend_origin_header()}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    timeout = kwargs.pop("timeout", get_api_timeout())
    max_attempts = 2
    api_urls = get_api_urls()
    last_exc: RequestException | None = None
    response = None

    for base_url in api_urls:
        for attempt in range(max_attempts):
            try:
                response = requests.request(
                    method, f"{base_url}{endpoint}", headers=headers, timeout=timeout, **kwargs
                )
                break
            except RequestException as exc:
                last_exc = exc
                retryable = isinstance(exc, (ReadTimeout, Timeout, RequestsConnectionError))
                if attempt < max_attempts - 1 and retryable:
                    time.sleep(2)
                    continue
                response = None
                break
        if response is not None:
            if (
                response.status_code == 404
                and base_url != api_urls[-1]
            ):
                try:
                    body = response.json()
                except ValueError:
                    body = {}
                if body.get("detail") == "Not Found":
                    response = None
                    continue
            break

    if response is None:
        raise ApiError(_connection_error_message(api_urls, last_exc)) from last_exc
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
    """Try JosRide login first; on missing/invalid credentials, try JosCity login."""
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


def get_vehicle_change_status(token):
    return _request("GET", f"{API_PREFIX}/drivers/me/vehicle-change", token=token)


def _multipart_file_tuple(upload):
    """Build a stable (filename, bytes, content_type) tuple for multipart uploads."""
    from io import BytesIO
    import mimetypes

    if isinstance(upload, (tuple, list)) and len(upload) >= 2:
        filename = upload[0]
        payload = upload[1]
        content_type = upload[2] if len(upload) > 2 else None
        if hasattr(payload, "seek"):
            try:
                payload.seek(0)
            except Exception:
                pass
        if hasattr(payload, "read"):
            data = payload.read()
        else:
            data = payload
    else:
        filename = getattr(upload, "filename", None) or "upload.bin"
        stream = getattr(upload, "stream", upload)
        if hasattr(stream, "seek"):
            try:
                stream.seek(0)
            except Exception:
                pass
        data = stream.read() if hasattr(stream, "read") else stream
        content_type = getattr(upload, "content_type", None)

    if isinstance(data, str):
        data = data.encode("utf-8")
    guessed, _ = mimetypes.guess_type(filename or "")
    mime = (content_type or guessed or "application/octet-stream").split(";")[0].strip().lower()
    if mime in ("", "application/octet-stream"):
        mime = guessed or "image/jpeg"
    if mime == "image/jpg":
        mime = "image/jpeg"
    return (filename or "upload.bin", BytesIO(data), mime)


def submit_vehicle_change_request(token, form_data, files):
    from io import BytesIO

    headers = {"Authorization": f"Bearer {token}"}
    timeout = get_api_timeout()
    max_attempts = 2
    api_urls = get_api_urls()
    last_exc: RequestException | None = None
    response = None
    prepared_files = {key: _multipart_file_tuple(value) for key, value in files.items()}

    for api_url in api_urls:
        for attempt in range(max_attempts):
            try:
                retry_files = {
                    key: (name, BytesIO(buf.getvalue()), mime)
                    for key, (name, buf, mime) in prepared_files.items()
                }
                response = requests.post(
                    f"{api_url}{API_PREFIX}/drivers/me/vehicle-change",
                    headers=headers,
                    data=form_data,
                    files=retry_files,
                    timeout=timeout,
                )
                break
            except RequestException as exc:
                last_exc = exc
                retryable = isinstance(exc, (ReadTimeout, Timeout, RequestsConnectionError))
                if attempt < max_attempts - 1 and retryable:
                    time.sleep(2)
                    continue
                response = None
                break
        if response is not None:
            break

    if response is None:
        raise ApiError(_connection_error_message(api_urls, last_exc)) from last_exc
    if not response.ok:
        raise ApiError(_parse_error(response), response.status_code)
    return response.json() if response.content else {}


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


def complete_driver_ride(token, ride_id, metrics=None):
    payload = metrics or {}
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/rides/{ride_id}/complete",
        token=token,
        json=payload,
    )


def get_driver_nearby_demand(token):
    return _request("GET", f"{API_PREFIX}/drivers/demand/nearby", token=token)


def get_driver_performance(token):
    return _request("GET", f"{API_PREFIX}/drivers/performance", token=token)


def get_driver_payout_account(token):
    return _request("GET", f"{API_PREFIX}/drivers/payout-account", token=token)


def upsert_driver_payout_account(token, payload):
    return _request(
        "PUT",
        f"{API_PREFIX}/drivers/payout-account",
        token=token,
        json=payload,
    )


def get_driver_active_trip_navigation(token):
    return _request("GET", f"{API_PREFIX}/drivers/rides/active/navigation", token=token)


def get_driver_delivery_requests(token):
    return _request("GET", f"{API_PREFIX}/drivers/deliveries/requests", token=token)


def get_driver_active_delivery(token):
    return _request("GET", f"{API_PREFIX}/drivers/deliveries/active", token=token)


def accept_driver_delivery(token, delivery_id):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/deliveries/{delivery_id}/accept",
        token=token,
    )


def reject_driver_delivery(token, delivery_id):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/deliveries/{delivery_id}/reject",
        token=token,
    )


def start_driver_delivery(token, delivery_id):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/deliveries/{delivery_id}/start",
        token=token,
    )


def complete_driver_delivery(token, delivery_id):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/deliveries/{delivery_id}/complete",
        token=token,
        json={},
    )


def get_customer_profile_extras(token):
    return _request("GET", f"{API_PREFIX}/customers/profile-extras", token=token)


def update_customer_profile_extras(token, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/customers/profile-extras",
        token=token,
        json=payload,
    )


def cancel_driver_ride(token, ride_id, reason=None):
    payload = {}
    if reason:
        payload["reason"] = reason
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/rides/{ride_id}/cancel",
        token=token,
        json=payload,
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


def driver_settings_delete_request(token):
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/settings/delete-request",
        token=token,
    )


def submit_driver_support_ticket(token, category, description, trip_id=None):
    return create_support_ticket(
        token,
        {
            "category": category,
            "subject": category,
            "description": description,
            "ride_id": trip_id or None,
        },
    )


def admin_login(email, password):
    return _request(
        "POST",
        f"{API_PREFIX}/admin/auth/login",
        json={"email": email, "password": password},
    )


def register(full_name, phone, email, password, confirm_password=None, referral_code=None):
    if confirm_password is None:
        confirm_password = password
    payload = {
        "full_name": full_name,
        "phone": phone,
        "email": email,
        "password": password,
        "confirm_password": confirm_password,
    }
    if referral_code:
        payload["referral_code"] = referral_code
    return _request("POST", f"{API_PREFIX}/auth/register", json=payload)


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
    timeout = get_api_timeout()
    max_attempts = 2
    api_urls = get_api_urls()
    last_exc: RequestException | None = None
    response = None

    for api_url in api_urls:
        for attempt in range(max_attempts):
            try:
                file_storage.stream.seek(0)
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
                    continue
                response = None
                break
        if response is not None:
            break

    if response is None:
        raise ApiError(_connection_error_message(api_urls, last_exc)) from last_exc
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


def _ride_coords(pickup: str, dropoff: str) -> dict:
    from app.rider_defaults import resolve_location_coords
    from app.rider_api_transforms import infer_city

    pickup_coords = resolve_location_coords(pickup)
    dest_coords = resolve_location_coords(dropoff)
    return {
        "pickup_lat": pickup_coords["lat"],
        "pickup_lng": pickup_coords["lng"],
        "destination_lat": dest_coords["lat"],
        "destination_lng": dest_coords["lng"],
        "city": infer_city(pickup or dropoff),
    }


def _ride_payload(
    pickup,
    dropoff,
    pickup_lat,
    pickup_lng,
    dest_lat,
    dest_lng,
    tier="economy",
    stops=None,
    city=None,
    vehicle_category="car",
):
    from app.rider_api_transforms import infer_city

    payload = {
        "pickup_lat": float(pickup_lat),
        "pickup_lng": float(pickup_lng),
        "destination_lat": float(dest_lat),
        "destination_lng": float(dest_lng),
        "pickup_address": pickup,
        "destination_address": dropoff,
        "service_tier": tier,
        "vehicle_category": vehicle_category or "car",
        "city": city or infer_city(pickup or dropoff),
    }
    if stops:
        payload["stops"] = stops
    return payload


def estimate_ride(token, pickup, dropoff, tier="economy"):
    coords = _ride_coords(pickup, dropoff)
    return _request(
        "POST",
        f"{API_PREFIX}/rides/estimate",
        token=token,
        json={
            **coords,
            "pickup_address": pickup,
            "destination_address": dropoff,
            "service_tier": tier,
        },
    )


def estimate_ride_coords(
    token,
    pickup,
    dropoff,
    pickup_lat,
    pickup_lng,
    dest_lat,
    dest_lng,
    tier="economy",
    stops=None,
    city=None,
    vehicle_category="car",
):
    return _request(
        "POST",
        f"{API_PREFIX}/rides/estimate",
        token=token,
        json=_ride_payload(
            pickup,
            dropoff,
            pickup_lat,
            pickup_lng,
            dest_lat,
            dest_lng,
            tier=tier,
            stops=stops,
            city=city,
            vehicle_category=vehicle_category,
        ),
    )


def request_ride(token, pickup, dropoff, tier="economy"):
    coords = _ride_coords(pickup, dropoff)
    return _request(
        "POST",
        f"{API_PREFIX}/rides/request",
        token=token,
        json={
            **coords,
            "pickup_address": pickup,
            "destination_address": dropoff,
            "service_tier": tier,
        },
    )


def request_ride_coords(
    token,
    pickup,
    dropoff,
    pickup_lat,
    pickup_lng,
    dest_lat,
    dest_lng,
    tier="economy",
    stops=None,
    city=None,
    vehicle_category="car",
):
    return _request(
        "POST",
        f"{API_PREFIX}/rides/request",
        token=token,
        json=_ride_payload(
            pickup,
            dropoff,
            pickup_lat,
            pickup_lng,
            dest_lat,
            dest_lng,
            tier=tier,
            stops=stops,
            city=city,
            vehicle_category=vehicle_category,
        ),
    )


def get_current_ride(token):
    return _request("GET", f"{API_PREFIX}/rides/current", token=token)


def cancel_ride(token, ride_id, reason=None, reason_code=None):
    payload = {}
    if reason:
        payload["reason"] = reason
    if reason_code:
        payload["reason_code"] = reason_code
    return _request(
        "POST",
        f"{API_PREFIX}/rides/{ride_id}/cancel",
        token=token,
        json=payload,
    )


def estimate_delivery(
    token,
    pickup,
    dropoff,
    pickup_lat=None,
    pickup_lng=None,
    dest_lat=None,
    dest_lng=None,
    package_size="medium",
):
    if None not in (pickup_lat, pickup_lng, dest_lat, dest_lng):
        from app.rider_api_transforms import infer_city
        coords = {
            "pickup_lat": pickup_lat,
            "pickup_lng": pickup_lng,
            "destination_lat": dest_lat,
            "destination_lng": dest_lng,
            "city": infer_city(pickup or dropoff),
        }
    else:
        coords = _ride_coords(pickup, dropoff)
    return _request(
        "POST",
        f"{API_PREFIX}/deliveries/estimate",
        token=token,
        json={
            **coords,
            "pickup_address": pickup,
            "destination_address": dropoff,
            "package_size": package_size or "medium",
        },
    )


def get_delivery_pricing(token):
    return _request("GET", f"{API_PREFIX}/deliveries/pricing", token=token)


def request_delivery(
    token,
    pickup,
    dropoff,
    package_details,
    recipient_name,
    recipient_phone,
    pickup_lat=None,
    pickup_lng=None,
    dest_lat=None,
    dest_lng=None,
    package_size="medium",
):
    if None not in (pickup_lat, pickup_lng, dest_lat, dest_lng):
        from app.rider_api_transforms import infer_city
        coords = {
            "pickup_lat": pickup_lat,
            "pickup_lng": pickup_lng,
            "destination_lat": dest_lat,
            "destination_lng": dest_lng,
            "city": infer_city(pickup or dropoff),
        }
    else:
        coords = _ride_coords(pickup, dropoff)
    return _request(
        "POST",
        f"{API_PREFIX}/deliveries/request",
        token=token,
        json={
            **coords,
            "pickup_address": pickup,
            "destination_address": dropoff,
            "package_details": package_details,
            "package_size": package_size or "medium",
            "recipient_name": recipient_name,
            "recipient_phone": recipient_phone,
        },
    )


def get_current_delivery(token):
    return _request("GET", f"{API_PREFIX}/deliveries/current", token=token)


def cancel_delivery(token, delivery_id, reason=None, reason_code=None):
    payload = {}
    if reason:
        payload["reason"] = reason
    if reason_code:
        payload["reason_code"] = reason_code
    return _request(
        "POST",
        f"{API_PREFIX}/deliveries/{delivery_id}/cancel",
        token=token,
        json=payload,
    )


def list_scheduled_rides(token, page=1, limit=20):
    return _request(
        "GET",
        f"{API_PREFIX}/scheduled-rides",
        token=token,
        params={"page": page, "limit": limit},
    )


def create_scheduled_ride(token, payload):
    return _request(
        "POST",
        f"{API_PREFIX}/scheduled-rides",
        token=token,
        json=payload,
    )


def cancel_scheduled_ride(token, scheduled_id, reason=None):
    payload = {"reason": reason} if reason else {}
    return _request(
        "POST",
        f"{API_PREFIX}/scheduled-rides/{scheduled_id}/cancel",
        token=token,
        json=payload,
    )


def update_scheduled_ride(token, scheduled_id, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/scheduled-rides/{scheduled_id}",
        token=token,
        json=payload,
    )


def report_accident(token, payload):
    return _request(
        "POST",
        f"{API_PREFIX}/safety/accidents",
        token=token,
        json=payload,
    )


def get_admin_accident_reports(token):
    return _request("GET", f"{API_PREFIX}/admin/accidents", token=token)


def acknowledge_admin_accident(token, report_id):
    return _request(
        "POST",
        f"{API_PREFIX}/admin/accidents/{report_id}/acknowledge",
        token=token,
    )


def resolve_admin_accident(token, report_id, status_value="resolved", violation_fee_ngn=None):
    payload = {"status": status_value}
    if violation_fee_ngn is not None:
        payload["violation_fee_ngn"] = violation_fee_ngn
    return _request(
        "POST",
        f"{API_PREFIX}/admin/accidents/{report_id}/resolve",
        token=token,
        json=payload,
    )


def change_password(token, payload):
    return _request(
        "POST",
        f"{API_PREFIX}/auth/change-password",
        token=token,
        json=payload,
    )


def get_wallet(token):
    return _request("GET", f"{API_PREFIX}/wallet", token=token)


def get_account_policy(token):
    return _request("GET", f"{API_PREFIX}/wallet/account-policy", token=token)


def pay_cancellation_fee(token):
    return _request(
        "POST",
        f"{API_PREFIX}/wallet/pay-cancellation-fee",
        token=token,
        json={},
    )


def unlock_account(token):
    return _request(
        "POST",
        f"{API_PREFIX}/wallet/unlock-account",
        token=token,
        json={},
    )


def initialize_false_alarm_paystack(token, email=None, callback_url=None):
    payload = {}
    if email:
        payload["email"] = email
    if callback_url:
        payload["callback_url"] = callback_url
    return _request(
        "POST",
        f"{API_PREFIX}/wallet/false-alarm/paystack/initialize",
        token=token,
        json=payload,
    )


def pay_false_alarm_fee(token):
    return _request(
        "POST",
        f"{API_PREFIX}/wallet/pay-false-alarm-fee",
        token=token,
        json={},
    )


def get_wallet_transactions(token, page=1, limit=20):
    return _request(
        "GET",
        f"{API_PREFIX}/wallet/transactions",
        token=token,
        params={"page": page, "limit": limit},
    )


def get_rider_data_export(token):
    return _request("GET", f"{API_PREFIX}/settings/data-export", token=token)


def get_user_settings(token):
    return _request("GET", f"{API_PREFIX}/settings", token=token)


def update_user_settings(token, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/settings",
        token=token,
        json=payload,
    )


def list_notifications(token, page=1, limit=50):
    return _request(
        "GET",
        f"{API_PREFIX}/notifications",
        token=token,
        params={"page": page, "limit": limit},
    )


def mark_notification_read(token, notification_id):
    return _request(
        "POST",
        f"{API_PREFIX}/notifications/{notification_id}/read",
        token=token,
    )


def mark_all_notifications_read(token):
    return _request("POST", f"{API_PREFIX}/notifications/read-all", token=token)


def delete_notification(token, notification_id):
    return _request(
        "DELETE",
        f"{API_PREFIX}/notifications/{notification_id}",
        token=token,
    )


def delete_notifications(token, notification_ids):
    return _request(
        "POST",
        f"{API_PREFIX}/notifications/delete",
        token=token,
        json={"ids": list(notification_ids)},
    )


def clear_all_notifications(token):
    return _request("POST", f"{API_PREFIX}/notifications/clear-all", token=token)


def get_notification_preferences(token):
    return _request("GET", f"{API_PREFIX}/settings/notification-preferences", token=token)


def update_notification_preferences(token, payload):
    return _request(
        "PATCH",
        f"{API_PREFIX}/settings/notification-preferences",
        token=token,
        json=payload,
    )


def create_support_ticket(token, payload):
    return _request(
        "POST",
        f"{API_PREFIX}/support/tickets",
        token=token,
        json=payload,
    )


def list_support_tickets(token, page=1, limit=20):
    return _request(
        "GET",
        f"{API_PREFIX}/support/tickets",
        token=token,
        params={"page": page, "limit": limit},
    )


def start_ride(token, ride_id):
    return _request("POST", f"{API_PREFIX}/rides/{ride_id}/start", token=token)


def rate_driver(token, ride_id, rating, comment=None, **extra):
    """Legacy-compatible wrapper; prefers the two-sided ratings API."""
    payload = {
        "overall_stars": int(rating),
        **{k: v for k, v in (extra or {}).items() if v is not None},
    }
    if comment:
        payload["comment"] = comment
    try:
        return _request(
            "POST",
            f"{API_PREFIX}/ratings/rides/{ride_id}",
            token=token,
            json=payload,
        )
    except ApiError as exc:
        if getattr(exc, "status_code", None) not in (404, 405):
            raise
        legacy = {"rating": int(rating)}
        if comment:
            legacy["comment"] = comment
        return _request(
            "POST",
            f"{API_PREFIX}/rides/{ride_id}/rate-driver",
            token=token,
            json=legacy,
        )


def submit_trip_rating(token, ride_id, payload):
    """POST /api/v1/ratings/rides/{ride_id} — rider or driver rating."""
    body = dict(payload or {})
    if "overall_stars" not in body and body.get("rating") is not None:
        body["overall_stars"] = int(body.pop("rating"))
    return _request(
        "POST",
        f"{API_PREFIX}/ratings/rides/{ride_id}",
        token=token,
        json=body,
    )


def get_rating_eligibility(token, ride_id):
    return _request(
        "GET",
        f"{API_PREFIX}/ratings/rides/{ride_id}/eligibility",
        token=token,
    )


def get_my_rating_summary(token):
    return _request("GET", f"{API_PREFIX}/ratings/me", token=token)


def get_public_rating_summary(token, user_id):
    return _request(
        "GET",
        f"{API_PREFIX}/ratings/users/{user_id}/public",
        token=token,
    )


def trigger_ride_sos(token, ride_id, lat=None, lng=None, message=None):
    payload = {}
    if lat is not None:
        payload["lat"] = lat
    if lng is not None:
        payload["lng"] = lng
    if message:
        payload["message"] = message
    return _request(
        "POST",
        f"{API_PREFIX}/rides/{ride_id}/sos",
        token=token,
        json=payload,
    )


def emergency_stop_ride(token, ride_id, payload=None):
    """Rider ends an in-progress trip at the current location."""
    return _request(
        "POST",
        f"{API_PREFIX}/rides/{ride_id}/emergency-stop",
        token=token,
        json=payload or {},
    )


def ride_call_intent(token, ride_id, target="driver"):
    return _request(
        "POST",
        f"{API_PREFIX}/rides/{ride_id}/call-intent",
        token=token,
        json={"target": target},
    )


def ride_call_token(token, ride_id):
    return _request(
        "POST",
        f"{API_PREFIX}/rides/{ride_id}/call/token",
        token=token,
        json={},
    )


def ride_call_start(token, ride_id):
    return _request(
        "POST",
        f"{API_PREFIX}/rides/{ride_id}/call/start",
        token=token,
        json={},
    )


def ride_call_accept(token, ride_id):
    return _request(
        "POST",
        f"{API_PREFIX}/rides/{ride_id}/call/accept",
        token=token,
        json={},
    )


def ride_call_reject(token, ride_id):
    return _request(
        "POST",
        f"{API_PREFIX}/rides/{ride_id}/call/reject",
        token=token,
        json={},
    )


def ride_call_end(token, ride_id):
    return _request(
        "POST",
        f"{API_PREFIX}/rides/{ride_id}/call/end",
        token=token,
        json={},
    )


def ride_calls(token, ride_id):
    return _request(
        "GET",
        f"{API_PREFIX}/rides/{ride_id}/calls",
        token=token,
    )


def get_ride_messages(token, ride_id, page=1, limit=50):
    return _request(
        "GET",
        f"{API_PREFIX}/rides/{ride_id}/messages",
        token=token,
        params={"page": page, "limit": limit},
    )


def send_ride_message(token, ride_id, message):
    return _request(
        "POST",
        f"{API_PREFIX}/rides/{ride_id}/messages",
        token=token,
        json={"message": message},
    )


def initialize_paystack(token, amount_ngn, email=None, callback_url=None):
    payload = {"amount_ngn": amount_ngn}
    if email:
        payload["email"] = email
    if callback_url:
        payload["callback_url"] = callback_url
    return _request(
        "POST",
        f"{API_PREFIX}/wallet/paystack/initialize",
        token=token,
        json=payload,
    )


def verify_paystack(token, reference):
    return _request(
        "POST",
        f"{API_PREFIX}/wallet/paystack/verify",
        token=token,
        json={"reference": reference},
    )


def create_wallet_funding_request(token, amount_ngn, bank_name, account_name, proof_url=None):
    payload = {
        "amount_ngn": amount_ngn,
        "bank_name": bank_name,
        "account_name": account_name,
    }
    if proof_url:
        payload["proof_url"] = proof_url
    return _request(
        "POST",
        f"{API_PREFIX}/wallet/fund-request",
        token=token,
        json=payload,
    )


def withdraw_wallet(token, amount_ngn, bank_name, account_number, account_name, bank_code=None):
    payload = {
        "amount_ngn": amount_ngn,
        "bank_name": bank_name,
        "account_number": account_number,
        "account_name": account_name,
    }
    if bank_code:
        payload["bank_code"] = bank_code
    return _request(
        "POST",
        f"{API_PREFIX}/wallet/withdraw",
        token=token,
        json=payload,
    )


def list_paystack_banks(token):
    return _request("GET", f"{API_PREFIX}/wallet/banks", token=token)


def resolve_paystack_bank_account(token, account_number, bank_code):
    return _request(
        "POST",
        f"{API_PREFIX}/wallet/banks/resolve",
        token=token,
        json={"account_number": account_number, "bank_code": bank_code},
    )


def send_wallet_money(token, amount_ngn, recipient_phone):
    ident = recipient_phone
    return _request(
        "POST",
        f"{API_PREFIX}/wallet/send",
        token=token,
        json={
            "amount_ngn": amount_ngn,
            "recipient": ident,
            "recipient_phone": ident,
        },
    )


def lookup_wallet_recipient(token, phone):
    return _request(
        "GET",
        f"{API_PREFIX}/wallet/send/lookup",
        token=token,
        params={"q": phone, "phone": phone},
    )


def pause_account(token, pause_until):
    return _request(
        "POST",
        f"{API_PREFIX}/settings/account/pause",
        token=token,
        json={"pause_until": pause_until},
    )


def request_account_deactivation(token):
    return _request("POST", f"{API_PREFIX}/settings/account/deactivate-request", token=token)


def request_account_deletion(token):
    return _request("POST", f"{API_PREFIX}/settings/account/delete-request", token=token)


def register_device(token, device_token, platform="web"):
    return _request(
        "POST",
        f"{API_PREFIX}/devices/register",
        token=token,
        json={"device_token": device_token, "platform": platform},
    )


def set_availability(token, online, current_lat=None, current_lng=None):
    payload = {"is_online": bool(online)}
    if online:
        if current_lat is None or current_lng is None:
            raise ApiError("Location is required to go online. Enable GPS and try again.", 422)
        payload["current_lat"] = float(current_lat)
        payload["current_lng"] = float(current_lng)
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/availability",
        token=token,
        json=payload,
    )


def update_driver_location(token, lat, lng, accuracy=None, heading=None, speed=None):
    """Push live GPS to JCRide-back while the driver is online."""
    payload = {"lat": float(lat), "lng": float(lng)}
    if accuracy is not None:
        payload["accuracy"] = float(accuracy)
    if heading is not None:
        payload["heading"] = float(heading)
    if speed is not None:
        payload["speed"] = float(speed)
    return _request(
        "POST",
        f"{API_PREFIX}/drivers/location",
        token=token,
        json=payload,
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


def get_admin_vehicle_changes(token, status="pending", page=1, limit=20):
    params = {"page": page, "limit": limit}
    if status:
        params["status"] = status
    return _request("GET", f"{API_PREFIX}/admin/vehicle-changes", token=token, params=params)


def get_admin_vehicle_change(token, request_id):
    return _request("GET", f"{API_PREFIX}/admin/vehicle-changes/{request_id}", token=token)


def approve_admin_vehicle_change(token, request_id):
    return _request(
        "POST",
        f"{API_PREFIX}/admin/vehicle-changes/{request_id}/approve",
        token=token,
    )


def reject_admin_vehicle_change(token, request_id, reason=None):
    payload = {}
    if reason:
        payload["reason"] = reason
    return _request(
        "POST",
        f"{API_PREFIX}/admin/vehicle-changes/{request_id}/reject",
        token=token,
        json=payload,
    )


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


def cancel_admin_ride(token, ride_id, reason=None):
    payload = {}
    if reason:
        payload["reason"] = reason
    return _request(
        "POST",
        f"{API_PREFIX}/admin/rides/{ride_id}/cancel",
        token=token,
        json=payload,
    )


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


def get_public_trip_share(share_token: str):
    return _request("GET", f"{API_PREFIX}/public/trips/share", params={"s": share_token})


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


def get_admin_funding_requests(token, status=None, provider=None, page=1, limit=20):
    params = {"page": page, "limit": limit}
    if status:
        params["status"] = status
    if provider:
        params["provider"] = provider
    return _request("GET", f"{API_PREFIX}/admin/payments/funding-requests", token=token, params=params)


def approve_admin_funding_request(token, request_id):
    return _request(
        "POST",
        f"{API_PREFIX}/admin/payments/funding-requests/{request_id}/approve",
        token=token,
    )


def reject_admin_funding_request(token, request_id, reason):
    return _request(
        "POST",
        f"{API_PREFIX}/admin/payments/funding-requests/{request_id}/reject",
        token=token,
        json={"reason": reason},
    )


def get_admin_withdrawals(token, status=None, page=1, limit=20):
    params = {"page": page, "limit": limit}
    if status:
        params["status"] = status
    return _request("GET", f"{API_PREFIX}/admin/payments/withdrawals", token=token, params=params)


def approve_admin_withdrawal(token, withdrawal_id):
    return _request(
        "POST",
        f"{API_PREFIX}/admin/payments/withdrawals/{withdrawal_id}/approve",
        token=token,
    )


def mark_admin_withdrawal_paid(token, withdrawal_id):
    return _request(
        "POST",
        f"{API_PREFIX}/admin/payments/withdrawals/{withdrawal_id}/mark-paid",
        token=token,
    )


def reject_admin_withdrawal(token, withdrawal_id, reason):
    return _request(
        "POST",
        f"{API_PREFIX}/admin/payments/withdrawals/{withdrawal_id}/reject",
        token=token,
        json={"reason": reason},
    )


def get_admin_sos_alerts(token):
    return _request("GET", f"{API_PREFIX}/admin/sos", token=token)


def acknowledge_admin_sos(token, sos_id):
    return _request("POST", f"{API_PREFIX}/admin/sos/{sos_id}/acknowledge", token=token)


def resolve_admin_sos(token, sos_id, status="resolved", violation_fee_ngn=None):
    payload = {"status": status}
    if violation_fee_ngn is not None:
        payload["violation_fee_ngn"] = violation_fee_ngn
    return _request(
        "POST",
        f"{API_PREFIX}/admin/sos/{sos_id}/resolve",
        token=token,
        json=payload,
    )


def get_admin_report_trips(token, **kwargs):
    params = {k: v for k, v in kwargs.items() if v not in (None, "")}
    return _request("GET", f"{API_PREFIX}/admin/reports/trips", token=token, params=params)


def get_admin_report_drivers(token, **kwargs):
    params = {k: v for k, v in kwargs.items() if v not in (None, "")}
    return _request("GET", f"{API_PREFIX}/admin/reports/drivers", token=token, params=params)


def get_admin_report_users(token, **kwargs):
    params = {k: v for k, v in kwargs.items() if v not in (None, "")}
    return _request("GET", f"{API_PREFIX}/admin/reports/users", token=token, params=params)


# ── Customer features (Phase 14) ──


def forgot_password(email_or_phone):
    return _request(
        "POST",
        f"{API_PREFIX}/auth/forgot-password",
        json={"email_or_phone": email_or_phone},
    )


def reset_password(email_or_phone, code, new_password, confirm_password):
    return _request(
        "POST",
        f"{API_PREFIX}/auth/reset-password",
        json={
            "email_or_phone": email_or_phone,
            "code": code,
            "new_password": new_password,
            "confirm_password": confirm_password,
        },
    )


def get_customer_dashboard(token):
    return _request("GET", f"{API_PREFIX}/customers/dashboard", token=token)


def get_customer_dashboard_summary(token):
    # Backend exposes GET /customers/dashboard (flat stats + recent_activities).
    return get_customer_dashboard(token)


def list_customer_rides(token, page=1, limit=50, search=None, booking_id=None, status=None):
    params = {"page": page, "limit": limit}
    if search:
        params["search"] = search
    if booking_id:
        params["booking_id"] = booking_id
    if status:
        params["status"] = status
    return _request("GET", f"{API_PREFIX}/customers/rides", token=token, params=params)


def get_nearby_drivers(token, lat, lng, service_tier=None, vehicle_category=None, radius_km=1500):
    params = {
        "lat": lat,
        "lng": lng,
        "radius_km": radius_km,
    }
    if service_tier:
        params["service_tier"] = service_tier
    if vehicle_category:
        params["vehicle_category"] = vehicle_category
    return _request(
        "GET",
        f"{API_PREFIX}/rides/nearby-drivers",
        token=token,
        params=params,
    )


def get_referral_info(token):
    return _request("GET", f"{API_PREFIX}/referrals/me", token=token)


def search_rider(token, query, limit=20):
    return _request(
        "GET",
        f"{API_PREFIX}/search",
        token=token,
        params={"q": query, "limit": limit},
    )


def get_support_faq():
    return _request("GET", f"{API_PREFIX}/public/support/faq")


def create_live_chat_session(token):
    return _request("POST", f"{API_PREFIX}/support/live-chat/session", token=token)


def list_saved_locations(token):
    return _request("GET", f"{API_PREFIX}/customers/saved-locations", token=token)


def create_saved_location(token, payload):
    return _request("POST", f"{API_PREFIX}/customers/saved-locations", token=token, json=payload)


def delete_saved_location(token, location_id):
    return _request("DELETE", f"{API_PREFIX}/customers/saved-locations/{location_id}", token=token)


def list_trusted_contacts(token):
    return _request("GET", f"{API_PREFIX}/customers/contacts", token=token)


def create_trusted_contact(token, payload):
    return _request("POST", f"{API_PREFIX}/customers/contacts", token=token, json=payload)


def delete_trusted_contact(token, contact_id):
    return _request("DELETE", f"{API_PREFIX}/customers/contacts/{contact_id}", token=token)


def create_ride_share_link(token, ride_id):
    return _request("POST", f"{API_PREFIX}/rides/{ride_id}/share", token=token)
