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

Render uses:

```sh
npm install && npm --prefix PaymentApi install && npm --prefix cardmarketing install && npm run build:deploy
npm run start:deploy
```

`start:deploy` runs MongoDB index migration before starting the Express server.

## Required Environment Variables

```env
NODE_ENV=production
APP_ENV=production
DATABASE_URL=mongodb+srv://...
MONGODB_DATABASE=cloverapp
APP_ENCRYPTION_KEY_BASE64=base64-32-byte-key
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=change-this
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

## Production URL

After deploy, open:

```text
https://YOUR-SERVICE.onrender.com/react/
```

Health check:

```text
https://YOUR-SERVICE.onrender.com/health
```
