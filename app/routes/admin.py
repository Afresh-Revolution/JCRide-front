from app.admin_bike_delivery_transforms import (
    normalize_bike_pricing,
    normalize_bike_rider,
    normalize_bike_riders_list,
)
from app.admin_bike_delivery_defaults import (
    EMPTY_BIKE_DELIVERY_PRICING,
    EMPTY_BIKE_DELIVERY_RIDERS,
    EMPTY_BIKE_DELIVERY_STATS,
    EMPTY_BIKE_DELIVERY_ZONES,
)
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Blueprint, flash, get_flashed_messages, jsonify, redirect, render_template, request, session, url_for

from app.services.api_client import (
    ApiError,
    admin_login,
    get_admin_live_trips,
    get_admin_revenue,
    get_admin_ride_tiers,
    get_admin_stats,
    get_admin_users,
    get_admin_user,
    invite_admin_user,
    delete_admin_user,
    update_admin_user_status,
    get_admin_drivers,
    get_admin_driver,
    get_admin_driver_stats,
    update_admin_driver_status,
    delete_admin_driver,
    get_admin_bike_delivery_stats,
    get_admin_bike_delivery_pricing,
    get_admin_bike_delivery_zones,
    get_admin_bike_delivery_riders,
    get_admin_bike_delivery_rider,
    onboard_admin_bike_rider,
    update_admin_bike_rider_status,
    get_admin_trips_map,
    get_admin_trips,
    get_admin_payment_stats,
    get_admin_payment_transactions,
    settle_admin_payments,
    get_admin_wallet_stats,
    get_admin_wallet_holders,
    get_admin_analytics_daily_rides,
    get_admin_analytics_success_rate,
    get_admin_analytics_growth,
    get_admin_analytics_heatmap,
    get_admin_analytics_cities,
    get_admin_support_tickets,
    get_admin_support_sla,
    get_admin_support_agents,
    update_admin_support_ticket,
    get_admin_ops_notifications,
    mark_admin_ops_notifications_read,
    get_admin_ops_notification_settings,
    update_admin_ops_notification_settings,
    get_admin_platform_settings,
    update_admin_platform_settings,
    get_admin_bike_delivery_settings,
    update_admin_bike_delivery_settings,
    get_admin_landing_page,
    update_admin_landing_page,
    get_admin_funding_requests,
    approve_admin_funding_request,
    reject_admin_funding_request,
    get_admin_withdrawals,
    approve_admin_withdrawal,
    mark_admin_withdrawal_paid,
    reject_admin_withdrawal,
    get_admin_sos_alerts,
    acknowledge_admin_sos,
    resolve_admin_sos,
    get_admin_report_trips,
    get_admin_report_drivers,
    get_admin_report_users,
)
from app.services.landing_content import merge_landing_page
from app.admin_api_transforms import (
    live_trips_to_map,
    normalize_admin_trips_list,
    normalize_dashboard_stats,
    normalize_daily_rides,
    normalize_city_performance,
    normalize_growth,
    normalize_heatmap,
    normalize_revenue,
    normalize_ride_tiers,
    normalize_success_rate,
)
from app.admin_ops_transforms import (
    normalize_funding_list,
    normalize_report_list,
    normalize_sos_list,
    normalize_withdrawal_list,
)
from app.admin_defaults import build_empty_admin_stats
from app.services.navigation_guard import (
    grant_admin_entry,
    has_admin_entry,
    revoke_admin_entry,
)

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

EMPTY_STATS = build_empty_admin_stats()


def admin_entry_required(view):
    @wraps(view)
    def wrapped(**kwargs):
        if not has_admin_entry():
            return redirect(url_for("main.home"))
        return view(**kwargs)

    return wrapped


def _normalize_live_trips_payload(raw):
    if isinstance(raw, list):
        return live_trips_to_map(raw)
    if isinstance(raw, dict):
        markers = raw.get("markers") or []
        if markers:
            return raw
    return live_trips_to_map([])


def _load_dashboard_stats(token):
    try:
        return normalize_dashboard_stats(get_admin_stats(token))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            raise
        return EMPTY_STATS


def _load_live_trips_map(token):
    try:
        return _normalize_live_trips_payload(get_admin_live_trips(token))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            raise
        return live_trips_to_map([])


def _payment_stat_card(amount_ngn, transaction_count, provider_label=None):
    card = {
        "amount_ngn": round(float(amount_ngn or 0), 2),
        "transaction_count": int(transaction_count or 0),
    }
    if provider_label:
        card["provider_label"] = provider_label
    return card


def _parse_tx_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _payment_stats_fallback(token):
    """Build 24h KPIs from transactions when the dedicated stats API is unavailable."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    page = 1
    limit = 200
    rows = []
    while page <= 10:
        data = get_admin_payment_transactions(token, page=page, limit=limit)
        batch = data.get("transactions") or []
        rows.extend(batch)
        if page >= int(data.get("total_pages") or 1):
            break
        page += 1

    recent = []
    for tx in rows:
        created = _parse_tx_datetime(tx.get("created_at"))
        if created and created >= cutoff:
            recent.append(tx)

    successful = [tx for tx in recent if tx.get("status") == "success"]
    failed = [tx for tx in recent if tx.get("status") == "failed"]
    funding = [tx for tx in successful if tx.get("type_label") == "Wallet funding"]
    refunds = [tx for tx in successful if tx.get("type_label") == "Refund"]

    return {
        "successful_24h": _payment_stat_card(
            sum(float(tx.get("amount_ngn") or 0) for tx in successful),
            len(successful),
        ),
        "failed_24h": _payment_stat_card(
            sum(float(tx.get("amount_ngn") or 0) for tx in failed),
            len(failed),
        ),
        "wallet_funding_24h": _payment_stat_card(
            sum(float(tx.get("amount_ngn") or 0) for tx in funding),
            len(funding),
            "paystack",
        ),
        "refunds_24h": _payment_stat_card(
            sum(float(tx.get("amount_ngn") or 0) for tx in refunds),
            len(refunds),
        ),
    }


def _wallet_stats_fallback(token):
    """Build wallet KPIs when /wallet/stats is unavailable on the API."""
    holders_data = get_admin_wallet_holders(token, page=1, limit=500, sort="balance")
    total_funds = sum(float(item.get("balance_ngn") or 0) for item in holders_data.get("items") or [])
    try:
        payment_stats = get_admin_payment_stats(token)
    except ApiError as exc:
        if exc.status_code != 404:
            raise
        payment_stats = _payment_stats_fallback(token)

    funding = payment_stats.get("wallet_funding_24h") or {}
    refunds = payment_stats.get("refunds_24h") or {}
    successful = payment_stats.get("successful_24h") or {}

    inflow_count = int(funding.get("transaction_count") or 0)
    refund_count = int(refunds.get("transaction_count") or 0)
    outflow_amount = max(
        float(successful.get("amount_ngn") or 0) - float(funding.get("amount_ngn") or 0),
        0,
    )

    return {
        "total_wallet_funds": round(total_funds, 2),
        "inflow_24h": {
            "amount_ngn": float(funding.get("amount_ngn") or 0),
            "transaction_count": inflow_count,
            "trend_label": f"{inflow_count:,} fundings",
        },
        "outflow_24h": {
            "amount_ngn": outflow_amount,
            "transaction_count": None,
            "trend_label": "Trips + payouts",
        },
        "auto_refunds_24h": {
            "amount_ngn": float(refunds.get("amount_ngn") or 0),
            "transaction_count": refund_count,
            "trend_label": "Per-km reconciliation",
        },
    }


def admin_required(view):
    @wraps(view)
    def wrapped(**kwargs):
        if not has_admin_entry():
            return redirect(url_for("main.home"))
        if not session.get("admin_token"):
            flash("Please sign in to the admin portal.", "error")
            return redirect(url_for("admin.login_page"))
        return view(**kwargs)

    return wrapped


def _admin_token():
    return session.get("admin_token")


def _handle_api_error(exc: ApiError):
    """Only auth failures should interrupt the admin session."""
    if exc.status_code in {401, 403}:
        session.pop("admin_token", None)
        session.pop("admin_email", None)
        flash("Session expired. Please sign in again.", "error")
        return redirect(url_for("admin.login_page"))
    return None


def _login_flash_messages():
    """Keep a single, most-recent banner on the login page."""
    messages = get_flashed_messages(with_categories=True)
    if not messages:
        return
    category, message = messages[-1]
    flash(message, category)


@admin_bp.route("/enter", methods=["POST"])
def enter_portal():
    grant_admin_entry()
    if session.get("admin_token"):
        return redirect(url_for("admin.dashboard"))
    return redirect(url_for("admin.login_page"))


@admin_bp.route("/login", methods=["GET", "POST"])
@admin_entry_required
def login_page():
    if session.get("admin_token"):
        return redirect(url_for("admin.dashboard"))

    email = ""
    if request.method == "GET":
        _login_flash_messages()

    if request.method == "POST":
        get_flashed_messages()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")

        try:
            result = admin_login(email, password)
            session["admin_token"] = result.get("access_token")
            session["admin_email"] = email
            grant_admin_entry()
            flash("Signed in successfully.", "success")
            return redirect(url_for("admin.dashboard"))
        except ApiError as exc:
            flash(exc.message, "error")

    return render_template("admin/login.html", email=email)


@admin_bp.route("/")
@admin_required
def dashboard():
    token = _admin_token()
    try:
        stats = _load_dashboard_stats(token)
        live_trips = _load_live_trips_map(token)
    except ApiError as exc:
        redirect_response = _handle_api_error(exc)
        if redirect_response:
            return redirect_response
        stats = EMPTY_STATS
        live_trips = live_trips_to_map([])

    return render_template(
        "admin/dashboard.html",
        active_page="dashboard",
        stats=stats,
        live_trips=live_trips,
    )


@admin_bp.route("/users")
@admin_required
def users():
    return render_template("admin/users.html", active_page="users")


@admin_bp.route("/drivers")
@admin_required
def drivers():
    return render_template("admin/drivers.html", active_page="drivers")


@admin_bp.route("/bike-delivery")
@admin_required
def bike_delivery():
    return render_template("admin/bike_delivery.html", active_page="bike_delivery")


@admin_bp.route("/trips")
@admin_required
def trips():
    return render_template("admin/trips.html", active_page="trips")


@admin_bp.route("/payments")
@admin_required
def payments():
    return render_template("admin/payments.html", active_page="payments")


@admin_bp.route("/wallets")
@admin_required
def wallets():
    return render_template("admin/wallets.html", active_page="wallets")


@admin_bp.route("/support")
@admin_required
def support():
    return render_template("admin/support.html", active_page="support")


@admin_bp.route("/notifications")
@admin_required
def notifications():
    return render_template("admin/notifications.html", active_page="notifications")


@admin_bp.route("/sos")
@admin_required
def sos_page():
    return render_template("admin/sos.html", active_page="sos")


@admin_bp.route("/reports")
@admin_required
def reports_page():
    return render_template("admin/reports.html", active_page="reports")


@admin_bp.route("/analytics")
@admin_required
def analytics():
    return render_template("admin/analytics.html", active_page="analytics")


@admin_bp.route("/settings")
@admin_required
def settings_page():
    return render_template("admin/settings.html", active_page="settings")


@admin_bp.route("/api/wallets/stats")
@admin_required
def api_wallet_stats():
    token = _admin_token()
    try:
        return jsonify(get_admin_wallet_stats(token))
    except ApiError as exc:
        if exc.status_code == 404:
            try:
                return jsonify(_wallet_stats_fallback(token))
            except ApiError as fallback_exc:
                return jsonify({"message": fallback_exc.message}), fallback_exc.status_code
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/wallets/holders")
@admin_required
def api_wallet_holders():
    search = request.args.get("search", "")
    sort = request.args.get("sort", "balance")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 12, type=int)
    try:
        return jsonify(
            get_admin_wallet_holders(
                _admin_token(),
                search=search,
                sort=sort,
                page=page,
                limit=limit,
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/payments/stats")
@admin_required
def api_payment_stats():
    token = _admin_token()
    try:
        return jsonify(get_admin_payment_stats(token))
    except ApiError as exc:
        if exc.status_code == 404:
            try:
                return jsonify(_payment_stats_fallback(token))
            except ApiError as fallback_exc:
                return jsonify({"message": fallback_exc.message}), fallback_exc.status_code
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/payments/transactions")
@admin_required
def api_payment_transactions():
    search = request.args.get("search", "")
    status = request.args.get("status")
    category = request.args.get("category") or request.args.get("type")
    transaction_type = None
    category_values = {
        "ride_payment",
        "wallet_funding",
        "refund",
        "withdrawal",
        "driver_earning",
        "admin_commission",
        "adjustment",
    }
    if category not in category_values:
        transaction_type = category
        category = request.args.get("category")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)
    try:
        return jsonify(
            get_admin_payment_transactions(
                _admin_token(),
                search=search,
                status=status,
                category=category,
                transaction_type=transaction_type,
                date_from=date_from,
                date_to=date_to,
                page=page,
                limit=limit,
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/payments/settle", methods=["POST"])
@admin_required
def api_payment_settle():
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            settle_admin_payments(
                _admin_token(),
                amount_ngn=payload.get("amount_ngn"),
                notes=payload.get("notes"),
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/payments/funding-requests")
@admin_required
def api_funding_requests():
    status = request.args.get("status")
    provider = request.args.get("provider")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)
    try:
        return jsonify(
            normalize_funding_list(
                get_admin_funding_requests(
                    _admin_token(),
                    status=status,
                    provider=provider,
                    page=page,
                    limit=limit,
                )
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/payments/funding-requests/<request_id>/approve", methods=["POST"])
@admin_required
def api_approve_funding_request(request_id):
    try:
        return jsonify(approve_admin_funding_request(_admin_token(), request_id))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/payments/funding-requests/<request_id>/reject", methods=["POST"])
@admin_required
def api_reject_funding_request(request_id):
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            reject_admin_funding_request(
                _admin_token(),
                request_id,
                payload.get("reason", ""),
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/payments/withdrawals")
@admin_required
def api_withdrawals():
    status = request.args.get("status")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)
    try:
        return jsonify(
            normalize_withdrawal_list(
                get_admin_withdrawals(_admin_token(), status=status, page=page, limit=limit)
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/payments/withdrawals/<withdrawal_id>/approve", methods=["POST"])
@admin_required
def api_approve_withdrawal(withdrawal_id):
    try:
        return jsonify(approve_admin_withdrawal(_admin_token(), withdrawal_id))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/payments/withdrawals/<withdrawal_id>/mark-paid", methods=["POST"])
@admin_required
def api_mark_withdrawal_paid(withdrawal_id):
    try:
        return jsonify(mark_admin_withdrawal_paid(_admin_token(), withdrawal_id))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/payments/withdrawals/<withdrawal_id>/reject", methods=["POST"])
@admin_required
def api_reject_withdrawal(withdrawal_id):
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            reject_admin_withdrawal(
                _admin_token(),
                withdrawal_id,
                payload.get("reason", ""),
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/sos")
@admin_required
def api_sos_list():
    try:
        return jsonify(normalize_sos_list(get_admin_sos_alerts(_admin_token())))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/sos/<sos_id>/acknowledge", methods=["POST"])
@admin_required
def api_sos_acknowledge(sos_id):
    try:
        return jsonify(acknowledge_admin_sos(_admin_token(), sos_id))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/sos/<sos_id>/resolve", methods=["POST"])
@admin_required
def api_sos_resolve(sos_id):
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            resolve_admin_sos(
                _admin_token(),
                sos_id,
                status=payload.get("status", "resolved"),
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/reports/trips")
@admin_required
def api_report_trips():
    try:
        data = get_admin_report_trips(
            _admin_token(),
            date_from=request.args.get("date_from"),
            date_to=request.args.get("date_to"),
            status=request.args.get("status"),
            city=request.args.get("city"),
            service_tier=request.args.get("service_tier"),
            vehicle_category=request.args.get("vehicle_category"),
            page=request.args.get("page", 1, type=int),
            limit=request.args.get("limit", 50, type=int),
        )
        return jsonify(normalize_report_list(data, report_type="trips"))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/reports/drivers")
@admin_required
def api_report_drivers():
    try:
        data = get_admin_report_drivers(
            _admin_token(),
            status=request.args.get("status"),
            service_tier=request.args.get("service_tier"),
            vehicle_category=request.args.get("vehicle_category"),
            city=request.args.get("city"),
            rating_min=request.args.get("rating_min", type=float),
            page=request.args.get("page", 1, type=int),
            limit=request.args.get("limit", 50, type=int),
        )
        return jsonify(normalize_report_list(data, report_type="drivers"))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/reports/users")
@admin_required
def api_report_users():
    try:
        data = get_admin_report_users(
            _admin_token(),
            status=request.args.get("status"),
            date_from=request.args.get("date_from"),
            date_to=request.args.get("date_to"),
            search=request.args.get("search", ""),
            page=request.args.get("page", 1, type=int),
            limit=request.args.get("limit", 50, type=int),
        )
        return jsonify(normalize_report_list(data, report_type="users"))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/trips/map")
@admin_required
def api_trips_map():
    try:
        return jsonify(_normalize_live_trips_payload(get_admin_live_trips(_admin_token())))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(live_trips_to_map([]))


@admin_bp.route("/api/trips")
@admin_required
def api_trips():
    status = request.args.get("status", "all")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)
    fetch_status = "all" if status == "active" else status
    fetch_limit = max(limit, 100) if status == "active" else limit
    try:
        data = get_admin_trips(_admin_token(), status=fetch_status, page=page, limit=fetch_limit)
        normalized = normalize_admin_trips_list(data, status_filter=status)
        if status == "active":
            normalized["trips"] = normalized["trips"][:limit]
        return jsonify(normalized)
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/drivers/stats")
@admin_required
def api_driver_stats():
    try:
        return jsonify(get_admin_driver_stats(_admin_token()))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/drivers")
@admin_required
def api_drivers():
    search = request.args.get("search", "")
    status = request.args.get("status")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)
    try:
        return jsonify(
            get_admin_drivers(_admin_token(), search=search, status=status, page=page, limit=limit)
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/drivers/<driver_id>")
@admin_required
def api_driver_detail(driver_id):
    try:
        return jsonify(get_admin_driver(_admin_token(), driver_id))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/drivers/<driver_id>/status", methods=["PATCH"])
@admin_required
def api_driver_status(driver_id):
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(update_admin_driver_status(_admin_token(), driver_id, payload.get("status")))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/drivers/<driver_id>", methods=["DELETE"])
@admin_required
def api_delete_driver(driver_id):
    try:
        delete_admin_driver(_admin_token(), driver_id)
        return "", 204
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/vehicle-changes")
@admin_required
def api_vehicle_changes():
    try:
        from app.services.api_client import get_admin_vehicle_changes

        return jsonify(
            get_admin_vehicle_changes(
                _admin_token(),
                status=request.args.get("status", "pending"),
                page=int(request.args.get("page", 1)),
                limit=int(request.args.get("limit", 20)),
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/vehicle-changes/<request_id>")
@admin_required
def api_vehicle_change_detail(request_id):
    try:
        from app.services.api_client import get_admin_vehicle_change

        return jsonify(get_admin_vehicle_change(_admin_token(), request_id))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/vehicle-changes/<request_id>/approve", methods=["POST"])
@admin_required
def api_approve_vehicle_change(request_id):
    try:
        from app.services.api_client import approve_admin_vehicle_change

        return jsonify(approve_admin_vehicle_change(_admin_token(), request_id))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/vehicle-changes/<request_id>/reject", methods=["POST"])
@admin_required
def api_reject_vehicle_change(request_id):
    payload = request.get_json(silent=True) or {}
    try:
        from app.services.api_client import reject_admin_vehicle_change

        return jsonify(
            reject_admin_vehicle_change(
                _admin_token(),
                request_id,
                reason=payload.get("reason"),
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/bike-delivery/stats")
@admin_required
def api_bike_delivery_stats():
    try:
        return jsonify(get_admin_bike_delivery_stats(_admin_token()))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(EMPTY_BIKE_DELIVERY_STATS)


@admin_bp.route("/api/bike-delivery/pricing")
@admin_required
def api_bike_delivery_pricing():
    try:
        return jsonify(normalize_bike_pricing(get_admin_bike_delivery_pricing(_admin_token())))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(normalize_bike_pricing(EMPTY_BIKE_DELIVERY_PRICING))


@admin_bp.route("/api/bike-delivery/zones")
@admin_required
def api_bike_delivery_zones():
    try:
        return jsonify(get_admin_bike_delivery_zones(_admin_token()))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(EMPTY_BIKE_DELIVERY_ZONES)


@admin_bp.route("/api/bike-delivery/riders", methods=["GET"])
@admin_required
def api_bike_delivery_riders():
    search = request.args.get("search", "")
    status = request.args.get("status")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)
    try:
        return jsonify(
            normalize_bike_riders_list(
                get_admin_bike_delivery_riders(
                    _admin_token(), search=search, status=status, page=page, limit=limit
                )
            )
        )
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        payload = dict(EMPTY_BIKE_DELIVERY_RIDERS)
        payload["page"] = page
        payload["limit"] = limit
        return jsonify(normalize_bike_riders_list(payload))


@admin_bp.route("/api/bike-delivery/riders", methods=["POST"])
@admin_required
def api_bike_delivery_onboard():
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(normalize_bike_rider(onboard_admin_bike_rider(_admin_token(), payload))), 201
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/bike-delivery/riders/<rider_id>")
@admin_required
def api_bike_delivery_rider_detail(rider_id):
    try:
        return jsonify(normalize_bike_rider(get_admin_bike_delivery_rider(_admin_token(), rider_id)))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/bike-delivery/riders/<rider_id>/status", methods=["PATCH"])
@admin_required
def api_bike_delivery_rider_status(rider_id):
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            normalize_bike_rider(
                update_admin_bike_rider_status(_admin_token(), rider_id, payload.get("status"))
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/users")
@admin_required
def api_users():
    search = request.args.get("search", "")
    status = request.args.get("status")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)
    try:
        return jsonify(get_admin_users(_admin_token(), search=search, status=status, page=page, limit=limit))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/users/invite-admin", methods=["POST"])
@admin_required
def api_invite_admin():
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(
            invite_admin_user(
                _admin_token(),
                payload.get("name", ""),
                payload.get("email", ""),
                payload.get("password", ""),
            )
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/users/<user_id>")
@admin_required
def api_user_detail(user_id):
    try:
        return jsonify(get_admin_user(_admin_token(), user_id))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/users/<user_id>/status", methods=["PATCH"])
@admin_required
def api_user_status(user_id):
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(update_admin_user_status(_admin_token(), user_id, payload.get("status")))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/users/<user_id>", methods=["DELETE"])
@admin_required
def api_delete_user(user_id):
    try:
        delete_admin_user(_admin_token(), user_id)
        return "", 204
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/revenue")
@admin_required
def api_revenue():
    period = request.args.get("period", "1Y")
    try:
        return jsonify(normalize_revenue(get_admin_revenue(_admin_token(), period), period))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(normalize_revenue([], period))


@admin_bp.route("/api/ride-tiers")
@admin_required
def api_ride_tiers():
    try:
        return jsonify(normalize_ride_tiers(get_admin_ride_tiers(_admin_token())))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(normalize_ride_tiers({}))


@admin_bp.route("/api/live-trips")
@admin_required
def api_live_trips():
    try:
        return jsonify(_normalize_live_trips_payload(get_admin_live_trips(_admin_token())))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(live_trips_to_map([]))


@admin_bp.route("/api/stats")
@admin_required
def api_stats():
    try:
        return jsonify(normalize_dashboard_stats(get_admin_stats(_admin_token())))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        if exc.status_code == 404:
            return jsonify(EMPTY_STATS)
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/support/tickets")
@admin_required
def api_support_tickets():
    status = request.args.get("status")
    search = request.args.get("search", "")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 20, type=int)
    try:
        return jsonify(
            get_admin_support_tickets(_admin_token(), status=status, search=search, page=page, limit=limit)
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/support/sla")
@admin_required
def api_support_sla():
    try:
        return jsonify(get_admin_support_sla(_admin_token()))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/support/agents")
@admin_required
def api_support_agents():
    try:
        return jsonify(get_admin_support_agents(_admin_token()))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/support/tickets/<ticket_id>", methods=["PATCH"])
@admin_required
def api_support_ticket_update(ticket_id):
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(update_admin_support_ticket(_admin_token(), ticket_id, payload))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/notifications/ops")
@admin_required
def api_ops_notifications():
    severity = request.args.get("severity")
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 50, type=int)
    try:
        return jsonify(
            get_admin_ops_notifications(_admin_token(), severity=severity, page=page, limit=limit)
        )
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/notifications/ops/mark-all-read", methods=["POST"])
@admin_required
def api_ops_mark_all_read():
    try:
        return jsonify(mark_admin_ops_notifications_read(_admin_token()))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/notifications/ops/settings")
@admin_required
def api_ops_notification_settings():
    try:
        return jsonify(get_admin_ops_notification_settings(_admin_token()))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/notifications/ops/settings", methods=["PATCH"])
@admin_required
def api_ops_notification_settings_update():
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(update_admin_ops_notification_settings(_admin_token(), payload))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/analytics/daily-rides")
@admin_required
def api_analytics_daily_rides():
    days = request.args.get("days", 14, type=int)
    try:
        return jsonify(normalize_daily_rides(get_admin_analytics_daily_rides(_admin_token(), days=days)))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(normalize_daily_rides({}))


@admin_bp.route("/api/analytics/success-rate")
@admin_required
def api_analytics_success_rate():
    try:
        return jsonify(normalize_success_rate(get_admin_analytics_success_rate(_admin_token())))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(normalize_success_rate({}))


@admin_bp.route("/api/analytics/growth")
@admin_required
def api_analytics_growth():
    try:
        return jsonify(normalize_growth(get_admin_analytics_growth(_admin_token())))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(normalize_growth({}))


@admin_bp.route("/api/analytics/cities")
@admin_required
def api_analytics_cities():
    try:
        return jsonify(normalize_city_performance(get_admin_analytics_cities(_admin_token())))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(normalize_city_performance([]))


@admin_bp.route("/api/analytics/tier-split")
@admin_required
def api_analytics_tier_split():
    try:
        return jsonify(normalize_ride_tiers(get_admin_ride_tiers(_admin_token())))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(normalize_ride_tiers({}))


@admin_bp.route("/api/analytics/heatmap")
@admin_required
def api_analytics_heatmap():
    city = request.args.get("city") or "Lagos"
    try:
        data = get_admin_analytics_heatmap(_admin_token(), city=city)
        return jsonify(normalize_heatmap(data))
    except ApiError as exc:
        if exc.status_code in {401, 403}:
            return jsonify({"message": exc.message}), exc.status_code
        return jsonify(normalize_heatmap({"city": city, "cols": 11, "cells": [], "max_value": 0}))


@admin_bp.route("/api/settings/platform")
@admin_required
def api_platform_settings():
    try:
        return jsonify(get_admin_platform_settings(_admin_token()))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/settings/platform", methods=["PATCH"])
@admin_required
def api_platform_settings_update():
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(update_admin_platform_settings(_admin_token(), payload))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/settings/bike-delivery")
@admin_required
def api_bike_delivery_settings():
    try:
        return jsonify(get_admin_bike_delivery_settings(_admin_token()))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/settings/bike-delivery", methods=["PATCH"])
@admin_required
def api_bike_delivery_settings_update():
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(update_admin_bike_delivery_settings(_admin_token(), payload))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/settings/landing-page")
@admin_required
def api_landing_page_settings():
    try:
        return jsonify(merge_landing_page(get_admin_landing_page(_admin_token())))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/api/settings/landing-page", methods=["PATCH"])
@admin_required
def api_landing_page_settings_update():
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(merge_landing_page(update_admin_landing_page(_admin_token(), payload)))
    except ApiError as exc:
        return jsonify({"message": exc.message}), exc.status_code


@admin_bp.route("/logout")
def logout():
    session.pop("admin_token", None)
    session.pop("admin_email", None)
    revoke_admin_entry()
    flash("Signed out of admin portal.", "success")
    return redirect(url_for("main.home"))
