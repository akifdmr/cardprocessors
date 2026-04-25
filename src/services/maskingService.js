const { v4: uuidv4 } = require('uuid');

class MaskingService {
    constructor() {
        // Gerçek numara ↔ Maske numarası eşleştirmesi (production'da Redis önerilir)
        this.maskMap = new Map();        // maskNumber -> realNumber
        this.realMap = new Map();        // realNumber -> maskNumber
    }

    /**
     * Gerçek numarayı maskelenmiş numaraya çevirir
     */
    createMaskedNumber(realPhone) {
        // Daha önce maskelenmiş mi kontrol et
        if (this.realMap.has(realPhone)) {
            return this.realMap.get(realPhone);
        }

        // Yeni maske numarası oluştur (örnek: +90 555 123 45 67)
        const randomPart = Math.floor(10000000 + Math.random() * 90000000).toString();
        const maskedNumber = `+90 555 ${randomPart.substring(0,3)} ${randomPart.substring(3,5)} ${randomPart.substring(5)}`;

        this.maskMap.set(maskedNumber, realPhone);
        this.realMap.set(realPhone, maskedNumber);

        return maskedNumber;
    }

    /**
     * Maskelenmiş numaradan gerçek numarayı bulur
     */
    getRealNumber(maskedNumber) {
        return this.maskMap.get(maskedNumber) || null;
    }

    /**
     * Maskelenmiş numara oluşturup, çağrı/SMS yönlendirme bilgisiyle birlikte döner
     */
    createSession(realFrom, realTo) {
        const maskedFrom = this.createMaskedNumber(realFrom);
        const maskedTo = this.createMaskedNumber(realTo);

        const sessionId = uuidv4();

        return {
            sessionId,
            maskedFrom,
            maskedTo,
            realFrom,
            realTo,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 saat
        };
    }
}

module.exports = new MaskingService();
