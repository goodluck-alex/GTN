# GTN — Backend

Express **5**, **Socket.IO**, **Prisma**, **PostgreSQL**. REST is mounted under **`/api`**.

**Full project overview, features, env overview, and local setup:** see the **[repository root README](../README.md)**.

**Deeper topic docs:**

- [docs/CALLS_P2P.md](docs/CALLS_P2P.md) — P2P calls / billing
- [docs/VOICE_ROOMS.md](docs/VOICE_ROOMS.md) — voice rooms
- [docs/GO_LIVE_ROLLOUT.md](docs/GO_LIVE_ROLLOUT.md) — go-live

## Quick reminders

- **Env:** `DATABASE_URL`, `JWT_SECRET`, and optional payment / referral vars (see root README table).
- **Migrations:** from this folder, `npx prisma migrate deploy` then `npx prisma generate` (on Windows, stop the dev server first if `generate` hits file locks).
- **JWTs:** include user id, **`tokenVersion` (`tv`)**, and session **`jti`** when using persisted sessions. **`POST /api/users/me/logout-all-devices`** bumps `tokenVersion` and revokes server sessions — clients should clear `gtn_token` and return to login.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Nodemon + `server.js` |
| `npm run prisma:generate` | Regenerate Prisma Client |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:seed` | Run seed |
| `npm run admin:*` | Admin user CLI helpers |
