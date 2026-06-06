# Admin Responder Health & Route Visibility — Feature Prompt

## Goal
Build an **admin-only command-center view** that surfaces two things responders themselves cannot see:
1. **Minor error telemetry** — connectivity, GPS, and device health issues that happen silently on the responder portal.
2. **Full route visualization** — the actual path a responder took (or is taking) from assignment to the incident scene, not just their current dot on the map.

---

## 1. Responder Health / Error Telemetry Panel (Admin-Only)

### What to track
Store lightweight health events in a new `responder_health_logs` table or in-memory Redis stream (admin-only read). Each row is emitted from the responder portal whenever a non-fatal issue occurs:

| Event type | Trigger condition | Admin-visible severity |
|---|---|---|
| `gps_degraded` | `accuracy > 50` or `position.coords.accuracy` is null / > 100 m | `warning` |
| `gps_timeout` | Geolocation `watchPosition` errors out or no fix within 15 s | `warning` |
| `offline_transition` | `navigator.onLine` flips to `false` while responder has an active incident assignment | `critical` |
| `online_recovery` | `navigator.onLine` flips back to `true` after being offline | `info` |
| `battery_critical` | `battery_level <= 0.15` reported during an active response | `warning` |
| `sync_failed` | An offline report sync attempt fails and is queued for retry | `warning` |
| `location_stale` | No `recorded_at` update received for > 5 min while `action_status` is `on_the_way` or `arrived` | `critical` |
| `heading_jump` | Heading changes > 120° between two consecutive points (suggests GPS teleport / bad signal) | `warning` |
| `accuracy_dropped` | Accuracy suddenly worsens by > 300 % between two consecutive points | `info` |

### Admin UI — Responder Health Drawer
Add a new tab or section inside the existing **Responder Detail Drawer** (`ResponderDetailDrawer` in `AdminRespondersPage.jsx`) called **"Device & Link Health"**.

- Show a chronological feed of health events for that responder (last 50, collapsible).
- Each event row displays: `event_type`, `severity` badge, timestamp, `incident.reference_code` (if applicable), and a one-line human-readable message (e.g., "GPS accuracy degraded to 85 m while responding to INC-2025-0012").
- Include a small sparkline or mini-chart showing GPS accuracy over the last 20 minutes if the responder is currently on an active incident.
- Do **not** expose this feed to the responder portal or to the staff-facing `ResponderTrackingPanel`.

### Backend endpoint
```
GET /api/v1/admin/responders/{responderId}/health-logs
```
Return paginated health events. Scope strictly to admins (`role: admin`).

---

## 2. Responder Route to Accident (Historical Path + ETA)

### What to store
Instead of keeping only the single latest `ResponderLocation` row, persist a **route history** stream. Options:
- **Option A (lightweight):** Add a `responder_route_points` table with `(responder_id, incident_id, latitude, longitude, recorded_at, accuracy, action_status)`.
- **Option B (reuse existing):** Start logging every `ResponderStatusLog` that includes lat/lng as a route point, but add an index on `(responder_id, incident_id, created_at)`.

The responder portal already writes on every action-status update. The change is: **also write a point every 10–15 seconds while `action_status` is `on_the_way`**, throttled to avoid spam.

### Admin UI — Route Overlay on Live Map
In `AdminResponderTrackingMap.jsx` and the incident-detail drawer:

- When an admin clicks a responder card that is currently assigned to an incident, draw a **polyline** on `ResponderMap` connecting all route points for `(responder_id, incident_id)` ordered by `recorded_at`.
- Color-code the polyline by age (fades from dark navy to lighter blue) so the direction of travel is obvious.
- Place a small pin at the **start** (assignment location) and the **current head** (latest location).
- Compute and display:
  - **Distance remaining** (Haversine from current location to incident lat/lng).
  - **ETA** (naive: distance ÷ average speed from last N points; show as a range, e.g., "4–6 min").
  - **Route deviation** flag — if the responder’s current heading has diverged by > 45° from the direct bearing to the incident for more than 2 minutes, show a subtle warning badge.

### New backend endpoint
```
GET /api/v1/admin/responders/{responderId}/routes?incident_id={incidentId}
```
Returns an array of route points for the selected incident. Only admins may query this.

---

## 3. Integration Constraints

- **Existing tables must stay intact.** `responder_locations` remains the single-latest-position cache for real-time maps. Route history is additive.
- **Responder portal must remain unchanged visually.** The new 10–15 s background logging must be silent; responders should not see extra UI or extra battery drain messaging.
- **Use existing Supabase Realtime channels** where possible. If route points are stored in a new table, add a lightweight realtime subscription so the admin map updates without polling.
- **Auth gate everything.** All new endpoints and UI sections require `admin` role.

---

## 4. Files likely to change
- `frontend/src/components/tracking/AdminResponderTrackingMap.jsx` — route polyline + ETA badges
- `frontend/src/pages/admin/AdminRespondersPage.jsx` — health drawer tab inside `ResponderDetailDrawer`
- `frontend/src/lib/responderTracking.js` — throttled background route-point posting helper
- `frontend/src/components/maps/ResponderMap.jsx` — add `routePoints` prop and polyline renderer
- `backend/app/Http/Controllers/Api/V1/Admin/ResponderTrackingController.php` — new `healthLogs` and `route` actions
- `backend/database/migrations/` — new migration for `responder_health_logs` and optionally `responder_route_points`
- `backend/routes/api.php` — register new admin-only routes

---

## Acceptance Criteria
1. Admin opens a responder detail drawer and sees a **"Device & Link Health"** tab with at least the last 20 health events.
2. Admin clicks a responder on the live map that is `on_the_way`; a **polyline** appears showing the path from assignment to current position, plus an ETA estimate.
3. Responder portal (`ResponderTrackingPanel`) shows **no new UI** and experiences no functional change.
4. All new endpoints return `403` for non-admin roles.
5. When a responder goes offline mid-response, a `critical` badge appears on the admin map card within 30 seconds.
