# Safe Card Intake Flow

Bu akış, kartları "live" test etmek için degil; musteri onayli kart ekleme ve provider token tabanli dogrulama icin tasarlanmistir.

## Amac

Sistem su isi yapar:

1. Kart verisini kullanicidan alir.
2. Karti lokal olarak format/Luhn/expiry acisindan kontrol eder.
3. Ham PAN yerine provider token veya payment method referansi saklar.
4. Provider tarafindan donen verification/authorize sonucunu karta bagli olarak kaydeder.
5. Tum adimlari audit log'a yazar.

Sistem su isi yapmaz:

- Kart "live" mi diye toplu check yapmaz.
- Yetkisiz bakiye veya auth sinyali toplamaz.
- CVV veya ham kart numarasini veritabanina yazmaz.

## Akis

### 1. Local validation

`POST /cards/validate-input`

Istek:

```json
{
  "pan": "4242424242424242",
  "expMonth": "12",
  "expYear": "2030",
  "cardholderName": "John Doe",
  "billingZip": "33101"
}
```

Bu adim:

- PAN formatini normalize eder
- Luhn kontrolu yapar
- expiry tarihini kontrol eder
- marka tahmini yapar
- sonucu audit log'a yazar

Yanitta sadece maske bilgi doner:

- `maskedPan`
- `first6`
- `last4`
- `brand`
- `issues`

### 2. Tokenized card save

`POST /cards`

Bu adimdan once provider tarafinda token olusmus olmalidir. Sisteme ham PAN degil, `providerPaymentToken` girilir.

### 3. Provider verification recording

`POST /cards/:cardId/provider-verification`

Bu adim, provider'dan gelen meşru verification sonucunu sisteme yazar.

Ornek:

```json
{
  "provider": "clover",
  "verificationStatus": "verified",
  "providerReferenceId": "ref_123",
  "avsResult": "Y",
  "authResultCode": "00"
}
```

Bu endpoint:

- kart durumunu gunceller
- `provider_reference_id`, `avs_result`, `auth_result_code` alanlarini doldurur
- audit log olusturur

### 4. Audit visibility

`GET /audit-logs`

Opsiyonel filtreler:

- `entityType`
- `entityId`
- `limit`

Bu loglar sayesinde kim ne zaman kart kaydetti, local validation yapti veya provider verification sonucu girdi gorulebilir.

## Onerilen UI akisi

1. Kullanici kart formunu doldurur.
2. UI once `POST /cards/validate-input` cagirir.
3. Validation gecerliyse provider tarafinda tokenization yapilir.
4. Token geldikten sonra `POST /cards` ile kart kaydedilir.
5. Provider sonucu varsa `POST /cards/:cardId/provider-verification` ile durum islenir.
6. Gecmis hareketler `GET /audit-logs?entityType=card&entityId=...` ile gorulur.
