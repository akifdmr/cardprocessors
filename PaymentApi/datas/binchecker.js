// binchecker.js - CommonJS format (require kullanır)
const fs = require('fs');

async function checkBIN(cardNumber) {
    const bin = cardNumber.slice(0, 6);
    try {
        const response = await fetch(`https://lookup.binlist.net/${bin}`);
        const data = await response.json();
        const country = data.country?.name || 'UNKNOWN';
        const bank = data.bank?.name || 'UNKNOWN';
        const type = data.type || 'UNKNOWN';
        
        // Kart seviyesini bul
        let level = 'STANDARD';
        const dataStr = JSON.stringify(data).toUpperCase();
        if (dataStr.includes('PLATINUM')) level = 'PLATINUM';
        else if (dataStr.includes('SIGNATURE')) level = 'SIGNATURE';
        else if (dataStr.includes('GOLD')) level = 'GOLD';
        
        return `${country}/${bank}/${type}/${level}`;
    } catch (error) {
        return 'UNKNOWN/UNKNOWN/UNKNOWN/UNKNOWN';
    }
}

async function main() {
    console.log('BIN Checker başlatıldı...');
    
    // Dosyayı oku
    const fileContent = fs.readFileSync('cikti.txt', 'utf-8');
    const lines = fileContent.split('\n');
    
    const results = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split('|');
        const cardNumber = parts[0];
        const expiry = parts[1];
        const cvv = parts[2];
        const name = parts[3] || '';
        
        console.log(`Sorgulanıyor: ${cardNumber.slice(0,6)}... (${i+1}/${lines.length})`);
        
        const binInfo = await checkBIN(cardNumber);
        
        // Bekleme (rate limit için)
        await new Promise(resolve => setTimeout(resolve, 200));
        
        if (name) {
            results.push(`${cardNumber}|${expiry}|${cvv}|${name}| ${binInfo}`);
        } else {
            results.push(`${cardNumber}|${expiry}|${cvv}| | ${binInfo}`);
        }
    }
    
    // Sonuçları yaz
    fs.writeFileSync('output.txt', results.join('\n'));
    console.log('\n✅ Tamamlandı! Sonuçlar output.txt dosyasına yazıldı.');
    console.log('\nÖrnek çıktı:');
    console.log(results[0]);
}

main().catch(console.error);