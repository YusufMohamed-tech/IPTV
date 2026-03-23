# 3 Stars IPTV - Xtream Compatible Backend

This project provides a lightweight Xtream Codes compatible API backend for 3 Stars IPTV.

## Features

- `player_api.php` authentication and actions
- `get.php` M3U / M3U Plus playlist output
- `xmltv.php` XMLTV EPG output
- Stream routes in Xtream style (`/live/...` and `/movie/...`)

## Quick Start

```bash
npm install
npm start
```

Run Telegram license bot:

```bash
set TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
set TELEGRAM_ADMIN_IDS=123456789
npm run bot
```

Server default port is `8080`.

## Demo Credentials

- Username: `demo`
- Password: `demo123`

## Endpoints

- Health
  - `GET /health`
- Auth/Profile
  - `GET /player_api.php?username=demo&password=demo123`
- Actions
  - `GET /player_api.php?username=demo&password=demo123&action=get_live_categories`
  - `GET /player_api.php?username=demo&password=demo123&action=get_live_streams`
  - `GET /player_api.php?username=demo&password=demo123&action=get_vod_categories`
  - `GET /player_api.php?username=demo&password=demo123&action=get_vod_streams`
  - `GET /player_api.php?username=demo&password=demo123&action=get_series`
  - `GET /player_api.php?username=demo&password=demo123&action=get_epg&stream_id=1001`
- Playlist
  - `GET /get.php?username=demo&password=demo123&type=m3u_plus`
- XMLTV
  - `GET /xmltv.php?username=demo&password=demo123`

### Admin License Endpoints

- `POST /admin/login` with JSON body `{ "username": "...", "password": "..." }`
- `GET /admin/users` with header `x-admin-key`
- `POST /admin/users` with header `x-admin-key`
- `PATCH /admin/users/:username` with header `x-admin-key`
- `DELETE /admin/users/:username` with header `x-admin-key`
- `GET /admin/metrics` with header `x-admin-key`
- `GET /admin/audit-logs` with header `x-admin-key`
- `GET /admin/streaming/status` with header `x-admin-key`
- `GET /admin/catalog/status` with header `x-admin-key`
- `POST /admin/catalog/import-m3u` with header `x-admin-key`
- `GET /admin/panel` simple web panel

JWT usage (recommended):

1. Login using `/admin/login` and get `token`
2. Send `Authorization: Bearer <token>` in admin requests

Legacy mode:

- `x-admin-key` still works when `ALLOW_LEGACY_ADMIN_KEY=true`.

Example create user body:

```json
{
  "username": "client1",
  "password": "pass123",
  "exp_date": "1893456000",
  "max_connections": 1,
  "status": "Active",
  "is_trial": 0
}
```

## Telegram License Bot Commands

- `/gen <username> <password> <days> [max_connections]`
- `/extend <username> <days>`
- `/disable <username>`
- `/enable <username>`
- `/setpass <username> <new_password>`
- `/delete <username>`
- `/list`

## Stream URL Pattern

- Live: `/live/{user}/{pass}/{stream_id}.ts`
- Movie: `/movie/{user}/{pass}/{stream_id}.mp4`

## Notes

- This is an integration-ready backend skeleton with sample data.
- Replace `data/sampleData.js` with your own database/service layer.
- Set a strong `ADMIN_API_KEY` in production.
- Optional hardening env vars:
  - `RATE_WINDOW_SECONDS` (default `60`)
  - `RATE_MAX_REQUESTS` (default `120` per IP per window)
- In production, set `ADMIN_API_KEY` to a strong custom value. The server exits if default key is used with `NODE_ENV=production`.
- In production, set these env vars to strong values:
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`
  - `ADMIN_JWT_SECRET`
- `ALLOW_LEGACY_ADMIN_KEY` default is `true`; set it to `false` to force JWT only.

## Admin Validation Rules

- `username`: 3-32 chars, allowed `[a-zA-Z0-9_.-]`
- `password`: 4-64 chars
- `exp_date`: positive unix timestamp
- `max_connections`: positive integer
- `is_trial`: `0` or `1`
- `status`: `Active` or `Disabled`

## Admin Audit Log

- Admin operations are appended in JSON lines format to:
  - `data/admin-audit.log`
- Includes timestamp, source IP, actor, action, target, and status.
- Query endpoint supports filters:
  - `GET /admin/audit-logs?limit=50&action=admin_create_user&actor=admin&target=client1`

## User Backup

Create a manual backup:

```bash
npm run backup:users
```

Optional env vars:

- `USERS_BACKUP_DIR` (default `backups/users`)
- `USERS_BACKUP_RETENTION` (default `14`)

## Supabase + VPS Mode

The backend supports two storage modes:

- file mode (default): `data/users.json`
- Supabase Postgres mode: enabled automatically when DB env vars are set

Required env vars for Supabase mode:

- `SUPABASE_URL` (example: `https://<project-ref>.supabase.co`)
- `SUPABASE_DB_PASSWORD` (or `SUPABASE_PASSWORD`)

For IPv4 VPS + Supabase pooler (recommended):

- `SUPABASE_DB_HOST` (example: `aws-1-eu-west-1.pooler.supabase.com`)
- `SUPABASE_DB_PORT` (usually `5432`)
- `SUPABASE_DB_NAME` (usually `postgres`)
- `SUPABASE_DB_USER` (example: `postgres.<project-ref>`)
- `SUPABASE_DB_PASSWORD`

Optional alternative:

- `DATABASE_URL` full Postgres connection string

When enabled, the app auto-creates tables and migrates users from file to DB on startup.

Manual migration command:

```bash
npm run migrate:supabase
```

## Nginx Reverse Proxy (Suggested)

- Route `/api/` to Node backend (`127.0.0.1:3000`) and keep IPTV path compatibility.
- Apply security headers at Nginx level:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Content-Security-Policy`
- Public shortcuts:
  - `http://SERVER_IP/api/health`
  - `http://SERVER_IP/admin-panel` (redirects to `/api/admin/panel`)

## Streaming Engine Integration

Live API can be connected to your HLS engine directly.

Env vars:

- `STREAM_ENGINE_ENABLED` (`true` by default)
- `STREAM_ENGINE_HLS_URL` (default `http://127.0.0.1:8080/hls/live/stream.m3u8`)
- `STREAM_ENGINE_PUBLIC_HLS_URL` (recommended for client redirects, e.g. `http://SERVER_IP:8080/hls/live/stream.m3u8`)
- `STREAM_ENGINE_TIMEOUT_MS` (default `3000`)

Behavior:

- `/live/:username/:password/:streamId.m3u8` redirects to the configured engine HLS URL.
- `/admin/streaming/status` probes engine reachability and playlist validity.

## M3U Catalog Import

You can load channels/movies/series directly from an upstream M3U source.

Env vars:

- `M3U_SOURCE_URL` (optional auto-import on startup)
- `M3U_IMPORT_TIMEOUT_MS` (default `15000`)

Admin endpoints:

- `GET /admin/catalog/status`
- `POST /admin/catalog/import-m3u` with JSON body:

```json
{
  "url": "http://example.com/get.php?username=...&password=...&type=m3u&output=ts"
}
```

Notes:

- If `url` is omitted in request body, server uses `M3U_SOURCE_URL`.
- The importer classifies entries by group/title keywords into Live, Movies (VOD), and Series.

## HTTPS Template

- Prepared template file:
  - `scripts/nginx-https-template.conf`
- Replace `your-domain.com` and certificate paths, then enable it in Nginx.

## Vercel Deployment (Frontend Only)

This repository contains both backend and frontend code. For Vercel, deploy only the React app under `reseller-system/frontend`.

Root-level `vercel.json` is included to enforce frontend build/output:

- Build command: `npm --prefix reseller-system/frontend install && npm --prefix reseller-system/frontend run build`
- Output directory: `reseller-system/frontend/dist`

Required Vercel environment variable:

- `VITE_API_URL` -> your live backend API base URL (example: `http://188.166.61.68/api`)
