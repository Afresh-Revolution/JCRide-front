"""Map admin bike-delivery API payloads to UI-friendly shapes."""


def normalize_bike_rider(raw: dict) -> dict:
    if not isinstance(raw, dict):
        return {}
    earnings = float(raw.get("earnings_ngn") or 0)
    rating = raw.get("rating")
    return {
        **raw,
        "earnings_display": raw.get("earnings_display") or f"₦{earnings:,.0f}",
        "rating_display": raw.get("rating_display") or (
            f"{float(rating):.2f}" if rating is not None else "-"
        ),
    }


def normalize_bike_riders_list(raw: dict) -> dict:
    riders = raw.get("riders") or []
    return {
        "riders": [normalize_bike_rider(r) for r in riders if isinstance(r, dict)],
        "total": raw.get("total") or 0,
        "page": raw.get("page") or 1,
        "limit": raw.get("limit") or 20,
        "total_pages": raw.get("total_pages") or 1,
    }


def normalize_bike_pricing(raw: dict) -> dict:
    items = []
    for row in raw.get("items") or []:
        if not isinstance(row, dict):
            continue
        amount = row.get("amount_ngn")
        items.append(
            {
                **row,
                "amount_display": (
                    f"₦{float(amount):,.0f}" if amount is not None else "-"
                ),
            }
        )
    return {"items": items}
