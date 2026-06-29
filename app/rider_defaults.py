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
