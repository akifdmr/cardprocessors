cat > test.js << 'EOF'
const { fullCheckCard } = require('./PaymentApi/scripts/getBalance');

(async () => {
    try {
        console.log("🔍 Kart kontrol ediliyor...\n");
        
        const result = await fullCheckCard("5248861053299216|09|2029|378");
        
        console.dir(result, { depth: null, colors: true });
        
        if (result.live) {
            console.log("\n✅ Kart LIVE - Balance:", result.balance);
        } else {
            console.log("\n❌ Kart DEAD veya bağlantı hatası.");
        }
    } catch (error) {
        console.error("\n❌ Hata oluştu:", error.message);
    }
})();
EOF

echo "✅ test.js dosyası başarıyla oluşturuldu."
echo "Şimdi çalıştırmak için aşağıdaki komutu yaz:"
echo "node test.js"
