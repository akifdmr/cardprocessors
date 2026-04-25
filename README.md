# CloverApp

Bu proje tek uygulama olarak calisir.

- Frontend ayni Node/Express uygulamasindan servis edilir.
- Backend API ayni process icinde calisir.
- Yani ayri bir frontend deployment veya ayri bir backend deployment zorunlu degildir.
- Mimari hedef: tek proje, tek servis, SPA benzeri panel + ayni uygulama icinde API.

Bu proje `.env` üzerinden SQLite ve provider ayarlarını alan basit bir backend iskeletidir.

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

Uygulama local SQLite veritabani kullanacak sekilde ayarlandi.

- Varsayilan `DATABASE_URL`: `jdbc:sqlite:/Users/akifdemir/Library/DBeaverData/workspace6/.metadata/sample-database-sqlite-1/Chinook.db`
- `src/db.js` JDBC SQLite baglanti metnini parse eder.
- Migration dosyasi SQLite uyumlu olacak sekilde guncellendi.

## Kurulum

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. `APP_ENCRYPTION_KEY_BASE64` için 32 byte bir anahtar üretin.
3. `BOOTSTRAP_ADMIN_PASSWORD` degerini degistirin.
4. SQLite veritabaninda [migrations/001_init.sql](/Users/akifdemir/Desktop/Projects/CloverApp/migrations/001_init.sql) dosyasını çalıştırın.
5. Bağımlılıkları yükleyin: `npm install`
6. Sunucuyu başlatın: `npm run dev`

## API uçları

Tum backend endpoint'leri artik `/api` altindadir.

- `GET /health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/users`
- `GET /api/config/providers`
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

Provider entegrasyonlari icin gerekli kimlik bilgileri production tabanli varsayilanlarla hazirlandi, ancak odeme saglayicilarinda dogrulama veya authorization akislarini cagiracak kod bu iskelete eklenmedi.
