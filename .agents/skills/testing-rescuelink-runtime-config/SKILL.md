---
name: testing-rescuelink-runtime-config
description: Test RescueLink runtime backend URL overrides and Cloudflare-origin CORS behavior. Use when verifying Cloudflare Pages/Supabase deployment config changes.
---

# Testing RescueLink Runtime Config

Use this skill when validating changes to `frontend/public/config.js`, `frontend/src/lib/api.js`, `frontend/src/lib/echo.js`, or `backend/config/cors.php`.

## Devin Secrets Needed

- None for local runtime-config and CORS verification.
- For real external deployment testing, request appropriately scoped secrets such as `CLOUDFLARE_API_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, and `SUPABASE_SERVICE_ROLE_KEY`.

## Local Setup

1. Backend local setup from repo root:
   ```bash
   cd backend
   cp .env.example .env
   touch database/database.sqlite
   php artisan key:generate --force
   php artisan migrate --seed --force
   ```
2. Start Laravel with a Cloudflare-like origin:
   ```bash
   cd backend
   CLOUDFLARE_FRONTEND_URL=https://rescuelink-cloudflare.test php artisan serve --host=127.0.0.1 --port=8000
   ```
3. Temporarily set `frontend/public/config.js` to use the local API:
   ```js
   window.__RESCUELINK_CONFIG__ = {
     apiBaseUrl: 'http://127.0.0.1:8000',
     ...(window.__RESCUELINK_CONFIG__ || {}),
   }
   ```
4. Start Vite with a deliberately wrong build-time API URL so the test proves runtime config wins:
   ```bash
   cd frontend
   VITE_API_BASE_URL=http://127.0.0.1:59999 npm run dev -- --host 127.0.0.1 --port 5173
   ```

## Browser Assertion

1. Open `http://127.0.0.1:5173/login`.
2. Enter `nobody@example.com` and `wrong-password`.
3. Click `Sign In`.
4. Expected result: the UI shows exact text `Invalid credentials.`.
5. Optional browser evidence:
   ```js
   ({
     runtimeConfig: window.__RESCUELINK_CONFIG__,
     loginRequests: performance.getEntriesByType('resource')
       .filter((entry) => entry.name.includes('/api/v1/auth/login'))
       .map((entry) => entry.name),
   })
   ```
   The request should target `http://127.0.0.1:8000/api/v1/auth/login`, not port `59999`.

## CORS Assertion

Run:
```bash
curl -i -X OPTIONS http://127.0.0.1:8000/api/v1/auth/login \
  -H 'Origin: https://rescuelink-cloudflare.test' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Expected header:
```text
Access-Control-Allow-Origin: https://rescuelink-cloudflare.test
```

## Cleanup

Restore `frontend/public/config.js` to its committed state before finishing:
```js
window.__RESCUELINK_CONFIG__ = {
  apiBaseUrl: '',
  ...(window.__RESCUELINK_CONFIG__ || {}),
}
```

Check `git status --short` and make sure only intended PR files are modified.

## Known Environment Notes

- The lockfile may require PHP >=8.4 even if README text mentions PHP 8.3.
- Frontend lint may report existing issues unrelated to runtime config changes; verify against `main` before treating them as change-related.
