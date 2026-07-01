"""Demo rider dashboard data until rider API endpoints are available."""

RIDER_STATS = {
    "wallet_balance": {"value": "₦42,580", "trend": "₦5,200 this week"},
    "total_trips": {"value": "148", "trend": "12 this month"},
    "total_spending": {"value": "₦284,300", "trend": "8% saved vs avg"},
    "location": {"value": "Lekki, Lagos"},
}

LIVE_AREA = {
    "title": "Your area — Live",
    "subtitle": "12 drivers within 2 km · Avg pickup 4 min",
}

# Known area centroids for map fallback when geolocation is unavailable.
RIDER_LOCATION_COORDS = {
    "lekki, lagos": {"lat": 6.4474, "lng": 3.5569},
    "victoria island, lagos": {"lat": 6.4281, "lng": 3.4219},
    "ikeja, lagos": {"lat": 6.6018, "lng": 3.3515},
    "yaba, lagos": {"lat": 6.5158, "lng": 3.3712},
    "surulere, lagos": {"lat": 6.4969, "lng": 3.3530},
    "lagos": {"lat": 6.5244, "lng": 3.3792},
    "abuja": {"lat": 9.0579, "lng": 7.4951},
    "port harcourt": {"lat": 4.8156, "lng": 7.0498},
    "ibadan": {"lat": 7.3775, "lng": 3.9470},
}

# Offset pattern (lat, lng) for demo nearby drivers around the map center.
DRIVER_OFFSETS = [
    (0.0082, 0.0045),
    (-0.0065, 0.0091),
    (0.0038, -0.0072),
    (-0.0095, -0.0048),
    (0.0110, 0.0020),
    (-0.0025, 0.0115),
    (0.0055, 0.0088),
    (-0.0078, 0.0032),
    (0.0090, -0.0055),
    (-0.0042, -0.0098),
    (0.0015, 0.0065),
    (-0.0105, 0.0070),
]


def build_live_area_map(location_label: str = "Lekki, Lagos", driver_count: int = 12) -> dict:
    """Build Leaflet map config centred on the rider's area."""
    key = location_label.strip().lower()
    center = RIDER_LOCATION_COORDS.get(key)
    if not center:
        for part in key.split(","):
            part = part.strip()
            if part in RIDER_LOCATION_COORDS:
                center = RIDER_LOCATION_COORDS[part]
                break
    if not center:
        center = RIDER_LOCATION_COORDS["lekki, lagos"]

    drivers = []
    for dlat, dlng in DRIVER_OFFSETS[:driver_count]:
        drivers.append({
            "lat": round(center["lat"] + dlat, 6),
            "lng": round(center["lng"] + dlng, 6),
        })

    return {
        "location_label": location_label,
        "map_center": dict(center),
        "map_zoom": 14,
        "radius_km": 2,
        "driver_count": driver_count,
        "drivers": drivers,
    }

RECENT_TRIPS = [
    {
        "date": "Today",
        "time": "09:14",
        "pickup": "Lekki Phase 1",
        "destination": "Victoria Island",
        "distance": "8.2 km",
        "fare": "₦3,450",
        "status": "completed",
    },
    {
        "date": "Yesterday",
        "time": "18:42",
        "pickup": "Ikeja GRA",
        "destination": "MM Airport",
        "distance": "24.1 km",
        "fare": "₦8,900",
        "status": "completed",
    },
    {
        "date": "Mon 3 Mar",
        "time": "07:30",
        "pickup": "Yaba",
        "destination": "Lekki Phase 1",
        "distance": "15.6 km",
        "fare": "₦5,200",
        "status": "cancelled",
    },
]

BOOK_RIDE_DEFAULTS = {
    "pickup": "Lekki Phase 1, Lagos",
    "dropoff": "Victoria Island",
    "distance": "8.2 km",
    "duration": "22 min",
    "est_fare": "₦3,450",
}

RIDE_TIERS = [
    {
        "id": "economy",
        "name": "Economy",
        "badge": "Most popular",
        "description": "Affordable everyday rides",
        "seats": 4,
        "eta": "4 min",
        "fare": "₦2,850",
        "fare_num": 2850,
        "icon": "economy",
        "selected": True,
    },
    {
        "id": "comfort",
        "name": "Comfort",
        "badge": None,
        "description": "Newer cars with extra space",
        "seats": 4,
        "eta": "6 min",
        "fare": "₦4,200",
        "fare_num": 4200,
        "icon": "comfort",
        "selected": False,
    },
    {
        "id": "premium",
        "name": "Premium",
        "badge": None,
        "description": "Luxury sedans, top-rated drivers",
        "seats": 4,
        "eta": "9 min",
        "fare": "₦7,800",
        "fare_num": 7800,
        "icon": "premium",
        "selected": False,
    },
]

SCHEDULE_FORM = {
    "pickup": "Lekki Phase 1",
    "destination": "",
    "date": "06/29/2026",
    "time": "08:00 AM",
    "fare_low": "₦4,200",
    "fare_high": "₦5,700",
}

SCHEDULE_FARE_RANGES = {
    "economy": ("₦2,800", "₦4,300"),
    "comfort": ("₦4,200", "₦5,700"),
    "premium": ("₦6,400", "₦7,900"),
}

SCHEDULE_CLASS_LABELS = {
    "economy": "Economy",
    "comfort": "Comfort",
    "premium": "Premium",
}

SCHEDULE_VEHICLE_CLASSES = [
    {"id": "economy", "name": "Economy", "rate": "₦220/km", "seats": 4, "selected": False},
    {"id": "comfort", "name": "Comfort", "rate": "₦280/km", "seats": 4, "selected": True},
    {"id": "premium", "name": "Premium", "rate": "₦420/km", "seats": 4, "vehicle": "SUV", "selected": False},
]

UPCOMING_SCHEDULED_RIDES = [
    {
        "id": "sch-1",
        "pickup": "Lekki Phase 1",
        "destination": "Ikoyi",
        "datetime": "Mon, 29 Jun · 08:00 AM",
        "class": "Economy",
        "repeat": "Once",
        "reminder": "30 min before",
        "fare": "₦2,800 – ₦4,300",
    },
    {
        "id": "sch-2",
        "pickup": "Lekki Phase 1",
        "destination": "Murtala Muhammed Airport T2",
        "datetime": "Mon, 29 Jun · 06:30 AM",
        "class": "Comfort",
        "repeat": "Once",
        "reminder": "30 min before",
        "fare": "₦8,400",
    },
    {
        "id": "sch-3",
        "pickup": "Home · Ikoyi",
        "destination": "Office · Victoria Island",
        "datetime": "Mon–Fri · 07:45 AM",
        "class": "Economy",
        "repeat": "Weekdays",
        "reminder": "15 min before",
        "fare": "₦3,200",
    },
]

LIVE_TRACKING = {
    "status_label": "Driver arriving · 1 min away",
    "step": 2,
    "steps": ["Driver assigned", "Arriving", "Trip started", "Completed"],
    "driver": {
        "initials": "TB",
        "name": "Tunde Bakare",
        "rating": "4.92",
        "trips": "1,284",
        "plate": "ABC-123-XY",
        "vehicle": "Silver Toyota Corolla",
        "status": "DRIVER ARRIVING",
    },
    "pickup": "Lekki Phase 1, Lagos",
    "destination": "Victoria Island",
    "booking_id": "JCR-29481",
    "tier": "Economy",
    "fare_estimate": "₦3,450",
}

TRACKING_FINDING = {
    "pickup": "Lekki Phase 1",
    "destination": "Victoria Island",
    "fare_estimate": "₦3,450",
    "area": "Lekki",
    "match_delay_ms": 3200,
}

SHARE_RIDE = {
    "share_url": "https://jcride.ng/t/JCR-29481?s=adaeze",
    "share_message": "Follow my JCRide trip live:",
    "contacts": [
        {"initials": "MO", "name": "Mom", "phone": "+234 803 111 2222", "trusted": True},
        {"initials": "CE", "name": "Chinedu E.", "phone": "+234 805 222 0098", "trusted": True},
        {"initials": "FY", "name": "Fatima Y.", "phone": "+234 802 333 4455", "trusted": False},
        {"initials": "OH", "name": "Office HR", "phone": "+234 1 700 8822", "trusted": False},
    ],
}

RIDE_HISTORY_TRIPS = [
    {"id": "JCR-29481", "date": "Mar 25", "time": "10:04", "pickup": "Lekki Phase 1", "destination": "Victoria Island", "distance": "6.0 km", "duration": "15 min", "fare": "₦2,300", "status": "completed"},
    {"id": "JCR-29480", "date": "Mar 24", "time": "19:08", "pickup": "Yaba", "destination": "Lagos Island", "distance": "11.2 km", "duration": "28 min", "fare": "₦4,120", "status": "completed"},
    {"id": "JCR-29479", "date": "Mar 24", "time": "08:15", "pickup": "Surulere", "destination": "Ikeja City Mall", "distance": "14.5 km", "duration": "32 min", "fare": "₦5,680", "status": "cancelled"},
    {"id": "JCR-29478", "date": "Mar 22", "time": "13:21", "pickup": "Ikeja", "destination": "Lekki", "distance": "9.0 km", "duration": "18 min", "fare": "₦3,740", "status": "completed"},
    {"id": "JCR-29477", "date": "Mar 21", "time": "17:45", "pickup": "VI", "destination": "Ajah", "distance": "18.3 km", "duration": "35 min", "fare": "₦6,900", "status": "completed"},
    {"id": "JCR-29476", "date": "Mar 20", "time": "07:20", "pickup": "Gbagada", "destination": "CMS", "distance": "12.1 km", "duration": "25 min", "fare": "₦4,500", "status": "completed"},
]

WALLET_SUMMARY = {
    "balance": "₦42,580.00",
    "balance_sub": "≈ 12 average trips",
    "total_deposits": "₦310,000",
    "deposits_trend": "₦40k this month",
    "total_spending": "₦267,420",
    "spending_trend": "148 trips",
}

WALLET_TRANSACTIONS = [
    {"type": "debit", "title": "Trip JCR-29481 · Lekki → V.I.", "time": "Today · 09:22", "amount": "-₦3,450", "status": "Success"},
    {"type": "credit", "title": "Monnify Bank Transfer", "time": "Today · 08:10", "amount": "+₦20,000", "status": "Success"},
    {"type": "debit", "title": "Trip JCR-29478 · Yaba → Ikeja", "time": "Mar 24 · 19:08", "amount": "-₦5,820", "status": "Success"},
    {"type": "refund", "title": "Refund · Trip JCR-29470", "time": "Mar 22 · 15:01", "amount": "+₦780", "status": "Refunded"},
    {"type": "credit", "title": "Card Top-up · **** 4521", "time": "Mar 21 · 10:34", "amount": "+₦10,000", "status": "Success"},
]

PROFILE_MENU = [
    {"id": "personal", "label": "Personal information", "active": True},
    {"id": "locations", "label": "Saved locations", "active": False},
    {"id": "security", "label": "Security & 2FA", "active": False},
    {"id": "payment", "label": "Payment preferences", "active": False},
    {"id": "language", "label": "Language & region", "active": False},
]

PROFILE_DEFAULTS = {
    "full_name": "Adaeze Okafor",
    "phone": "+234 803 555 0142",
    "email": "adaeze@example.com",
    "dob": "14 Aug 1994",
    "emergency_contact": "Chinedu O. · +234 805 222 0098",
    "nin": "•••• •••• 4521",
    "member_since": "Jan 2023",
    "badge": "Premium Rider",
}

SUPPORT_FAQ = [
    {
        "question": "How is my fare calculated?",
        "answer": "Your fare is Base + Distance (per km) + waiting time + traffic surcharge + tolls. The estimate shown before booking is locked unless the route changes significantly.",
    },
    {
        "question": "What if my driver cancels?",
        "answer": "We auto-match a nearby driver at no extra cost. Your authorization is released within 24 hours.",
    },
    {
        "question": "Is JCRide available outside Lagos?",
        "answer": "Yes — Abuja, Port Harcourt, Ibadan, Kano, Enugu and 9 more cities.",
    },
    {
        "question": "How do refunds work?",
        "answer": "If actual fare is lower than the estimate, the difference is auto-refunded to your wallet within minutes.",
    },
]

SETTINGS_DEFAULTS = {
    "dark_mode": False,
    "use_location": True,
    "show_fare_per_km": True,
    "share_analytics": True,
    "personalised_offers": False,
    "share_name_with_driver": True,
    "language": "English (Nigeria)",
    "currency": "₦ Nigerian Naira (NGN)",
    "distance_units": "Kilometers (km)",
    "timezone": "WAT · Africa/Lagos (UTC+1)",
}
