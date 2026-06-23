# CardMarket Deployment

## Recommended Platform

Use Render as a single Node web service. The React app builds into `PaymentApi/public/react`, and the Express server serves both `/api/*` and the React panel.

## Render Setup

1. Push this repository to GitHub.
2. In Render, create a new Blueprint from this repository.
3. Render will read `render.yaml`.
4. Fill every `sync: false` environment variable in the Render dashboard.
5. Deploy.

## Commands

Local full-stack startup:

```sh
npm run up
```

`up` runs MongoDB index migration, starts PaymentApi, waits for `/health`, then starts the React app at `/react/`.

Render uses:

```sh
npm ci && npm --prefix PaymentApi ci && npm --prefix cardmarketing ci --include=dev && npm run build:deploy
npm run start:deploy
```

`start:deploy` validates required secrets, runs MongoDB index migration, and only
starts Express if both checks pass. A broken database configuration now fails
the deploy instead of reporting a false successful migration.

In production, `PaymentApi/.env` is intentionally ignored. The migration and
server use only environment variables supplied by Render. `LOAD_DOTENV=true`
may be used explicitly for a local production-mode test.

## Required Environment Variables

```env
NODE_ENV=production
APP_ENV=production
DATABASE_URL=mongodb+srv://DB_USERNAME:URL_ENCODED_DB_PASSWORD@paymentmanger.gvaavzc.mongodb.net/?retryWrites=true&w=majority&appName=paymentmanger
MONGODB_DATABASE=cloverapp
APP_ENCRYPTION_KEY_BASE64=base64-32-byte-key
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=at-least-12-characters
BOOTSTRAP_ADMIN_DISPLAY_NAME=System Admin
```

Generate a valid encryption key:

```sh
openssl rand -base64 32
```

## Provider Environment Variables

Only set the providers you use.

```env
RAPIDAPI_BIN_CHECKER_KEY=...

BRAINTREE_ENV=sandbox
BRAINTREE_MERCHANT_ID=...
BRAINTREE_PUBLIC_KEY=...
BRAINTREE_PRIVATE_KEY=...
BRAINTREE_MERCHANT_ACCOUNT_ID=...
```

Other supported providers keep their existing env names from `PaymentApi/src/config/env.js`.
The Blueprint exposes the primary variables for Clover, PayPal, Braintree,
FluidPay, NMI, Amazon Pay, Global Payments, Zoho, PropelrPay and Quiklie.
Leave an unused provider's values blank; its row will show `not_configured`.

Joker Checker needs no secret and defaults to:

```env
JOKER_CHECKER_API_BASE_URL=https://jokerbalancecheck.onrender.com
JOKER_CHECKER_TIMEOUT_MS=30000
```

## Atlas Requirements

- Add Render's outbound access to the Atlas Network Access list. For the first
  deploy, `0.0.0.0/0` is the simplest test setting; restrict it afterward.
- Create/use an Atlas **Database Access** user. This is not your Atlas website
  login.
- Set only one database connection variable on Render: `DATABASE_URL`.
- Put the database username and URL-encoded password directly in that URL.
- Delete old `MONGODB_URI`, `MONGODB_CONNECTIONSTRING`, `MONGODB_USERNAME`, and
  `MONGODB_PASSWORD` values from the Render service to avoid stale auth.
- Do not use an X.509 connection string unless the certificate file is also
  available to the Render service.

If the password contains characters such as `@`, `:`, `/`, `?`, `#`, `%`, or
`&`, URL-encode it before placing it in `DATABASE_URL`:

```sh
node -p "encodeURIComponent('YOUR_DATABASE_PASSWORD')"
```

## Deploy Verification

After Render reports `Live`, verify:

```sh
curl -fsS https://cardprocessors.onrender.com/health
curl -I https://cardprocessors.onrender.com/react/
curl -I https://cardprocessors.onrender.com/docs
```

`/health` must return HTTP 200 with `services.mongo.ok: true`.

## Production URL

After deploy, open:

```text
https://cardprocessors.onrender.com/react/
```

Health check:

```text
https://cardprocessors.onrender.com/health
```
