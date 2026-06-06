# Cloudflare domain + Supabase deployment

Use this when the React frontend stays on Cloudflare Pages and the Laravel API moves behind a Cloudflare-managed domain.

## Frontend on Cloudflare Pages

- Project root: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables:

```bash
VITE_API_BASE_URL=https://api.your-cloudflare-domain.example
VITE_REVERB_APP_KEY=rescuelink-key
VITE_REVERB_HOST=api.your-cloudflare-domain.example
VITE_REVERB_PORT=443
VITE_REVERB_TLS=true
```

The frontend also loads `/config.js` before React starts. You can change the backend URL without rebuilding by updating that file in the deployed asset:

```js
window.__RESCUELINK_CONFIG__ = {
  apiBaseUrl: 'https://api.your-cloudflare-domain.example',
  reverb: {
    appKey: 'rescuelink-key',
    host: 'api.your-cloudflare-domain.example',
    port: 443,
    wssPort: 443,
    tls: true,
  },
}
```

Leave `apiBaseUrl` empty only when the API is served from the same origin as the frontend through a reverse proxy.

## Backend on a Laravel-capable host

Cloudflare Pages does not run Laravel/PHP. Deploy `backend` to a PHP host, VPS, container host, or Laravel platform, then point a Cloudflare DNS record such as `api.your-cloudflare-domain.example` to that backend.

Start from:

```bash
cp backend/.env.cloudflare-supabase.example backend/.env
```

Set at minimum:

```bash
APP_URL=https://api.your-cloudflare-domain.example
FRONTEND_URL=https://your-cloudflare-domain.example
CLOUDFLARE_FRONTEND_URL=https://your-cloudflare-domain.example
CORS_ALLOWED_ORIGINS=https://your-cloudflare-domain.example
DB_HOST=aws-0-your-region.pooler.supabase.com
DB_PORT=6543
DB_DATABASE=postgres
DB_USERNAME=postgres.your-project-ref
DB_PASSWORD=your-supabase-db-password
DB_SSLMODE=require
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Run the Laravel setup on the backend host:

```bash
cd backend
composer install --no-dev --optimize-autoloader
php artisan key:generate
php artisan migrate --seed
php artisan config:cache
php artisan route:cache
```

## Supabase database and storage

Use Supabase Postgres through the connection pooler:

```bash
DB_CONNECTION=pgsql
DB_HOST=aws-0-your-region.pooler.supabase.com
DB_PORT=6543
DB_DATABASE=postgres
DB_USERNAME=postgres.your-project-ref
DB_SSLMODE=require
```

Create these Supabase Storage buckets:

- `incident-media` as public.
- `government-ids` as private.

Then set:

```bash
GOVERNMENT_ID_DISK=supabase_private
INCIDENT_MEDIA_DISK=supabase_public
SUPABASE_STORAGE_ENDPOINT=https://your-project-ref.supabase.co/storage/v1/s3
SUPABASE_STORAGE_PUBLIC_URL=https://your-project-ref.supabase.co/storage/v1/object/public/incident-media
```
