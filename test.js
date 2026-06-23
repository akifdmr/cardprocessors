const { fullCheckCard } = require('./PaymentApi/scripts/getBalance');

(async () => {
    try {
        console.log("🔍 Kart kontrol ediliyor...\n");
        const result = await fullCheckCard("5248861053299216|09|2029|378");
        console.dir(result, { depth: null, colors: true });
        
        if (result.live === true) {
            console.log("\n✅ KART LIVE | Balance:", result.balance);
        } else {
            console.log("\n❌ Kart Dead veya bağlantı sorunu var.");
        }
    } catch (error) {
        console.error("\n❌ Hata:", error.message);
    }
})();
