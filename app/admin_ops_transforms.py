"""Normalize admin ops payloads (queues, SOS, reports) for templates and JS."""

from __future__ import annotations


def _short_id(value: str | None) -> str:
    if not value:
        return "-"
    text = str(value).replace("-", "")
    return text[:8].upper()


def normalize_funding_list(data: dict) -> dict:
    items = []
    for row in data.get("items") or []:
        if not isinstance(row, dict):
            continue
        provider = str(row.get("provider") or "manual")
        items.append(
            {
                "id": row.get("id"),
                "user_id": row.get("user_id"),
                "user_short": _short_id(row.get("user_id")),
                "amount_ngn": float(row.get("amount_ngn") or 0),
                "bank_name": row.get("bank_name") or "-",
                "account_name": row.get("account_name") or "-",
                "reference": row.get("reference") or "-",
                "proof_url": row.get("proof_url"),
                "status": row.get("status") or "pending",
                "provider": provider,
                "can_approve": provider == "manual" and row.get("status") == "pending",
                "rejection_reason": row.get("rejection_reason"),
                "created_at": row.get("created_at"),
                "reviewed_at": row.get("reviewed_at"),
            }
        )
    total = int(data.get("total") or len(items))
    limit = int(data.get("limit") or 20)
    page = int(data.get("page") or 1)
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": max(1, (total + limit - 1) // limit) if total else 1,
    }


def normalize_withdrawal_list(data: dict) -> dict:
    items = []
    for row in data.get("items") or []:
        if not isinstance(row, dict):
            continue
        status = str(row.get("status") or "pending")
        items.append(
            {
                "id": row.get("id"),
                "user_id": row.get("user_id"),
                "user_short": _short_id(row.get("user_id")),
                "amount_ngn": float(row.get("amount_ngn") or 0),
                "withdrawal_fee_ngn": float(row.get("withdrawal_fee_ngn") or 0),
                "net_amount_ngn": float(row.get("net_amount_ngn") or 0),
                "bank_name": row.get("bank_name") or "-",
                "account_number": row.get("account_number") or "-",
                "account_name": row.get("account_name") or "-",
                "reference": row.get("reference") or "-",
                "status": status,
                "can_approve": status == "pending",
                "can_mark_paid": status in {"pending", "approved"},
                "can_reject": status in {"pending", "approved"},
                "rejection_reason": row.get("rejection_reason"),
                "created_at": row.get("created_at"),
                "reviewed_at": row.get("reviewed_at"),
                "paid_at": row.get("paid_at"),
            }
        )
    total = int(data.get("total") or len(items))
    limit = int(data.get("limit") or 20)
    page = int(data.get("page") or 1)
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": max(1, (total + limit - 1) // limit) if total else 1,
    }


def normalize_sos_list(alerts) -> dict:
    items = []
    pending = 0
    for row in alerts if isinstance(alerts, list) else (alerts.get("items") or []):
        if not isinstance(row, dict):
            continue
        status = str(row.get("status") or "triggered").lower()
        if status == "triggered":
            pending += 1
        items.append(
            {
                "id": row.get("id"),
                "ride_id": row.get("ride_id"),
                "ride_short": _short_id(row.get("ride_id")),
                "customer_id": row.get("customer_id"),
                "driver_id": row.get("driver_id"),
                "status": status,
                "message": row.get("message") or "No message",
                "lat": row.get("lat"),
                "lng": row.get("lng"),
                "triggered_at": row.get("triggered_at"),
                "acknowledged_at": row.get("acknowledged_at"),
                "resolved_at": row.get("resolved_at"),
                "false_alarm_fee_ngn": row.get("false_alarm_fee_ngn"),
                "false_alarm_outcome": row.get("false_alarm_outcome"),
                "can_acknowledge": status == "triggered",
                "can_resolve": status in {"triggered", "acknowledged"},
            }
        )
    return {"items": items, "total": len(items), "pending_count": pending}


def normalize_accident_list(reports) -> dict:
    items = []
    pending = 0
    for row in reports if isinstance(reports, list) else (reports.get("items") or []):
        if not isinstance(row, dict):
            continue
        status = str(row.get("status") or "received").lower()
        if status == "received":
            pending += 1
        items.append(
            {
                "id": row.get("id"),
                "ride_id": row.get("ride_id"),
                "ride_short": _short_id(row.get("ride_id")),
                "customer_id": row.get("customer_id"),
                "status": status,
                "severity": row.get("severity") or "moderate",
                "description": row.get("description") or "No description",
                "injuries": bool(row.get("injuries")),
                "lat": row.get("lat"),
                "lng": row.get("lng"),
                "contact_phone": row.get("contact_phone"),
                "created_at": row.get("created_at"),
                "acknowledged_at": row.get("acknowledged_at"),
                "resolved_at": row.get("resolved_at"),
                "false_alarm_fee_ngn": row.get("false_alarm_fee_ngn"),
                "false_alarm_outcome": row.get("false_alarm_outcome"),
                "can_acknowledge": status == "received",
                "can_resolve": status in {"received", "acknowledged"},
            }
        )
    return {"items": items, "total": len(items), "pending_count": pending}


def normalize_report_list(data: dict, *, report_type: str) -> dict:
    items = data.get("items") or []
    total = int(data.get("total") or len(items))
    limit = int(data.get("limit") or 50)
    page = int(data.get("page") or 1)
    return {
        "report_type": report_type,
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": max(1, (total + limit - 1) // limit) if total else 1,
    }
