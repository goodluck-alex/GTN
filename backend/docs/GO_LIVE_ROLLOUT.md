# Phase 10 — Go‑Live Rollout (GTN Payments)

This guide describes a safe rollout process for GTN’s **plans → payments → activation** system.

## Feature flags (gradual enable by provider/country)

GTN already supports gradual rollout using the `PaymentProviderCapability` table:

- **Key fields**: `paymentMethod`, `provider`, `country`, `currency`, `active`
- **How frontend discovers availability**: `GET /api/payment-methods`

### Rollout strategy (recommended)

1. **Start with one country + one provider**
   - Example: `mobile_money / MTN / UG / UGX / active=true`
2. **Add second provider in same country**
   - Example: `mobile_money / AIRTEL / UG / UGX / active=true`
3. **Add additional countries/currencies**
4. **Enable crypto globally (if configured)**
   - Crypto becomes visible when backend env has `USDT_WALLET` configured.
5. **Enable card later**
   - Card becomes visible when `CARD_GATEWAY_ENABLED=true`.

### How to toggle capabilities

- **Preferred**: update the DB row(s) in `PaymentProviderCapability` to flip `active`.
- **Crypto**: requires env `USDT_WALLET` (and optionally `TRONGRID_API_KEY`).
- **Card**: requires env `CARD_GATEWAY_ENABLED=true` and `APP_BASE_URL`.

## Sandbox / UAT checklist (per provider)

### MTN MoMo Collections

- **Credentials**
  - `MTN_MOMO_SUBSCRIPTION_KEY`
  - `MTN_MOMO_API_USER`
  - `MTN_MOMO_API_KEY`
  - `MTN_MOMO_TARGET_ENV=sandbox`
  - `MTN_MOMO_BASE_URL=https://sandbox.momodeveloper.mtn.com`
- **Callback URL**
  - Ensure callback URL is reachable publicly in UAT
  - Verify your webhook endpoint path:
    - `POST /api/payments/webhooks/MTN` (or legacy `POST /api/payment/webhook/MTN`)
- **UAT tests**
  - Create payment → initiate → user approves → status becomes `succeeded`
  - Retry initiate with same idempotency key: no duplicate payment
  - Status polling returns consistent results

### Airtel Money

- **Credentials**
  - `AIRTEL_BASE_URL` (UAT)
  - `AIRTEL_CLIENT_ID`
  - `AIRTEL_CLIENT_SECRET`
  - `AIRTEL_COUNTRY`, `AIRTEL_CURRENCY`
- **Callback URL**
  - Verify webhook endpoint path:
    - `POST /api/payments/webhooks/AIRTEL`
- **UAT tests**
  - Token acquisition success
  - Initiate payment request-to-pay success
  - Status check & finalization to `succeeded`

### Crypto — USDT (TRC20)

- **Wallet configured**
  - `USDT_WALLET=<your TRC20 address>`
- **TronGrid connectivity**
  - Optional but recommended: `TRONGRID_API_KEY`
  - Base URL: `TRONGRID_BASE_URL=https://api.trongrid.io`
  - Health: `GET /api/payments/health/crypto` returns `tronGridReachable: true`
- **UAT tests**
  - Create crypto payment shows wallet + amount + expiry
  - Send exact amount on-chain → confirm → payment `succeeded` → plan activated
  - Same tx hash cannot confirm a second payment (double‑spend protection)

### Card (Hosted Checkout) — later

- **Feature flag**
  - `CARD_GATEWAY_ENABLED=true`
  - `APP_BASE_URL=https://<frontend-domain>`
- **UAT tests**
  - Initiate returns `checkoutUrl`
  - After provider integration: webhook status update to `succeeded`

## Production checklist

### Credentials & rotation

- Store all secrets in your hosting provider’s secret manager (Render/Vercel/…)
- Set rotation policy:
  - Quarterly rotation for provider keys
  - Immediate rotation if leaked
- Rotate `JWT_SECRET` only with a migration plan (it logs out all sessions)

### Callback URL verification

- Confirm your public URL(s) and routes:
  - `POST /api/payments/webhooks/:provider`
  - Legacy alias: `POST /api/payment/webhook/:provider`
- Set webhook signature secrets (recommended):
  - `PAYMENT_WEBHOOK_SECRET_<PROVIDER>=...`
  - Provider must send `x-signature` HMAC-SHA256 hex of JSON payload

### Monitoring alerts

Recommended alerts:
- Payment failures spike (e.g. > 5% over 10 minutes)
- Provider timeouts / retry exhaustion (dead-letter events)
- Webhook signature invalid count > 0
- TronGrid unreachable

### Reconciliation report (minimum viable)

Daily report per provider:
- Count by status: `created/pending/succeeded/failed/expired/cancelled`
- Sum amounts of `succeeded` by currency
- Export payment IDs + providerTxnIds for manual matching

GTN stores operational data in payment metadata:
- `metadata.timeline[]` (event timeline)
- `metadata.deadLetter[]` (provider failures)

## Rollback plan

If a provider has production incidents:
- Flip `PaymentProviderCapability.active=false` for that provider/country/currency
- For card: set `CARD_GATEWAY_ENABLED=false`
- For crypto: remove/empty `USDT_WALLET` (disables discovery)

