"""Default landing page content - mirrors the shipped home.html copy."""

DEFAULT_LANDING_PAGE: dict = {
    "hero": {
        "badge": "Nigeria's #1 pay-per-km network",
        "title_prefix": "Move smarter across",
        "title_accent": "Nigeria.",
        "subtitle": (
            "Book a verified driver in minutes, track your trip live, and pay only for the "
            "kilometers you ride. From Lekki to Wuse, JosRide is built for the way Nigerians actually move."
        ),
        "primary_cta_label": "Book your first ride",
        "secondary_cta_label": "Drive with JosRide",
        "watch_label": "Watch how it works",
        "watch_href": "#how-it-works",
        "trust_reviews": "4.9 · 38k+ reviews",
        "trust_verified": "NIN-verified drivers",
        "trust_support": "24/7 safety team",
        "mockup_pickup": "Lekki Phase 1",
        "mockup_destination": "Victoria Island, Akin Adesola",
        "mockup_pickup_time": "Avg 4 min",
        "mockup_pickup_sub": "Pickup time",
        "mockup_rides": [
            {"tier": "Eco", "price_ngn": 2150, "active": False},
            {"tier": "Comfort", "price_ngn": 3400, "active": True},
            {"tier": "Premium", "price_ngn": 5900, "active": False},
        ],
        "mockup_driver_initials": "TB",
        "mockup_driver_name": "Tunde Bakare",
        "mockup_driver_vehicle": "Silver Corolla · KJA-238-XY",
        "mockup_driver_rating": "4.97",
        "mockup_driver_eta": "ETA 4 min",
    },
    "partners": {
        "label": "Trusted by leading Nigerian brands & partners",
        "items": ["Cbrilliance", "Afresh Center", "Nigerian AI Builders"],
    },
    "features_section": {
        "eyebrow": "Features",
        "title": "Everything you need to move with confidence",
        "subtitle": (
            "An end-to-end mobility platform with the safety, payments, and reliability "
            "Nigerian riders expect."
        ),
        "items": [
            {"title": "Live GPS metering", "description": "Fares calculated per kilometer in real-time - no surprises, no inflated estimates."},
            {"title": "Verified drivers", "description": "Every driver is NIN-verified with vehicle inspection and background checks."},
            {"title": "Paystack payments", "description": "Pay with card, bank transfer, USSD, or your in-app wallet. Cash also accepted."},
            {"title": "Real-time tracking", "description": "Watch your driver approach on the map and share your live trip with loved ones."},
            {"title": "24/7 support", "description": "Nigerian-based support team available around the clock via call, chat, or in-app SOS."},
            {"title": "Schedule ahead", "description": "Book rides up to 7 days in advance for airport runs, meetings, and morning commutes."},
            {"title": "Per-km billing", "description": "Transparent receipts breaking down base fare, distance, time, and any surge."},
            {"title": "Nationwide reach", "description": "Live in 14 cities and counting - Lagos, Abuja, PH, Ibadan, Kano, Enugu and more."},
        ],
    },
    "how_it_works": {
        "eyebrow": "How it works",
        "title": "Four steps. Zero stress.",
        "steps": [
            {"title": "Request your ride", "description": "Enter your pickup and destination. Pick Economy, Comfort, or Premium based on your budget."},
            {"title": "Get matched instantly", "description": "We match you with the nearest verified driver. See their photo, plate number and rating."},
            {"title": "Track your trip live", "description": "Follow the GPS route in real time, share your trip with family, or call your driver from the app."},
            {"title": "Pay per kilometer", "description": "Charged only for the distance you actually traveled. Get a detailed receipt instantly."},
        ],
    },
    "audience": {
        "rider_eyebrow": "For riders",
        "rider_title": "A safer way to get around Nigeria",
        "rider_bullets": [
            "In-app SOS with one-tap police & contact alerts",
            "Share live trip link via WhatsApp or SMS",
            "Privacy-masked driver calls - your number stays private",
            "Trip receipts emailed instantly for expense claims",
        ],
        "rider_cta_label": "Sign up as rider",
        "driver_eyebrow": "For drivers",
        "driver_title": "Earn more. Keep more.",
        "driver_description": "Lower commissions than the big guys, instant Paystack payouts after every trip, and a fair rating system that protects you.",
        "driver_stats": [
            {"value": "₦180k", "label": "Avg weekly"},
            {"value": "15%", "label": "Commission"},
            {"value": "<5 min", "label": "Payout"},
        ],
        "driver_cta_label": "Become a driver",
    },
    "stats": [
        {"value": "2.4M+", "label": "Active Riders"},
        {"value": "180k", "label": "Verified Drivers"},
        {"value": "₦18B+", "label": "Paid to Drivers"},
        {"value": "42M+", "label": "Trips Completed"},
    ],
    "cities_section": {
        "eyebrow": "Live nationwide",
        "title": "14 cities. One ride app.",
        "subtitle": "From the energy of Lagos Island to the calm of Calabar - JosRide is everywhere you need to be.",
        "cities": [
            "Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City",
            "Kaduna", "Calabar", "Uyo", "Owerri", "Jos", "Ilorin", "Abeokuta",
        ],
    },
    "pricing_section": {
        "eyebrow": "Pricing",
        "title": "Honest, per-kilometer pricing",
        "subtitle": "Pick the class that fits your trip. You only pay for distance traveled - plus a small base fare.",
        "footnote": "Base fare ₦500 · Time charge ₦25/min · Surge pricing applies during peak hours and inclement weather.",
        "tiers": [
            {
                "name": "Economy",
                "price_per_km": 180,
                "description": "Budget rides in clean, comfortable sedans for everyday city trips.",
                "features": ["AC standard", "4 seats", "Card or cash", "Avg pickup 4 min"],
                "cta_label": "Book Economy →",
                "featured": False,
            },
            {
                "name": "Comfort",
                "price_per_km": 240,
                "description": "Newer cars, top-rated drivers, and extra legroom for the daily commute.",
                "features": ["Top 20% drivers", "Extra legroom", "Quiet ride option", "Avg pickup 5 min"],
                "badge": "Most popular",
                "cta_label": "Book Comfort →",
                "featured": True,
            },
            {
                "name": "Premium",
                "price_per_km": 420,
                "description": "Executive SUVs and luxury sedans for client pickups, airport runs, and events.",
                "features": ["SUV / luxury sedan", "Bottled water", "Professional drivers", "Priority support"],
                "cta_label": "Book Premium →",
                "featured": False,
            },
        ],
    },
    "testimonials_section": {
        "eyebrow": "Testimonials",
        "title": "Loved by Nigerians, coast to coast",
        "items": [
            {"quote": "I take JosRide every morning from Yaba to V.I. The drivers are professional and the per-km billing is a game changer - no more arguments about price.", "initials": "CA", "name": "Chioma A.", "role": "Marketing Lead, Lagos"},
            {"quote": "I switched from another platform because JosRide pays out instantly through Paystack. I see every naira I earn within 5 minutes of dropping off.", "initials": "EO", "name": "Emeka O.", "role": "Driver-Partner, Abuja"},
            {"quote": "The SOS button and live trip sharing make me feel safe when I'm coming home late. My mum loves that she can track my ride.", "initials": "AB", "name": "Aisha B.", "role": "Student, Ibadan"},
            {"quote": "We use the Schedule feature every Sunday for church. Driver shows up on the dot, every single time. Premium category is worth it.", "initials": "TO", "name": "Tunde O.", "role": "Accountant, Lagos"},
            {"quote": "The receipts go straight to my email. Bookkeeping for staff transport has never been this clean.", "initials": "FN", "name": "Fatima N.", "role": "HR Manager, Abuja"},
            {"quote": "I work odd hours. Knowing the driver is NIN-verified and the support team picks up at 2am - priceless.", "initials": "DK", "name": "David K.", "role": "Nurse, Port Harcourt"},
        ],
    },
    "faq_section": {
        "eyebrow": "FAQ",
        "title": "Questions, answered",
        "items": [
            {
                "question": "How is my fare calculated?",
                "answer": "Your fare is the base fare (₦500) plus per-kilometer billing for the actual distance our GPS records during your trip, plus a small per-minute time charge. You'll see a full breakdown on your receipt.",
            },
            {
                "question": "What payment methods do you accept?",
                "answer": "Pay with card, bank transfer, USSD, your in-app Paystack wallet, or cash. All digital payments are processed securely through Paystack.",
            },
            {
                "question": "Are drivers verified?",
                "answer": "Yes. Every JosRide driver is NIN-verified, passes a background check, and completes vehicle inspection before going live on the platform.",
            },
        ],
    },
    "cta": {
        "title": "Your next ride is one tap away.",
        "subtitle": "Join 2.4 million Nigerians already moving smarter with JosRide. Sign up in seconds - your first ride is on us.",
        "primary_label": "Get started free",
        "secondary_label": "Drive with us",
        "stats": [
            {"value": "4.9★", "label": "Avg rating"},
            {"value": "14", "label": "Cities live"},
            {"value": "<4 min", "label": "Pickup ETA"},
            {"value": "24/7", "label": "Safety team"},
        ],
    },
    "mobile_apps": {
        "josride_android_url": "",
        "josride_ios_url": "",
        "josride_driver_android_url": "",
        "josride_driver_ios_url": "",
    },
}
