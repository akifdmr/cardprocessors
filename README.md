# CardMarket PaymentApi

Bu proje tek Node/Express process'i icinde API, MongoDB persistence katmani ve web paneli calistirir. React panel `cardmarketing` projesinde build edilir ve build sonucu `PaymentApi/public/react` altindan Express tarafindan servis edilir. Eski vanilla panel dosyalari da `PaymentApi/public` altinda durur.

## Proje Icerigi

Ana dizinler:

- `PaymentApi/`: Express API, provider servisleri, MongoDB adapter katmani, statik panel servis katmani.
- `PaymentApi/src/server.js`: API endpoint'leri, Swagger docs, panel fallback route'u ve provider operation endpoint'leri.
- `PaymentApi/src/db.js`: MongoDB baglantisi, index olusturma ve SQL-benzeri compatibility query katmani.
- `PaymentApi/src/config/env.js`: `.env`, `.env.development`, `.env.production` yukleme ve provider/Mongo config.
- `PaymentApi/src/services/`: Clover, PayPal, FluidPay, Global Payments, PropelrPay, audit, masking, number ve unchargeback servisleri.
- `PaymentApi/src/routers/`: mask, number ve call route modulleri.
- `PaymentApi/scripts/`: syntax check, MongoDB config check ve migration scriptleri.
- `PaymentApi/public/`: vanilla panel ve statik assetler.
- `PaymentApi/public/react/`: React panelin production build ciktisi.
- `cardmarketing/`: React kaynak projesi.
- `cardmarketing/src/features/processors/`: React payment processors ekranlari, operation formu, log tablosu ve log aksiyon componentleri.

## Gereksinimler

- Node.js ve npm
- Lokal MongoDB
- `.env` dosyalari
- Provider credential'lari gerekiyorsa ilgili `.env` alanlari

Development modunda MongoDB icin lokal URI onceliklidir:

```text
MONGODB_URI=mongodb://localhost:27017/cloverapp
```

Atlas/remote MongoDB kullanmak icin development ortaminda `MONGODB_USE_ATLAS=true` veya `MONGODB_USE_REMOTE=true` set edilebilir. Production modunda `DATABASE_URL` / `MONGODB_CONNECTIONSTRING` kullanilir.

## Ilk Kurulum

Root dizin:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket
```

API bagimliliklari:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/PaymentApi
npm install
```

React panel bagimliliklari:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/cardmarketing
npm install
```

## Tum Projeyi Ayaga Kaldirma

React panel kaynaklarinda degisiklik yapildiysa once build alin:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/cardmarketing
npm run build
```

Ardindan API, panel ve Mongo index migration'i tek process olarak baslat:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/PaymentApi
npm run dev
```

Uygulama varsayilan olarak burada acilir:

```text
http://localhost:3000
```

Health kontrol:

```bash
curl http://localhost:3000/health
```

Mongo status kontrol:

```bash
curl http://localhost:3000/api/system/mongodb/status
```

Swagger/OpenAPI dokumani:

```text
http://localhost:3000/docs
```

## Manuel Calistirma Sirasi

React build:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/cardmarketing
npm run build
```

Mongo index migration:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/PaymentApi
npm run db:migrate
```

API + panel server:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/PaymentApi
npm run dev
```

Port 3000 doluysa alternatif local run:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/PaymentApi
NODE_ENV=local PORT=3001 node src/server.js
```

Alternatif health kontrol:

```bash
curl http://localhost:3001/health
```

## Build ve Kontrol Komutlari

API syntax check:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/PaymentApi
npm run build
```

API syntax + Mongo config check:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/PaymentApi
npm run build:all
```

React production build:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/cardmarketing
npm run build
```

React lint:

```bash
cd /Users/akifdemir/Desktop/Projects/CardMarket/cardmarketing
npm run lint
```

## NPM Scriptleri

`PaymentApi/package.json`:

- `npm run dev`: development modda Mongo migration calistirir ve API/panel server'i baslatir.
- `npm run dev:watch`: migration sonrasi Node watch mode ile server baslatir.
- `npm run dev:services`: `dev` alias'i.
- `npm run all:dev`: `dev:services` alias'i.
- `npm run up:dev`: `dev` alias'i.
- `npm run start`: mevcut env ile sadece server baslatir, migration calistirmaz.
- `npm run start:all`: production modda migration + server baslatir.
- `npm run up:prod`: `start:all` alias'i.
- `npm run db:migrate`: aktif env icin MongoDB indexlerini olusturur.
- `npm run build`: JavaScript syntax kontrolu.
- `npm run build:all`: syntax kontrolu + MongoDB config kontrolu.
- `npm run check`: `build` alias'i.

`cardmarketing/package.json`:

- `npm run dev`: Vite dev server.
- `npm run build`: React paneli `PaymentApi/public/react` altina build eder.
- `npm run lint`: React kaynaklarinda ESLint kontrolu.
- `npm run preview`: Vite preview.

## Env Yukleme Sirasi

`PaymentApi/src/config/env.js` sirasiyla su dosyalari yukler:

1. `.env`
2. `.env.development`, `.env.production` veya aktif `NODE_ENV` degerine gore `.env.<env>`

Ortama ozel dosya ortak `.env` degerlerini override eder.

Onemli env alanlari:

- `PORT`
- `DATABASE_URL`
- `MONGODB_URI`
- `MONGODB_DATABASE`
- `MONGODB_USE_ATLAS`
- `MONGODB_USE_REMOTE`
- `APP_ENCRYPTION_KEY_BASE64`
- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_DISPLAY_NAME`
- `CLOVER_*`
- `PAYPAL_*`
- `FLUIDPAY_*`
- `BRAINTREE_*`
- `GLOBALPAYMENTS_*`
- `PROPELRPAY_*`

## Web Panel

Panel Express tarafindan ayni origin uzerinden servis edilir.

- `/`: React panel.
- `/docs`: Swagger UI.
- Login sonrasi kartlar, checkers, payment processors, providers, Burp Suite ve ilgili operator ekranlari kullanilir.
- Payment processors ekraninda provider operation catalog'u API'den alinir.
- Log listesindeki aksiyonlar React component yapisindadir:
  - `propelrpay`, `fluidpay`, `globalpayments`, `braintree`: `void`, `refund`, `capture`, `capture_tip`
  - `paypal`: `void`, `capture`

## API Ozeti

Temel endpointler:

- `GET /health`
- `GET /api/system/mongodb/status`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/config/providers`
- `GET /api/provider-operations/catalog`
- `POST /api/provider-operations/cards`
- `GET /api/payment-processors/logs`
- `GET /api/payment-processors/health`
- `POST /api/payment-processors/health/check`
- `GET /api/provider-reports`
- `GET /api/audit-logs`
- `GET /api/cards`
- `POST /api/cards`
- `POST /api/cards/validate-input`
- `POST /api/cards/:cardId/provider-verification`
- `GET /api/cards/:cardId/checks`
- `POST /api/cards/:cardId/checks`
- `GET /api/cards/:cardId/enrollment`
- `POST /api/cards/:cardId/enrollment`

Provider endpoint gruplari:

- Clover: `/api/providers/clover/*`
- PayPal REST/NVP/Payflow: `/api/providers/paypal/*`
- FluidPay: `/api/providers/fluidpay/*`
- Global Payments: `/api/providers/globalpayments/*`
- PropelrPay: `/api/providers/propelrpay/*` ve `/api/providers/propelr/*`
- Twilio/Voice/Number/Mask/Call route'lari: ilgili `/api` route modulleri

## Guvenlik Notlari

- Ham kart numarasi ve CVV kalici olarak saklanmamalidir.
- Audit ve provider log modellerinde kart bilgileri maskelenir.
- Enrollment gibi hassas alanlar uygulama katmaninda `AES-256-GCM` ile sifrelenir.
- Provider credential'lari `.env` dosyalarindan okunur.
- Remote MongoDB / Atlas kullaniliyorsa auth mode, client certificate ve IP allowlist ayarlari ortam tarafinda dogrulanmalidir.
