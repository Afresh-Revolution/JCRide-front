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

RIDE_REQUESTS = [
    {
        "id": "req-1",
        "rider_name": "Adaeze Okafor",
        "rider_initials": "AO",
        "rating": 4.8,
        "rider_tier": "Premium rider",
        "distance_km": 8.2,
        "duration_min": 22,
        "pickup_eta": "Pickup 3 min",
        "pickup": "Lekki Phase 1",
        "destination": "Victoria Island",
        "earnings": "₦2,760",
    },
    {
        "id": "req-2",
        "rider_name": "Chidi Nwosu",
        "rider_initials": "CN",
        "rating": 4.6,
        "rider_tier": "Economy rider",
        "distance_km": 5.4,
        "duration_min": 15,
        "pickup_eta": "Pickup 5 min",
        "pickup": "Yaba",
        "destination": "Ikeja GRA",
        "earnings": "₦1,920",
    },
]

# Lagos route: Lekki Phase 1 → Victoria Island (Ozumba Mbadiwe corridor)
_ACTIVE_TRIP_MAP = {
    "map_center": {"lat": 6.435, "lng": 3.432},
    "map_zoom": 14,
    "route": [
        {"lat": 6.4474, "lng": 3.4703},
        {"lat": 6.4420, "lng": 3.4520},
        {"lat": 6.4380, "lng": 3.4350},
        {"lat": 6.4281, "lng": 3.4219},
    ],
    "start": {"lat": 6.4474, "lng": 3.4703},
    "end": {"lat": 6.4281, "lng": 3.4219},
    "vehicle_position": {"lat": 6.4380, "lng": 3.4350},
}

ACTIVE_TRIP = {
    "id": "trip-active-1",
    "status": "in_progress",
    "status_label": "TRIP IN PROGRESS",
    "rider_name": "Adaeze Okafor",
    "rider_initials": "AO",
    "rider_tier": "Premium rider",
    "rating": 4.8,
    "distance_left_km": 3.2,
    "earnings_live": "₦2,180",
    "trip_time": "12:48",
    "speed_kmh": 38,
    "next_maneuver": "Turn right onto Ozumba Mbadiwe Ave",
    "next_maneuver_distance_m": 320,
    "pickup": "Lekki Phase 1",
    "destination": "Victoria Island",
    "map": _ACTIVE_TRIP_MAP,
    "rider_phone": "+2348012345678",
}

EARNINGS_SUMMARY = [
    {
        "id": "today",
        "label": "TODAY",
        "value": "₦18,420",
        "badge": "▲ 14 trips",
        "icon": "wallet",
    },
    {
        "id": "week",
        "label": "THIS WEEK",
        "value": "₦101,400",
        "badge": "▲ 18%",
        "icon": "trend",
    },
    {
        "id": "month",
        "label": "THIS MONTH",
        "value": "₦412,800",
        "badge": "▲ 382 trips",
        "icon": "calendar",
    },
    {
        "id": "withdraw",
        "label": "AVAILABLE TO WITHDRAW",
        "value": "₦94,210",
        "badge": None,
        "icon": "withdraw",
    },
]

EARNINGS_WEEKLY_TREND = {
    "labels": ["W1", "W2", "W3", "W4"],
    "values": [72000, 91000, 68000, 101400],
}

EARNINGS_DAILY_TRIPS = {
    "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "values": [12, 15, 11, 18, 22, 34, 28],
}

WITHDRAWAL_INFO = {
    "amount": "₦94,210.00",
    "amount_raw": 94210.0,
    "bank_name": "GTBank",
    "account_masked": "**** 8221",
    "provider": "Instant via Monnify",
}

NOTIFICATIONS = [
    {
        "id": "n1",
        "type": "ride",
        "title": "New ride request · 1.2 km away",
        "body": "Lekki Phase 1 → Victoria Island · Est ₦3,400",
        "time": "Just now",
        "unread": True,
    },
    {
        "id": "n2",
        "type": "payout",
        "title": "Daily payout sent",
        "body": "₦42,180 settled to GTBank ****3421",
        "time": "06:00 today",
        "unread": True,
    },
    {
        "id": "n3",
        "type": "rating",
        "title": "5-star rating received",
        "body": "Adaeze O. left a tip of ₦500.",
        "time": "1 h ago",
        "unread": True,
    },
    {
        "id": "n4",
        "type": "warning",
        "title": "Vehicle papers expiring",
        "body": "Renew before 04 Aug 2025 to keep driving.",
        "time": "Yesterday",
        "unread": False,
    },
    {
        "id": "n5",
        "type": "surge",
        "title": "Surge active in Ikeja",
        "body": "1.6× multiplier · next 45 min.",
        "time": "Yesterday",
        "unread": False,
    },
    {
        "id": "n6",
        "type": "ride",
        "title": "Trip completed",
        "body": "Ajah → Lekki · ₦5,120 net",
        "time": "2 d ago",
        "unread": False,
    },
]

NOTIFICATION_ALERTS = [
    {"id": "ride_requests", "label": "New ride requests", "enabled": True},
    {"id": "surge", "label": "Surge zones nearby", "enabled": True},
    {"id": "earnings", "label": "Earnings & payouts", "enabled": True},
    {"id": "ratings", "label": "Ratings & tips", "enabled": True},
    {"id": "documents", "label": "Document expiry", "enabled": True},
    {"id": "promotions", "label": "Promotions for drivers", "enabled": False},
]

NOTIFICATION_CHANNELS = [
    {"id": "push", "label": "Push notifications", "enabled": True},
    {"id": "sound", "label": "In-app sound", "enabled": True},
    {"id": "sms", "label": "SMS", "enabled": False},
    {"id": "email", "label": "Email digest (weekly)", "enabled": True},
]

PROFILE_DETAIL = {
    "name": "Tunde Bakare",
    "initials": "TB",
    "since": "Mar 2022",
    "rating": 4.92,
    "trips": 1284,
    "acceptance": "96%",
    "completion": "99%",
    "on_time": "94%",
    "vehicle": {
        "make_model": "Toyota Corolla 2019",
        "color": "Silver",
        "plate": "ABC-123-XY",
        "category": "Economy",
    },
    "documents": [
        {
            "name": "Driver License",
            "detail": "Expires 12 Jun 2027",
            "status": "verified",
        },
        {
            "name": "Vehicle Papers",
            "detail": "Expires 04 Aug 2025",
            "status": "verified",
        },
        {
            "name": "NIN / National ID",
            "detail": "—",
            "status": "verified",
        },
        {
            "name": "Insurance",
            "detail": "Awaiting upload",
            "status": "pending",
        },
    ],
}

DRIVER_SETTINGS_PREFERENCES = [
    {
        "id": "auto_accept_short",
        "label": "Auto-accept short trips",
        "hint": "Under 3 km · within 5 min",
        "enabled": False,
    },
    {
        "id": "long_trip_filter",
        "label": "Long-trip filter",
        "hint": "Only show trips > 8 km",
        "enabled": False,
    },
    {
        "id": "airport_queue",
        "label": "Airport queue",
        "hint": "Join virtual queue at MMA2",
        "enabled": True,
    },
    {
        "id": "night_mode",
        "label": "Night mode",
        "hint": "Dark UI after sunset",
        "enabled": True,
        "icon": "moon",
    },
]

DRIVER_SETTINGS_LOCALE = {
    "language": "English (Nigeria)",
    "nav_voice": "English - Female",
    "distance_units": "Kilometers (km)",
    "timezone": "WAT · Africa/Lagos (UTC+1)",
}

DRIVER_SETTINGS_AUDIO = [
    {
        "id": "voice_nav",
        "label": "Voice navigation",
        "hint": "Turn-by-turn instructions",
        "enabled": True,
        "icon": "speaker",
    },
    {
        "id": "request_sound",
        "label": "Request sound",
        "hint": "Loud alert for new requests",
        "enabled": True,
    },
    {
        "id": "surge_alerts",
        "label": "Surge alerts",
        "hint": "Notify when surge starts nearby",
        "enabled": True,
    },
]

LOCALE_OPTIONS = {
    "language": ["English (Nigeria)", "English (US)", "Hausa", "Igbo", "Yoruba"],
    "nav_voice": ["English - Female", "English - Male", "Hausa - Female"],
    "distance_units": ["Kilometers (km)", "Miles (mi)"],
    "timezone": [
        "WAT · Africa/Lagos (UTC+1)",
        "UTC",
        "GMT · London (UTC+0)",
    ],
}

DRIVER_SUPPORT_CATEGORIES = [
    "Payment & earnings",
    "Trip issue",
    "Documents & insurance",
    "Account access",
    "Safety & emergency",
    "Other",
]

DRIVER_SUPPORT_FAQ = [
    "How do I get paid?",
    "What if a rider cancels after I arrive?",
    "How is my driver rating calculated?",
    "Can I reject trips?",
]

DOCUMENT_ORDER = [
    "Driver License",
    "Vehicle Papers",
    "NIN / National ID",
    "Insurance",
]
