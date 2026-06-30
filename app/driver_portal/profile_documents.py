"""Resolve driver profile documents and ensure required items are present."""

from __future__ import annotations

from app.driver_portal.data import DOCUMENT_ORDER, PROFILE_DETAIL


def _doc_key(name: str) -> str:
    return (name or "").strip().lower()


def _normalize_doc(doc: dict) -> dict:
    status = str(doc.get("status") or "pending").lower()
    if status in ("verified", "approved"):
        status = "verified"
    return {
        "name": doc.get("name") or "Document",
        "detail": doc.get("detail") or doc.get("expires_at") or "—",
        "status": status,
    }


def merge_profile_documents(api_documents: list | None) -> list:
    """Merge API documents with defaults so Insurance and other required rows always show."""
    defaults = {_doc_key(doc["name"]): _normalize_doc(doc) for doc in PROFILE_DETAIL["documents"]}
    merged = dict(defaults)

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
        if not detail and raw.get("status") == "pending":
            detail = "Awaiting upload"

        merged[_doc_key(normalized_name)] = _normalize_doc(
            {
                "name": normalized_name,
                "detail": detail or "—",
                "status": raw.get("status") or "pending",
            }
        )

    ordered = []
    seen = set()
    for label in DOCUMENT_ORDER:
        key = _doc_key(label)
        if key in merged:
            ordered.append(merged[key])
            seen.add(key)
    for key, doc in merged.items():
        if key not in seen:
            ordered.append(doc)
    return ordered
