const fs = require('fs');

// Kullanım: node script.js <girdi_dosyası> <çıktı_dosyası>
const inputFile = process.argv[2] || 'input.txt';
const outputFile = process.argv[3] || 'output.txt';

// Geçerli tarih
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

// Tarih geçmiş mi kontrolü (MM/YYYY)
function isExpired(expiry) {
    const parts = expiry.split('/');
    if (parts.length !== 2) return true;
    const month = parseInt(parts[0], 10);
    const year = parseInt(parts[1], 10);
    if (isNaN(month) || isNaN(year)) return true;
    if (year < currentYear) return true;
    if (year === currentYear && month < currentMonth) return true;
    return false;
}

// Satır ayrıştırma: pan|ay/yıl|cvv|isim|...
function parseLine(line) {
    const fields = line.split('|');
    if (fields.length < 4) return null;
    const pan = fields[0].trim();
    const expiry = fields[1].trim();
    const cvv = fields[2].trim();
    const holder = fields[3].trim();
    if (!pan || !expiry || !cvv || !holder) return null;
    return { pan, expiry, cvv, holder };
}

// Dosyayı oku
fs.readFile(inputFile, 'utf8', (err, data) => {
    if (err) {
        console.error(`Dosya okunamadı: ${inputFile}`, err.message);
        process.exit(1);
    }

    const lines = data.split(/\r?\n/);
    const validCards = [];

    for (const line of lines) {
        if (line.trim() === '') continue;
        const card = parseLine(line);
        if (!card) continue;

        if (!isExpired(card.expiry)) {
            validCards.push(card);
        }
    }

    // Tekrarları kaldır (tamamen aynı kayıt)
    const uniqueCards = [];
    const seen = new Set();
    for (const card of validCards) {
        const key = `${card.pan}|${card.expiry}|${card.cvv}|${card.holder}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueCards.push(card);
        }
    }

    // Çıktı formatı: pan|MM/YYYY|cvv|holder name
    const outputLines = uniqueCards.map(card => 
        `${card.pan}|${card.expiry}|${card.cvv}|${card.holder}`
    );

    fs.writeFile(outputFile, outputLines.join('\n'), 'utf8', (err) => {
        if (err) {
            console.error(`Çıktı dosyası yazılamadı: ${outputFile}`, err.message);
            process.exit(1);
        }
        console.log(`İşlem tamam. ${outputLines.length} adet geçerli kart kaydedildi: ${outputFile}`);
        console.log(outputLines.join('\n')); // İsterseniz konsola da yazdırın
    });
});