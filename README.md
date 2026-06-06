# RescueLink

Official web-based emergency reporting and monitoring system for CDRRMO Valencia City, Bukidnon.

## Stack
- Backend: Laravel 11, PHP 8.3, Sanctum, Reverb, Queue (database)
- Frontend: React 18 + Vite + Tailwind + Leaflet + Recharts
- Database: Supabase Postgres, MySQL 8.0, or SQLite for local/testing

## Project Layout
- `backend` - Laravel API
- `frontend` - React SPA

## Backend Setup
```bash
cd backend
copy .env.example .env
composer install
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
php artisan serve
```

Default seeded admin:
- Email: `admin@rescuelink.test`
- Password: `password123`

## Supabase Setup
This project uses the existing Laravel API with Supabase Postgres and optional Supabase Storage. It does not use Supabase Auth, so there are no auth redirects, hosted login screens, or session login walls.

1. Create a Supabase project.
2. Copy `backend/.env.cloudflare-supabase.example` to `backend/.env` for production, or start from `backend/.env.example` for local-only testing.
3. Fill in `DB_HOST`, `DB_PASSWORD`, `APP_URL`, `FRONTEND_URL`, and `CORS_ALLOWED_ORIGINS`.
4. In Supabase Storage, create:
   - `incident-media` as a public bucket.
   - `government-ids` as a private bucket.
5. Fill in the `SUPABASE_STORAGE_*` values from your Supabase project settings.
6. Run:

```bash
cd backend
composer install
php artisan key:generate
php artisan migrate --seed
php artisan config:clear
php artisan serve
```

For local-only development, keep `DB_CONNECTION=sqlite`, `GOVERNMENT_ID_DISK=private`, and `INCIDENT_MEDIA_DISK=public`.

## Cloudflare Domain Setup
For production, the React frontend can stay on Cloudflare Pages while the Laravel backend moves behind a Cloudflare-managed API domain.

- Frontend runtime API config: `frontend/public/config.js`
- Frontend Cloudflare env example: `frontend/.env.cloudflare.example`
- Backend Supabase/Cloudflare env example: `backend/.env.cloudflare-supabase.example`
- Full deployment notes: `docs/cloudflare-supabase.md`

## Frontend Setup
```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

## Realtime (Reverb) Setup
Backend `.env` values:
- `BROADCAST_CONNECTION=reverb`
- `REVERB_APP_ID=rescuelink`
- `REVERB_APP_KEY=rescuelink-key`
- `REVERB_APP_SECRET=rescuelink-secret`
- `REVERB_HOST=127.0.0.1`
- `REVERB_PORT=8080`
- `REVERB_SCHEME=http`

Frontend `.env` values:
- `VITE_API_BASE_URL=http://127.0.0.1:8000`
- `VITE_REVERB_APP_KEY=rescuelink-key`
- `VITE_REVERB_HOST=127.0.0.1`
- `VITE_REVERB_PORT=8080`
- `VITE_REVERB_TLS=false`

Run reverb server:
```bash
cd backend
php artisan reverb:start
```

## Implemented Modules
- Module 01: Registration, auth, admin approval flow
- Module 02: Citizen incident submission with media + duplicate checks
- Module 03: Admin dashboard/map verification + assignment
- Module 04: Staff portal + status progression + audit logging
- Module 05: IoT smoke alert integration + device management
- Module 06: Realtime notifications (events/listeners/Echo bell)
- Module 07: Analytics endpoints + charts + CSV/PDF export
- Module 08: Public map-first landing page + public incident/stats APIs
- Module 09: Admin system health module (`/api/v1/admin/system/health`, `/admin/system`)
- Module 10: QR incident verification (`/verify/:incidentCode`, `/api/v1/public/incidents/verify/{incidentCode}`)
- Module 11: Command center dashboard + triage board + responder assignment optimizer
- Module 12: Advanced analytics dashboard + responder performance tracker (`/api/v1/admin/analytics/overview`, `/api/v1/admin/staff/performance`)
- Module 13: Audit log viewer + notification control center + admin broadcast tools (`/api/v1/admin/audit-logs`, `/api/v1/admin/broadcast`, `/admin/audit`, `/admin/notifications`)
- Module 14: Admin permissions refinement + IoT alert enrichment + design-system upgrade (`/api/v1/auth/me`, ability-gated `/api/v1/admin/*`, upgraded `/admin/iot-devices`)

## API Prefix
- All API routes are versioned under: `/api/v1/*`

## API Highlights
- Auth: `/api/v1/auth/*`
- Citizen incidents: `/api/v1/incidents/*`
- Staff incidents: `/api/v1/staff/incidents/*`
- Admin incidents/registrations/iot/analytics/system: `/api/v1/admin/*`
- Admin audit/staff performance/broadcast/command center: `/api/v1/admin/*`
- Public map/feed/stats: `/api/v1/public/*`

## Quality Checks
Backend:
```bash
cd backend
vendor/bin/pint --test
php artisan test
```

Frontend:
```bash
cd frontend
npm run lint
npm run build
```

## CI
GitHub Actions workflow is included at:
- `.github/workflows/ci.yml`

Pipeline jobs:
- Backend: Composer install, Pint, Laravel test suite
- Frontend: npm ci, ESLint, Vite build
