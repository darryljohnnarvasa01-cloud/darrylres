# RescueLink Worker API

Cloudflare Workers/Hono replacement for the Laravel API. This is intentionally separate from `backend/` so endpoints can be migrated safely one slice at a time.

## Local Run

```bash
cd backend-worker
npm install
npm run dev
```

## Cloudflare Secrets

Set these before deploying:

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put GOOGLE_MAPS_API_KEY
wrangler secret put APP_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is used only server-side for API reads. The public config route exposes only the anon key.

## Password Reset Email

The forgot password flow uses Cloudflare Email Service through the `EMAIL` Worker binding in `wrangler.toml`.

Before deploying password reset email:

1. Enable Email Sending for the domain in Cloudflare.
2. Set `MAIL_FROM_ADDRESS` to an address on that verified domain, for example:

```bash
wrangler secret put MAIL_FROM_ADDRESS
```

`MAIL_FROM_NAME` and `PASSWORD_RESET_EXPIRES_MINUTES` are regular Worker vars in `wrangler.toml`.

## First Migrated Routes

- `GET /api/v1/health`
- `GET /api/v1/public/config`
- `GET /api/v1/public/stats`
- `GET /api/v1/public/home`
- `GET /api/v1/public/incidents/map`
- `GET /api/v1/public/incidents/recent`
- `GET /api/v1/public/hazard-zones`
- `POST /api/v1/public/incidents`
- `POST /api/v1/incidents/guest`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

Guest incident media is uploaded to R2 when `INCIDENT_MEDIA_BUCKET` is configured in `wrangler.toml`. Without that binding, the incident is still created and the response includes `media_stored: false`.

The response envelope matches Laravel:

```json
{
  "success": true,
  "data": {},
  "message": "..."
}
```
