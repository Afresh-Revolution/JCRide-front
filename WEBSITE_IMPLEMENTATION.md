# Website & backend implementation notes

Guide for bringing **JCRide-front** / **JCRide-back** in line with the JosRide mobile app (`josride_app`).

See also: [README.md](./README.md) for running the Expo app.

---

## 1. Scheduled rides (backend already exists)

Backend routes (already live):

| Method | Path |
|--------|------|
| `POST` | `/api/v1/scheduled-rides` |
| `GET` | `/api/v1/scheduled-rides?page&limit` |
| `GET` | `/api/v1/scheduled-rides/{id}` |
| `PATCH` | `/api/v1/scheduled-rides/{id}` |
| `POST` | `/api/v1/scheduled-rides/{id}/cancel` |
| `DELETE` | `/api/v1/scheduled-rides/{id}` |

**Create body (same as mobile):**

```json
{
  "pickup_address": "string",
  "pickup_lat": 9.89,
  "pickup_lng": 8.85,
  "destination_address": "string",
  "destination_lat": 9.90,
  "destination_lng": 8.86,
  "city": "Jos",
  "service_tier": "economy|comfort|premium",
  "vehicle_category": "car",
  "scheduled_for": "2026-07-27T08:30:00.000Z",
  "reminder_minutes_before": 30,
  "stops": []
}
```

**Cancel body:** `{ "reason": "optional" }`

**Worker behaviour (already in JCRide-back):**

- Reminder notification when `scheduled_for - reminder_minutes_before` is reached (`scheduled_ride_reminder`)
- Auto-dispatch within ~5 minutes of pickup (`scheduled_dispatch_window_minutes`) → creates a real ride (`ride_created` + `created_ride_id`)

**Suggested website checklist**

- [x] Cancel button → API cancel + refresh list
- [x] Edit time/route → PATCH
- [x] Remove or disable Repeat
- [x] Show API `estimated_fare_ngn` after create instead of only static fare ranges
- [x] Deep-link / notification when `scheduled_ride_dispatched` fires → open live tracking for `created_ride_id`
- [x] Prefer Photon lat/lng on schedule form (with city fallback)

---

## 2. Accident / incident report

Implemented in **JCRide-back**:

- SQL: `JCRide-back/supabase/phase18_accident_reports.sql` (also in `schema.sql`)
- Rider: `POST /api/v1/safety/accidents`
- Admin: `GET /api/v1/admin/accidents`, acknowledge / resolve
- Website: `/user/support` accident form + `/admin/accidents` queue

**Support phone config (add to website `.env` too)**

```env
DRIVER_SUPPORT_PHONE=+2348012345678
EMERGENCY_PHONE=112
```

Mobile already uses:

```env
EXPO_PUBLIC_DRIVER_SUPPORT_PHONE=+2348000000000
EXPO_PUBLIC_EMERGENCY_PHONE=112
```

---

## 3. SOS (already on website + backend)

- Trigger: `POST /api/v1/rides/{ride_id}/sos` with `{ lat, lng, message }`
- Ride must be `accepted | driver_arrived | in_progress`
- Admin: `/api/v1/admin/sos` + acknowledge/resolve

Website live tracking already has SOS. Support numbers on `/user/support` read from `DRIVER_SUPPORT_PHONE` / `EMERGENCY_PHONE`.

---

## 4. Rider profile, account settings, security & privacy

Mobile now ships:

| Screen | Route | APIs used |
|--------|-------|-----------|
| Edit profile | `/rider/edit-profile` | `PATCH /api/v1/auth/me` (`full_name`, `phone`, `email`) |
| Account settings | `/rider/account-settings` | `GET/PATCH /api/v1/settings`, `GET/PATCH /api/v1/settings/notification-preferences` |
| Security & privacy | `/rider/security-privacy` | `POST /api/v1/auth/change-password`, `GET /api/v1/settings/data-export`, `POST /api/v1/settings/account/deactivate-request`, `POST /api/v1/settings/account/delete-request` |

### Already on website / backend

- Profile edit: `/user/profile` → `PATCH /api/v1/auth/me` (+ optional `profile-extras`)
- Settings shell: `/user/settings`
- Notification prefs helpers exist in `api_client.py`
- Deactivate / delete / data-export client helpers exist

### New backend

**Change password (authenticated)**

```http
POST /api/v1/auth/change-password
Authorization: Bearer <token>
```

```json
{
  "current_password": "string",
  "new_password": "string (min 8)",
  "confirm_password": "string (min 8)"
}
```

Rules:

- Local JosRide accounts only (users with `password_hash`)
- JosCity-only accounts (`joscity_user_id` and no local password) must change password on `https://joscity.com`
- Returns `{ "message": "Password updated successfully" }`

**Suggested website checklist**

- [x] Change password UI + JosCity redirect
- [x] Data export download button
- [x] Deactivate + delete with confirmations
- [x] Notification preference toggles live against API
- [x] Privacy toggles live against `/settings`
- [x] Privacy policy / Terms pages at `/privacy` and `/terms`
