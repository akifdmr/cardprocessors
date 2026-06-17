const fs = require('fs');

// Kullanım: node script.js input.json output.txt
const inputFile = process.argv[2] || 'data.json';
const outputFile = process.argv[3] || 'output.txt';

// Geçerli tarih
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

// Tarih geçmiş mi?
function isExpired(month, year) {
    const cardYear = parseInt(year, 10);
    const cardMonth = parseInt(month, 10);

    if (isNaN(cardYear) || isNaN(cardMonth)) return true;

    if (cardYear < currentYear) return true;
    if (cardYear === currentYear && cardMonth < currentMonth) return true;

    return false;
}

// JSON oku
fs.readFile(inputFile, 'utf8', (err, data) => {
    if (err) {
        console.error('Dosya okunamadı:', err.message);
        return;
    }

    try {
        const records = JSON.parse(data);

        if (!Array.isArray(records)) {
            throw new Error('JSON bir dizi olmalı');
        }

        // Aktif kayıtlar
        const activeRecords = records.filter(item =>
            !isExpired(item.month, item.year)
        );

        // Duplicate temizleme
        const unique = [];
        const seen = new Set();

        for (const item of activeRecords) {
            const key = `${item.number}|${item.month}|${item.year}|${item.cvv}`;

            if (seen.has(key)) continue;

            seen.add(key);
            unique.push(item);
        }

        // TXT format
        const outputLines = unique.map(item =>
            `${item.number}|${item.month}/${item.year}|${item.cvv}`
        );

        // DOSYAYA YAZ
        fs.writeFile(outputFile, outputLines.join('\n'), 'utf8', (err) => {
            if (err) {
                console.error('Yazma hatası:', err.message);
                return;
            }

            console.log(`OK: ${unique.length} kayıt yazıldı -> ${outputFile}`);
        });

    } catch (e) {
        console.error('JSON hatası:', e.message);
    }
});