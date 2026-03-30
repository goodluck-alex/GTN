# Deployment environment variables

Use this checklist when configuring **Render** (API + database) and **Vercel** (Next.js apps).  
Replace example hosts with your real URLs (`https://api.yourdomain.com`, `https://app.yourdomain.com`, `https://admin.yourdomain.com`).

**Secrets:** never commit real values; use each platform’s **Environment** / **Secrets** UI only.

---

## 1. Backend — Render (Web Service)

Create a **Web Service** pointing at this repo’s `backend/` (or monorepo root with **Root Directory** = `backend`).  
Use **Node**; set **Build Command** and **Start Command** as you prefer (e.g. `npm install && npx prisma generate`, `npm start`).  
Run **`npx prisma migrate deploy`** once per deploy (e.g. **Render Shell** after first deploy, or a **release command**).

| Variable | Required | Example / notes |
|----------|----------|------------------|
| `DATABASE_URL` | **Yes** | From **Render PostgreSQL** (use **External** URL if you need to connect from outside Render). |
| `JWT_SECRET` | **Yes** | Long random string (customer app JWTs). |
| `NODE_ENV` | Recommended | `production` (often set automatically). |
| `PORT` | No | Render sets `PORT`; the app uses `process.env.PORT \|\| 5000`. |

### Admin API & CORS

| Variable | Required | Example / notes |
|----------|----------|------------------|
| `ADMIN_JWT_SECRET` | **Yes** (if you use admin) | Different from `JWT_SECRET`; signs admin session tokens. |
| `ADMIN_APP_ORIGINS` | **Yes** (production admin) | Comma-separated **exact** Vercel admin origins, e.g. `https://admin.yourdomain.com`. No trailing slash. |

### WebRTC (voice)

| Variable | Required | Example / notes |
|----------|----------|------------------|
| `ICE_SERVERS_JSON` | No | JSON array of STUN/TURN servers served to clients via `GET /api/webrtc/ice-config`. |
| `WEBRTC_P2P_ONLY` | No | `true` (default) = STUN-only phase; set `false` when TURN is configured. |

### Referrals & signup

| Variable | Required | Example / notes |
|----------|----------|------------------|
| `SUBSCRIBER_ID_START` | No | First `subscriberId` when counter row is created (default `691000001`). |
| `DAILY_FREE_MINUTES` | No | Default `5`; set `0` to disable daily grant. |
| `REFERRAL_MAX_PER_IP_DAY` | No | Default `10`. |

### Optional: email / SMS (OTP flows)

| Variable | Required | Notes |
|----------|----------|--------|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | If using email OTP | See `backend/modules/auth/otpMailer.js`. |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | No | Set `false` only if you must (insecure). |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | If using SMS | See `backend/modules/auth/otpSms.js`. |

### Optional: payments (enable only what you use)

| Variable | Notes |
|----------|--------|
| `PAYMENT_DEFAULT_CURRENCY` | e.g. `UGX` |
| `MTN_MOMO_BASE_URL`, `MTN_MOMO_TARGET_ENV`, `MTN_MOMO_SUBSCRIPTION_KEY`, `MTN_MOMO_API_USER`, `MTN_MOMO_API_KEY`, `MTN_MOMO_CURRENCY`, `MTN_MOMO_CALLBACK_URL` | MTN MoMo Collections |
| `AIRTEL_BASE_URL`, `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`, `AIRTEL_COUNTRY`, `AIRTEL_CURRENCY` | Airtel Money |
| `USDT_WALLET` or `USDT_TRC20_MASTER_ADDRESS` | Receiving TRON address |
| `TRONGRID_BASE_URL`, `TRONGRID_API_KEY` | TronGrid (USDT confirmation) |
| `USDT_TRC20_CONFIRMATIONS`, `USDT_TRC20_EXPIRES_MIN`, `USDT_TRC20_LOOKBACK_MIN` | Optional tuning |
| `APP_BASE_URL` | **Public web app origin** (no trailing slash), e.g. `https://app.yourdomain.com` — used for hosted card checkout URLs. |
| `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_SECRET_MTN`, … | Per-provider webhook HMAC (see `backend/.env.example`) |
| `PAYMENT_ADMIN_TRACE_TOKEN` | For admin payment trace headers |
| Rate limits / antifraud / retry | `PAYMENT_RATE_*`, `PAYMENT_ANTIFRAUD_*`, `PAYMENT_MIN_AMOUNT`, `PAYMENT_MAX_AMOUNT`, `PAYMENT_RETRY_*`, `PAYMENT_TIMELINE_MAX_EVENTS` — see `backend/.env.example` |

### Bootstrap scripts (not used by the running server)

Set only when running **one-off** Render Shell / local scripts:  
`ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_BOOTSTRAP_NAME`, `ADMIN_BOOTSTRAP_ROLE`.

**Reference:** full commented list in [`backend/.env.example`](../backend/.env.example).

---

## 2. Frontend — Vercel (customer Next.js app)

Project root: **`frontend/`** (or monorepo with **Root Directory** = `frontend`).

| Variable | Required | Example / notes |
|----------|----------|------------------|
| `NEXT_PUBLIC_API_URL` | **Yes** | Your **Render API** base **including `/api`**, e.g. `https://your-service.onrender.com/api` or `https://api.yourdomain.com/api`. REST calls and Socket.IO URL derivation use this (Socket strips `/api` for the origin). **HTTPS in production.** |

### Optional

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_ICE_SERVERS_JSON` | Client-side STUN/TURN override (JSON array). Often leave empty and use server `ICE_SERVERS_JSON` via `/api/webrtc/ice-config`. |
| `NEXT_PUBLIC_CALL_ALLOW_ZERO_BALANCE` | `true` to allow placing calls without balance in production (default: only in development). |
| `NEXT_PUBLIC_ANDROID_STORE_URL` | Play Store link on landing (`#` if unset). |
| `NEXT_PUBLIC_IOS_STORE_URL` | App Store link on landing (`#` if unset). |
| `NEXT_PUBLIC_WS_URL` | Only if you still use the legacy `webSocketContext` raw WebSocket client; primary realtime is **Socket.IO** from `NEXT_PUBLIC_API_URL`. |

**Vercel:** add variables under **Settings → Environment Variables**; use **Production** (and Preview if you want staging APIs).

---

## 3. Admin — Vercel (admin Next.js app)

Project root: **`admin/`**.

| Variable | Required | Example / notes |
|----------|----------|------------------|
| `NEXT_PUBLIC_API_URL` | **Yes** | **Same Render host** as the backend. May be **with or without** `/api` — the admin client normalizes it (`admin/lib/api.ts`). Examples: `https://your-service.onrender.com` or `https://api.yourdomain.com/api`. |

Ensure **`ADMIN_APP_ORIGINS`** on Render includes this admin deployment’s exact origin (e.g. `https://admin.yourdomain.com`).

---

## 4. Cross-cutting checks

1. **HTTPS:** Production frontend/admin URLs should be `https://`. Render gives HTTPS on `*.onrender.com`; custom domains need SSL on both Render and Vercel.
2. **Socket.IO:** Must reach the **same host** as the HTTP API (not Vercel). The browser connects to the API origin; do not point sockets at a Vercel URL.
3. **CORS:** Customer app uses default `cors()` for `/api`; admin routes use **`ADMIN_APP_ORIGINS`** — list every admin Vercel URL you use.
4. **`APP_BASE_URL`:** Should match your **public customer app** origin where users return after payment redirects.

---

## 5. Quick copy-paste template (replace placeholders)

```env
# --- Render (backend web service) ---
DATABASE_URL=postgresql://...
JWT_SECRET=
ADMIN_JWT_SECRET=
ADMIN_APP_ORIGINS=https://YOUR-ADMIN.vercel.app
ICE_SERVERS_JSON=
NODE_ENV=production

# Payments / SMTP / Twilio / etc. — add from backend/.env.example as needed

# --- Vercel (frontend) ---
NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.onrender.com/api

# --- Vercel (admin) ---
NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.onrender.com
```

---

*Last updated from the GTN codebase; see [`backend/.env.example`](../backend/.env.example) for the full optional set.*
