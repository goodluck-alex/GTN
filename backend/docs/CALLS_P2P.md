# GTN P2P calls — developer reference (Phase 1)

## Architecture

- **Media:** WebRTC **P2P** (audio). ICE config from `GET /api/webrtc/ice-config`.
- **Phase 1 default:** `WEBRTC_P2P_ONLY=true` strips TURN/`turn:` URLs from `ICE_SERVERS_JSON` so only STUN is used. Set `WEBRTC_P2P_ONLY=false` when you add TURN for Phase 2.
- **Signaling:** Socket.IO (`call_user`, `answer_call`, `end_call`, …) in `server.js`.
- **Billing:** **Server-side only.** Caller pays; callee never debited.

## Plan/minutes model

| Field | Meaning |
|-------|---------|
| `User.freeMinutes` | Bonus / daily / referral minutes — **used first** on calls |
| `User.currentPlanId` + `User.planExpiry` | Unlimited access window for paid plans (`daily`, `weekly`, `monthly`) |

Daily grant (`DAILY_FREE_MINUTES`) and referral bonuses credit **`freeMinutes`**.

## Per-minute billing

- **First minute:** User must have an active unlimited plan or `freeMinutes ≥ 1` before `POST /api/calls/start` succeeds.
- **Ongoing:** Every **full minute** after remote audio connects, the **caller** client emits `call_billing_tick` with `{ callId, minuteIndex }` (1, 2, 3, …). Server deducts 1 free minute (unless unlimited), then updates `Call` counters.
- **Insufficient funds:** Server emits `call_billing_failed` → client should end the call.
- **Concurrency:** One billable call per caller (`registerBillingSession`). Missed/ended calls unregister the session.

## API

| Method | Path | Role |
|--------|------|------|
| GET | `/api/calls/can-start` | `{ canStart, freeMinutes, planUnlimited }` |
| POST | `/api/calls/start` | Start call row + billing session (requires afford first minute) |
| POST | `/api/calls/end` | End + duration; clears billing session |

## Socket (authenticated JWT)

| Event | Payload | Role |
|-------|---------|------|
| `call_billing_tick` | `{ callId, minuteIndex }` | Caller only; sequence 1, 2, 3… |
| `call_billing_ok` | `{ freeMinutes, … }` | Optional UI |
| `call_billing_failed` | `{ error: "insufficient", … }` | Stop call |

## Frontend

- `useDialCall` uses `/calls/can-start`.
- `voiceCallContext` starts billing on **outbound** `stream` (not on incoming answer).
- Duration sent to `/calls/end` uses **ceil** minutes (fractional → full minute).

## Env summary

```env
WEBRTC_P2P_ONLY=true
DAILY_FREE_MINUTES=5
```

Apply DB migration after pull: `npx prisma migrate deploy && npx prisma generate`.
