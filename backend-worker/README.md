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

## Transactional Email (Verification + Password Reset)

### Free mode (no domain, no paid email)

`EXPOSE_AUTH_LINKS=true` is enabled in `wrangler.toml`. Verification and password-reset links are returned on screen in the app instead of email. This works on `workers.dev` with zero cost.

### Optional free email: Resend

1. Create a free account at [resend.com](https://resend.com)
2. Create an API key
3. Set secrets:

```bash
wrangler secret put RESEND_API_KEY
```

4. Optional var in `wrangler.toml`:

```toml
MAIL_FROM_ADDRESS = "onboarding@resend.dev"
```

Resend's free `onboarding@resend.dev` sender only delivers to the email address you used to sign up for Resend.

### Custom domain: Cloudflare Email Sending

1. Enable Email Sending for your domain:

```bash
npx wrangler email sending enable <your-domain.com>
```

2. Set secrets:

```bash
wrangler secret put MAIL_FROM_ADDRESS
wrangler secret put APP_KEY
```

`MAIL_FROM_ADDRESS` must use the verified domain, for example `noreply@<your-domain.com>`.

Confirm `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS` in `wrangler.toml` include your deployed frontend origin. Verification links use `{FRONTEND_URL}/verify-email?token=...`.

`MAIL_FROM_NAME` and `PASSWORD_RESET_EXPIRES_MINUTES` are regular Worker vars in `wrangler.toml`. Email verification tokens expire after 30 minutes.

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
- `POST /api/v1/auth/register`
- `GET /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification-email`
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
