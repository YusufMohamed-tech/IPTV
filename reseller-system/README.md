# IPTV Reseller System (Admin + Reseller)

Full-stack web application for parent-company admin management and reseller operations.

## Tech Stack

- Frontend: React + Vite + Recharts
- Backend: Node.js + Express + Mongoose
- Database: MongoDB
- Auth: JWT + role-based guards
- Reports: JSON / CSV / PDF

## Features Included

### Admin Panel

- Dashboard totals: resellers, clients, revenue, active subscriptions
- Create, edit, delete resellers
- Assign credits to resellers
- Create/manage subscription packages with channel lists
- Manage server details (Xtream URL + M3U URL)
- Track activity logs
- Generate reports (`json`, `csv`, `pdf`)
- Notifications for low credits and expiring subscriptions

### Reseller Panel

- Dashboard totals: clients, revenue, credits, active subscriptions
- Create, edit, delete clients
- Assign subscriptions to clients
- Renew subscriptions and run expiry updates
- Track client login/device info
- Offer free trial subscriptions
- Generate reseller reports (`json`, `csv`, `pdf`)

### Security

- Role-based access: `admin`, `reseller`, `client`
- Password hashing with `bcryptjs`
- JWT auth and guarded endpoints
- Input validation with `express-validator`
- API hardening with `helmet` and CORS policy

## Folder Structure

- `backend/`: API, models, controllers, routes, services
- `frontend/`: React app with reusable components, role-protected pages
- `docker-compose.yml`: one-command local stack

## Local Run (without Docker)

### 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run start
```

Default API: `http://localhost:4000`

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Default web app: `http://localhost:5173`

## Docker Run

```bash
cd reseller-system
cp backend/.env.example backend/.env
docker compose up --build
```

Services:

- Web: `http://localhost:5173`
- API: `http://localhost:4000/api`
- MongoDB: `localhost:27017`

## Important Initial Login

On first backend startup, a default admin is auto-created using env vars:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

Set strong production values before deployment.

## Core API Groups

- Auth: `/api/auth/*`
- Admin: `/api/admin/*`
- Reseller: `/api/reseller/*`

## Notes for Production

- Use HTTPS termination (Nginx/Cloudflare/Load Balancer)
- Rotate JWT secret and all default credentials
- Add rate limiting and 2FA flow for admin accounts
- Use managed MongoDB with backups and monitoring
- Add background scheduler (cron/queue) for daily expiry checks
