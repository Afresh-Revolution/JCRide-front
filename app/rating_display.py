"""Shared public rating display helpers for JosRide web."""


def format_public_rating_label(rating_avg=None, rating_count=None, rating_valid_count=None):
    """Bayesian/public label: 'New on JosRide' until enough verified ratings."""
    count = rating_valid_count
    if count is None:
        count = rating_count
    try:
        count = int(count or 0)
    except (TypeError, ValueError):
        count = 0
    if count < 5:
        return "New on JosRide"
    try:
        avg = float(rating_avg or 0)
    except (TypeError, ValueError):
        avg = 0.0
    if avg <= 0:
        return "New on JosRide"
    return f"{avg:.2f} ★ · {count} verified rides"


def format_public_rating_short(rating_avg=None, rating_count=None, rating_valid_count=None):
    """Compact label for cards/nav."""
    count = rating_valid_count if rating_valid_count is not None else rating_count
    try:
        count = int(count or 0)
    except (TypeError, ValueError):
        count = 0
    if count < 5:
        return "New on JosRide"
    try:
        avg = float(rating_avg or 0)
    except (TypeError, ValueError):
        avg = 0.0
    if avg <= 0:
        return "New"
    return f"{avg:.2f} ★"
