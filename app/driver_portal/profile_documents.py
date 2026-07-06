"""Resolve driver profile documents and ensure required items are present."""

from __future__ import annotations

from app.driver_portal.data import DOCUMENT_ORDER


def _doc_key(name: str) -> str:
    return (name or "").strip().lower()


def _normalize_doc(doc: dict) -> dict:
    status = str(doc.get("status") or doc.get("verification_status") or "pending").lower()
    if status in ("verified", "approved"):
        status = "verified"
    elif status in ("rejected", "expired"):
        status = "pending"
    return {
        "name": doc.get("name") or "Document",
        "detail": doc.get("detail") or doc.get("expires_at") or "-",
        "status": status,
    }


def merge_profile_documents(api_documents: list | None) -> list:
    merged = {
        _doc_key(label): {"name": label, "detail": "-", "status": "pending"}
        for label in DOCUMENT_ORDER
    }

    for raw in api_documents or []:
        name = raw.get("name") or raw.get("document_type") or raw.get("type") or ""
        if not name:
            continue
        normalized_name = name.replace("_", " ").title()
        if "nin" in _doc_key(name):
            normalized_name = "NIN / National ID"
        elif "insurance" in _doc_key(name):
            normalized_name = "Insurance"
        elif "license" in _doc_key(name):
            normalized_name = "Driver License"
        elif "vehicle" in _doc_key(name) and "paper" in _doc_key(name):
            normalized_name = "Vehicle Papers"

        detail = raw.get("detail") or raw.get("expires_at") or raw.get("expiry_date")
        if not detail and raw.get("uploaded_at"):
            detail = "Uploaded"
        if not detail:
            detail = "-"

        merged[_doc_key(normalized_name)] = _normalize_doc(
            {
                "name": normalized_name,
                "detail": detail,
                "status": raw.get("status") or raw.get("verification_status") or "pending",
            }
        )

    return [merged[_doc_key(label)] for label in DOCUMENT_ORDER if _doc_key(label) in merged]
