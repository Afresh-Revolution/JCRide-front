"""Private receipt storage for the frontend's landmark payment review queue."""
import os
from contextlib import contextmanager
import sqlite3
import uuid
from pathlib import Path
from flask import current_app, request
from app.config import get_landmark_payment_config
from app.services.api_client import ApiError


def receipt_dir():
    root = Path(os.getenv("PLAN_RECEIPT_DIR") or Path(current_app.instance_path) / "plan_receipts")
    root.mkdir(parents=True, exist_ok=True)
    return root


@contextmanager
def database():
    connection = sqlite3.connect(receipt_dir() / "receipts.sqlite3")
    connection.execute("CREATE TABLE IF NOT EXISTS receipts (payment_id TEXT PRIMARY KEY, filename TEXT NOT NULL)")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def receipt_filename(payment_id):
    with database() as db:
        row = db.execute("SELECT filename FROM receipts WHERE payment_id = ?", (str(payment_id),)).fetchone()
    return row[0] if row else None


def subscribe_with_receipt(subscribe, token, payload):
    config = get_landmark_payment_config(token)
    if payload.get("provider") == "paystack":
        if not config["paystack_enabled"]:
            raise ApiError("Paystack is currently unavailable. Please choose bank transfer.")
        result = subscribe(token, payload)
        payment = result.get("payment") or {}
        if not payment.get("authorization_url"):
            raise ApiError("Paystack did not return a checkout link. Please contact support before retrying.", 502)
        return result
    if payload.get("provider") != "manual" or not config["manual_enabled"]:
        raise ApiError(config.get("config_error") or "Bank transfer is currently unavailable. Please contact support.")
    upload = request.files.get("receipt")
    if not upload or not upload.filename:
        raise ApiError("Upload your transfer receipt for admin confirmation.")
    data = upload.stream.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024:
        raise ApiError("Your receipt must be 5 MB or smaller.")
    extension = None
    if data.startswith(b"%PDF-"):
        extension = ".pdf"
    elif data.startswith(b"\x89PNG\r\n\x1a\n"):
        extension = ".png"
    elif data.startswith(b"\xff\xd8\xff"):
        extension = ".jpg"
    if not extension:
        raise ApiError("Upload a valid JPG, PNG or PDF receipt.")
    filename = uuid.uuid4().hex + extension
    path = receipt_dir() / filename
    try:
        path.write_bytes(data)
        # Keep proof linked even if the remote API does not retain proof_url.
        try:
            result = subscribe(token, payload)
        except ApiError:
            path.unlink(missing_ok=True)
            raise
        payment = result.get("payment") or {}
        payment_id = payment.get("id") or payment.get("reference")
        if not payment_id:
            current_app.logger.error("Manual subscription response has no payment ID; receipt retained as %s", filename)
            raise ApiError("Your transfer was submitted but needs support to link the receipt. Do not pay again.", 502)
        with database() as db:
            db.execute("INSERT OR REPLACE INTO receipts VALUES (?, ?)", (str(payment_id), filename))
        return result
    except OSError as exc:
        raise ApiError("Receipt storage is unavailable. Please contact support.", 503) from exc
