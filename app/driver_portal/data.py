"""Sample data for the driver portal (replace with API calls later)."""

DRIVER_PROFILE = {
    "name": "Tunde Bakare",
    "initials": "TB",
    "rating": 4.92,
    "plate": "ABC-123-XY",
    "approval_status": "Verified",
}

HERO_STATS = [
    {"value": "2.4M+", "label": "RIDERS"},
    {"value": "180k", "label": "DRIVERS"},
    {"value": "₦18B+", "label": "PAID OUT"},
]

NAV_ITEMS = [
    {"id": "dashboard", "label": "Dashboard", "icon": "grid", "url": "driver_portal.dashboard"},
    {"id": "requests", "label": "Ride Requests", "icon": "car", "url": "#"},
    {"id": "active", "label": "Active Trip", "icon": "route", "url": "#"},
    {"id": "earnings", "label": "Earnings", "icon": "wallet", "url": "#"},
    {"id": "notifications", "label": "Notifications", "icon": "bell", "url": "#"},
    {"id": "profile", "label": "Profile", "icon": "user", "url": "#"},
    {"id": "settings", "label": "Settings", "icon": "settings", "url": "#"},
]

METRICS = [
    {
        "title": "Today's Earnings",
        "value": "₦18,420",
        "trend": "▲ ₦2,100 vs avg",
        "icon": "wallet",
    },
    {
        "title": "Completed Trips",
        "value": "14",
        "trend": "▲ 3 in last hour",
        "icon": "route",
    },
    {
        "title": "Online Hours",
        "value": "7.5 h",
        "trend": None,
        "icon": "clock",
    },
    {
        "title": "Rating",
        "value": "4.92 / 5",
        "trend": "▲ 42 new reviews",
        "icon": "star",
    },
]

WEEKLY_EARNINGS = {
    "total": "₦101,400",
    "trend": "▲ 18%",
    "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "values": [12000, 15000, 11000, 18000, 22000, 19000, 24000],
}

NEARBY_DEMAND = {
    "zone": "Victoria Island",
    "new_requests": 3,
}
