# CloverApp

Bu proje tek uygulama olarak calisir.

- Frontend ayni Node/Express uygulamasindan servis edilir.
- Backend API ayni process icinde calisir.
- Yani ayri bir frontend deployment veya ayri bir backend deployment zorunlu degildir.
- Mimari hedef: tek proje, tek servis, SPA benzeri panel + ayni uygulama icinde API.

Bu proje `.env` üzerinden MongoDB ve provider ayarlarını alan basit bir backend iskeletidir.

## Güvenlik sınırı

Bu iskelet bilerek aşağıdaki verileri kalıcı saklamaz:

- Ham kart numarası
- CVV

Bunun yerine provider token, `last4`, opsiyonel `first6/bin`, son kullanma tarihi, fatura adresi ve denetim kayıtları saklanır.

`enrollment_profiles` tablosundaki hassas alanlar uygulama katmanında `AES-256-GCM` ile şifrelenir.

## Login ve roller

Sistem bearer token tabanli login kullanir.

- `admin`: kullanici olusturabilir, kartlari gorebilir/kaydedebilir, tum check tiplerini tetikleyebilir, balance gorebilir, enroll goruntuleyip guncelleyebilir.
- `operator`: kart kaydedebilir ve listeleyebilir, `live_check`, `bin_check`, `balance_check` tetikleyebilir ama balance degerini goremez, `auth_check` yapamaz, yeni enroll girebilir ama var olan enroll kaydini acamaz veya guncelleyemez.
- `customer`: kart kaydedebilir ve listeleyebilir, yalnizca kendisine izin verildiyse `balance_check` yapabilir, enroll goruntuleyemez veya giremez.

Bootstrap admin kullanicisi ilk acilista `.env` icindeki `BOOTSTRAP_ADMIN_*` degerleri ile otomatik olusturulur.

## Veritabani

Uygulama MongoDB veritabani kullanacak sekilde ayarlandi.

- Varsayilan `DATABASE_URL`: `mongodb://127.0.0.1:27017`
- Varsayilan `MONGODB_DATABASE`: `cloverapp`
- `src/db.js` MongoDB driver ile koleksiyon/index katmanini yonetir.
- `npm run db:migrate` aktif env icin MongoDB indexlerini olusturur.

## Kurulum

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. `APP_ENCRYPTION_KEY_BASE64` için 32 byte bir anahtar üretin.
3. `BOOTSTRAP_ADMIN_PASSWORD` degerini degistirin.
4. MongoDB connection string ve database adini `.env` icinde ayarlayin.
5. Bağımlılıkları yükleyin: `npm install`
6. Development modda sunucuyu başlatın: `npm run dev`

## NPM Scripts

Bu proje tek process oldugu icin frontend ve backend ayni Node uygulamasindan servis edilir.
Bu nedenle asagidaki "ayri" scriptler teknik olarak ayni sunucuyu calistiran alias'lardir.

- `npm run dev`: development modda tum uygulamayi migration ile ayağa kaldirir
- `npm run dev:watch`: development modda watch ile baslatir
- `npm run dev:services`: development modda tum servisleri tek process olarak ayağa kaldirir
- `npm run all:dev`: `dev:services` alias'i
- `npm run dev:all`: development modda tum uygulama
- `npm run dev:app`: development modda uygulama
- `npm run dev:api`: development modda API + panel
- `npm run dev:frontend`: development modda panel + API
- `npm run up:dev`: development icin tek komut giris
- `npm run start`: sadece server start komutu
- `npm run start:all`: production icin migration + tum uygulamayi baslatir
- `npm run start:app`: uygulamayi baslatir
- `npm run start:api`: API + paneli baslatir
- `npm run start:frontend`: panel + API'yi baslatir
- `npm run up:prod`: production icin tek komut giris
- `npm run db:migrate`: aktif env veritabani migration
- `npm run build`: JS syntax/build verification
- `npm run build:all`: JS syntax verification + MongoDB config validation
- `npm run all:build`: `build:all` alias'i
- `npm run check`: `build` alias'i

## Tek Komut Calistirma

Development:

- `npm install`
- `npm run all:dev`

Production:

- `npm install`
- `npm run all:build`
- `npm run up:prod`

Env yukleme sirasi:

1. `.env`
2. `.env.development` veya `.env.production`

Boylece ortak ayarlar `.env` icinde kalir, ortama ozel DB/port ayarlari env dosyasindan override edilir.

## API uçları

Tum backend endpoint'leri artik `/api` altindadir.

- `GET /health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/users`
- `GET /api/config/providers`
- `GET /api/providers/clover/test`
- `GET /api/providers/clover/merchant`
- `GET /api/providers/clover/orders`
- `GET /api/providers/clover/payments`
- `POST /api/providers/clover/preauth`
- `POST /api/providers/clover/cards/verify-with-bin`
- `POST /api/providers/clover/refund`
- `GET /api/providers/clover/tenders`
- `GET /api/providers/fluidpay/status`
- `POST /api/providers/fluidpay/test`
- `POST /api/providers/fluidpay/cards/sale`
- `POST /api/providers/fluidpay/cards/auth`
- `POST /api/providers/fluidpay/cards/capture`
- `POST /api/providers/fluidpay/cards/void`
- `POST /api/providers/fluidpay/cards/refund`
- `GET /api/providers/fluidpay/transactions/:transactionId`
- `POST /api/providers/fluidpay/transactions/search`
- `GET /api/providers/globalpayments/status`
- `POST /api/providers/globalpayments/test`
- `GET /api/providers/globalpayments/transactions/:transactionId`
- `GET /api/providers/propelrpay/status`
- `POST /api/providers/propelrpay/test`
- `GET /api/providers/propelrpay/transactions/:transactionId`
- `POST /api/provider-operations/cards`
- `GET /api/providers/paypal/rest/test`
- `GET /api/providers/paypal/manager/status`
- `POST /api/providers/paypal/manager/test`
- `POST /api/providers/paypal/manager/inquiry`
- `GET /api/audit-logs`
- `GET /api/cards`
- `POST /api/cards/validate-input`
- `POST /api/cards`
- `POST /api/cards/:cardId/provider-verification`
- `GET /api/cards/:cardId/checks`
- `POST /api/cards/:cardId/checks`
- `GET /api/cards/:cardId/enrollment`
- `POST /api/cards/:cardId/enrollment`

## Web panel

Uygulama Express uzerinden statik bir panel de sunar.

- `GET /` login ekranini aciyor.
- Giris sonrasi ayni panelde kart listesi, kart ekleme, check formu ve role gore enroll islemleri kullanilabilir.
- `admin` kullanicilari icin ek olarak kullanici olusturma ve kullanici listesi alani vardir.

## Tek Proje SPA Yapisi

Su anki yapi tek proje mantigina uygundur:

1. `public/` altindaki frontend dosyalari ayni uygulamadan servis edilir.
2. `src/server.js` hem API endpoint'lerini hem de frontend dosyalarini sunar.
3. Kullanici tarayicida tek panel gorur.
4. Panel backend ile ayni origin uzerinden haberlesir.
5. Bu sayede CORS, ayri frontend sunucusu ve ayri deployment karmasasi olmaz.
6. Basit SPA navigation hash route ile calisir:
   `#/dashboard`, `#/cards`, `#/users`, `#/logs`

Mevcut dosya rolleri:

- [public/index.html](/Users/akifdemir/Desktop/Projects/CloverApp/public/index.html): SPA giris noktasi
- [public/app.js](/Users/akifdemir/Desktop/Projects/CloverApp/public/app.js): panel mantigi
- [public/app.css](/Users/akifdemir/Desktop/Projects/CloverApp/public/app.css): panel stili
- [src/server.js](/Users/akifdemir/Desktop/Projects/CloverApp/src/server.js): ayni uygulama icinde frontend + API servis katmani

## Safe Intake Flow

Guvenli kart kabul akisi dokumani burada:

- [safe-card-intake-flow.md](/Users/akifdemir/Desktop/Projects/CloverApp/docs/safe-card-intake-flow.md)

Bu akis sunlari kapsar:

- lokal kart girdi dogrulamasi
- token referansi ile kart kaydi
- provider verification sonucunu kaydetme
- audit log gorunurlugu

## Örnek kart kaydı

```json
{
  "provider": "clover",
  "providerCustomerId": "cust_123",
  "providerPaymentToken": "clv_abc123",
  "maskedPan": "**** **** **** 4242",
  "first6": "424242",
  "last4": "4242",
  "brand": "VISA",
  "expMonth": "12",
  "expYear": "2030",
  "cardholderName": "John Doe",
  "billingAddressLine1": "Main Street 1",
  "billingCity": "Miami",
  "billingState": "FL",
  "billingZip": "33101",
  "billingCountry": "US",
  "authCheckLimit": 5.00,
  "verificationStatus": "pending"
}
```

## Not

Provider entegrasyonlari icin gerekli kimlik bilgileri `.env` uzerinden okunur. Clover, PayPal ve FluidPay icin temel gateway cagri endpointleri API katmanina eklenmistir; ham PAN/CVV request islenirken kullanilir ve audit log'a yazilmaz.

## Clover Methods

Su an guvenli sekilde eklenen Clover metotlari:

- connection test
- merchant info
- orders list
- payments list
- pre-authorization (`capture: false`, tokenized source ile)
- eCommerce API card verification (`source` token ile)
- refund (order return akisi ile)
- tenders list

Bu metotlar read-only veya non-destructive amaclidir.

## PayPal Manager

PayPal tarafinda iki ayri entegrasyon tipi vardir:

- REST API: `PAYPAL_CLIENT_ID` ve `PAYPAL_CLIENT_SECRET` ile OAuth token testi.
- NVP/SOAP DirectPayment: `PAYPAL_NVP_USERNAME`, `PAYPAL_NVP_PASSWORD`, `PAYPAL_NVP_SIGNATURE` ile `DoDirectPayment`, `DoCapture`, `DoVoid`.
- PayPal Manager / Payflow: `PAYPAL_MANAGER_PARTNER`, `PAYPAL_MANAGER_VENDOR`, `PAYPAL_MANAGER_USER`, `PAYPAL_MANAGER_PASSWORD` ile Manager transaction inquiry.

PayPal Manager icin test endpoint varsayilani:

- `PAYPAL_MANAGER_BASE_URL=https://pilot-payflowpro.paypal.com`

Production icin:

- `PAYPAL_MANAGER_BASE_URL=https://payflowpro.paypal.com`

Panelde Providers sayfasindan PayPal REST credential testi, Manager credential probe ve PNREF/CUSTREF inquiry calistirilabilir.

### PayPal BIN - Live Check Akisi

Su an aktif kullanilacak PayPal akisi:

1. Kart kaydini `provider=paypal` olarak olustur.
2. Providers sayfasinda PayPal BIN Check ile BIN/brand/local validation sonucunu kaydet.
3. Providers sayfasinda PayPal Manager Live Check ile kartin Payflow tarafinda cevap verdigini dogrula.

API uclari:

- `POST /api/providers/paypal/manager/cards/bin-check`
- `POST /api/providers/paypal/manager/cards/live-check`
- `POST /api/providers/paypal/direct-payment/cards/sale`
- `POST /api/providers/paypal/manager/cards/auth`
- `POST /api/providers/paypal/manager/cards/capture`
- `POST /api/providers/paypal/direct-payment/cards/void`

DirectPayment icin PayPal hesabinda Website Payments Pro / Direct Payment yetkisi gerekir; hesapta bu urun acik degilse NVP credential'lari dogru olsa bile PayPal islem hatasi doner. Guvenlik notu: Ham PAN ve CVV sadece request islenirken kullanilir; veritabanina veya audit log'a yazilmaz. Kayitlarda masked PAN, son 4, BIN/brand ve response kodlari tutulur.

### FluidPay Gateway Akisi

Gerekli env alanlari:

- `FLUIDPAY_ENV=sandbox`
- `FLUIDPAY_API_BASE_URL=https://sandbox.fluidpay.com`
- `FLUIDPAY_API_KEY=api_...`
- `FLUIDPAY_PROCESSOR_ID=` opsiyonel, gateway hesabinda default processor yoksa zorunlu
- `FLUIDPAY_TIMEOUT_MS=180000`

API uclari:

- `GET /api/providers/fluidpay/status`
- `POST /api/providers/fluidpay/test`
- `POST /api/providers/fluidpay/cards/sale`
- `POST /api/providers/fluidpay/cards/auth`
- `POST /api/providers/fluidpay/cards/capture`
- `POST /api/providers/fluidpay/cards/void`
- `POST /api/providers/fluidpay/cards/refund`
- `GET /api/providers/fluidpay/transactions/:transactionId`
- `POST /api/providers/fluidpay/transactions/search`

FluidPay isteklerinde tutarlar cent olarak gonderilir (`1299` = `$12.99`). Auth cevaplari uzun surebilecegi icin varsayilan timeout 180 saniyedir. Server-side islem icin private `api_***` key kullanilir; `pub_***` key frontend tokenizer icindir.

### Global Payments GP-API Akisi

Gerekli env alanlari:

- `GLOBALPAYMENTS_ENV=sandbox`
- `GLOBALPAYMENTS_API_MODE=ucp` veya Portico/Heartland key export icin `portico`
- `GLOBALPAYMENTS_API_BASE_URL=https://apis.sandbox.globalpay.com/ucp`
- `GLOBALPAYMENTS_APP_ID=...`
- `GLOBALPAYMENTS_APP_KEY=...`
- `GLOBALPAYMENTS_PUBLIC_API_KEY=...` `GLOBALPAYMENTS_APP_ID` alternatifi
- `GLOBALPAYMENTS_SECRET_API_KEY=...` `GLOBALPAYMENTS_APP_KEY` alternatifi
- `GLOBALPAYMENTS_MERCHANT_ID=...` opsiyonel destek/referans alanı
- `GLOBALPAYMENTS_SITE_ID=...` opsiyonel destek/referans alanı
- `GLOBALPAYMENTS_DEVICE_ID=...` opsiyonel destek/referans alanı
- `GLOBALPAYMENTS_WEBSITE=...` opsiyonel destek/referans alanı
- `GLOBALPAYMENTS_KEY_TYPE=...` opsiyonel destek/referans alanı
- `GLOBALPAYMENTS_DEVELOPER_ID=000000` Portico icin
- `GLOBALPAYMENTS_VERSION_NUMBER=0000` Portico icin
- `GLOBALPAYMENTS_ACCOUNT_NAME=Transaction_Processing`
- `GLOBALPAYMENTS_CHANNEL=CNP`
- `GLOBALPAYMENTS_COUNTRY=US`
- `GLOBALPAYMENTS_API_VERSION=2021-03-22`
- `GLOBALPAYMENTS_TIMEOUT_MS=180000`

API uclari:

- `GET /api/providers/globalpayments/status`
- `POST /api/providers/globalpayments/test`
- `POST /api/providers/globalpayments/cards/verify`
- `POST /api/providers/globalpayments/cards/auth`
- `POST /api/providers/globalpayments/cards/sale`
- `POST /api/providers/globalpayments/cards/capture`
- `POST /api/providers/globalpayments/cards/refund`
- `POST /api/providers/globalpayments/cards/void`
- `GET /api/providers/globalpayments/transactions/:transactionId`
- `POST /api/provider-operations/cards`

`/api/provider-operations/cards` ekrani FluidPay, Global Payments, PropelrPay ve Clover icin provider secerek `verification`, `authorize`, `sale`, `capture`, `refund` ve `void/reversal` operasyonlarini tek yerden calistirir. Verification calistiginda BIN check de paralel calisir; kart kaydi, provider sonucu, BIN sonucu ve audit/provider raporu ayni kart/provider baglaminda tutulur. Token gelen islemlerde provider tokeni kart kaydina maplenir; manuel kartlarda PAN/CVV loglanmaz, kayitta maskeli PAN/BIN/last4 ve sifreli PAN saklanir.

### Propelr / PropelrPay Provider Akisi

Propelr icin herkese acik teknik API referansi bulunamadigi icin endpoint path'leri env uzerinden verilir. Propelr destek ekibinden base URL, auth sekli ve endpoint path'lerini alip asagidaki alanlari doldurun. `PROPELR_*` ve eski `PROPELRPAY_*` env isimleri desteklenir:

- `PROPELRPAY_API_BASE_URL=...`
- `PROPELRPAY_MERCHANT_ID=...` veya request icinde `merchid`
- `PROPELRPAY_BASIC_AUTH=...` veya `PROPELRPAY_AUTH_USERNAME=...` + `PROPELRPAY_AUTH_PASSWORD=...`
- `PROPELRPAY_AUTH_HEADER=Authorization`
- `PROPELRPAY_AUTH_SCHEME=Basic`
- `PROPELRPAY_SALE_PATH=...`
- `PROPELRPAY_AUTH_PATH=...`
- `PROPELRPAY_VERIFY_PATH=...`
- `PROPELRPAY_CAPTURE_PATH=...`
- `PROPELRPAY_REFUND_PATH=...`
- `PROPELRPAY_VOID_PATH=...`
- `PROPELRPAY_TRANSACTION_PATH=...`
- `PROPELR_API_BASE_URL=...`
- `PROPELR_MERCHANT_ID=...` veya request icinde `merchid`
- `PROPELR_BASIC_AUTH=...` veya `PROPELR_AUTH_USERNAME=...` + `PROPELR_AUTH_PASSWORD=...`
- `PROPELR_AUTH_HEADER=Authorization`
- `PROPELR_AUTH_SCHEME=Basic`
- `PROPELR_SALE_PATH=...`
- `PROPELR_AUTH_PATH=...`
- `PROPELR_VERIFY_PATH=...`
- `PROPELR_CAPTURE_PATH=...`
- `PROPELR_REFUND_PATH=...`
- `PROPELR_VOID_PATH=...`
- `PROPELR_TRANSACTION_PATH=...`

API uclari:

- `GET /api/providers/propelrpay/status`
- `POST /api/providers/propelrpay/test`
- `GET /api/providers/propelrpay/transactions/:transactionId`
- `GET /api/providers/propelr/status`
- `POST /api/providers/propelr/test`
- `GET /api/providers/propelr/transactions/:transactionId`
- `POST /api/provider-operations/cards`

Path'ler tamamlandiginda Propelr de Provider Islemleri ekraninda diger gateway'lerle ayni raporlama ve kart mapping akisini kullanir. UI'daki provider degeri `propelr`, internal adapter eski `propelrpay` servisini kullanir.

Propelr/CardConnect response mapping notlari:

- `respstat=A` -> `result.status=approved`
- `respstat=C` -> `result.status=declined`
- `respcode` -> `result.resultCode`
- `resptext` -> `result.responseMessage`
- `retref` -> `result.transactionId`
- `/api/provider-operations/cards` response'u `amount.requestedAmount`, `amount.submittedAmount` ve `amount.providerAmount` alanlarini ayri dondurur. Decline cevaplarinda provider `raw.amount=0.00` dondurse bile `submittedAmount` gonderilen tutari korur.

### Burp Suite Test Proxy

Yetkili local/staging testlerinde uygulamanin dis API isteklerini Burp Suite uzerinden gecirmek icin opsiyonel axios interceptor katmani vardir. Varsayilan kapali gelir ve `NODE_ENV=production` icinde acilmaz.

Gerekli env alanlari:

- `BURP_PROXY_ENABLED=true`
- `BURP_PROXY_URL=http://127.0.0.1:8080`
- `BURP_PROXY_SCOPE_HOSTS=staging.example.com,api.example.com`
- `BURP_PROXY_ALLOW_INSECURE_TLS=false`
- `BURP_RESPONSE_OVERRIDES_ENABLED=false`
- `BURP_RESPONSE_OVERRIDES_FILE=`

Scope zorunludur; scope disindaki hostlara proxy veya response override uygulanmaz. HTTPS goruntulemek icin Burp CA sertifikasini test makinesine yukleyin. Sertifika kurulamayan local/staging durumlarda `BURP_PROXY_ALLOW_INSECURE_TLS=true` kullanilabilir, fakat production icin uygun degildir.

Durum kontrolu:

- `GET /api/security/burp-suite/status`

Local/staging response override dosyasi ornegi:

```json
{
  "rules": [
    {
      "name": "staging-auth-contract-test",
      "enabled": true,
      "method": "POST",
      "host": "staging.example.com",
      "path": "/api/auth/check",
      "status": 200,
      "body": {
        "ok": true,
        "testMode": true
      }
    }
  ]
}
```

Override sadece izinli test kapsaminda, kendi sisteminizin beklenmeyen provider veya auth cevaplarina nasil davrandigini dogrulamak icindir. Ucuncu taraf sistemlerde dogrulama atlatma amaciyla kullanmayin.

### Twilio Masking

Gercek cagri testi icin gerekli env alanlari:

- `PRIMARY_PROVIDER=TWILIO`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_TWIML_URL`
- `TWILIO_VERIFY_SERVICE_SID`
- `TWILIO_API_KEY_SID`
- `TWILIO_API_KEY_SECRET`
- `TWILIO_TWIML_APP_SID`

PC mikrofonu/hoparloru ile arama icin Twilio Voice JavaScript SDK kullanilir. Her browser `/api/voice/token` ile access token alir, Twilio SDK mikrofonu kullanarak Twilio'ya baglanir ve Twilio TwiML App `Voice URL` olarak `/api/voice/twiml` endpoint'ini cagirmalidir.

Kart listesindeki `Verify Number` butonu Twilio Verify OTP akisini baslatir ve kod onaylaninca `card_phone_numbers.is_verified=true` yapar.

Kart listesindeki `Call` butonu browser softphone ile arama baslatir. TwiML caller ID secimi:

- Kart numarasi verified olsun veya olmasin caller ID olarak kartin kayitli telefon numarasi kullanilir.
- `Verify Number` sadece numaranin uygulama icinde OTP ile dogrulanmasi icindir; arama akisini bloke etmez.
- REST/gateway aramalarinda `VOICE_GATEWAY_PROVIDER` set edilirse caller ID'yi korumak icin unverified caller ID destekleyen gateway'e route edilir.

Not: Twilio tarafinda caller ID kurallari yine gecerlidir. Verified olmayan caller ID'yi aranan tarafta gostermek icin bunu kabul eden gateway/SIP/Telnyx benzeri katmanin Twilio App veya outbound routing akisina baglanmasi gerekir.
