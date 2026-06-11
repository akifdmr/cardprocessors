# Hostinger Deployment

## Can This App Run on Hostinger?

Yes, if your Hostinger plan supports a long-running Node.js app.

Use one of these:

- Hostinger Node.js app hosting in hPanel, if available on your plan
- Hostinger VPS

Avoid plain PHP/WordPress-only shared hosting for this app.

## Required Runtime

```text
Node.js 22
MongoDB Atlas
HTTPS domain
Environment variables
Long-running Node process
```

## Build Command

```sh
npm install && npm --prefix PaymentApi install && npm --prefix cardmarketing install && npm run build:deploy
```

## Start Command

```sh
npm start
```

This runs:

```sh
npm run start:deploy
```

## App URL

After deployment, open:

```text
https://YOUR-DOMAIN/react/
```

Health check:

```text
https://YOUR-DOMAIN/health
```

## Required Environment Variables

```env
NODE_ENV=production
APP_ENV=production
DATABASE_URL=mongodb+srv://...
MONGODB_DATABASE=cloverapp
APP_ENCRYPTION_KEY_BASE64=...
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=...
BOOTSTRAP_ADMIN_DISPLAY_NAME=System Admin
```

Generate `APP_ENCRYPTION_KEY_BASE64`:

```sh
openssl rand -base64 32
```

Add provider keys only for the providers you use.
