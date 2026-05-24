// cloverLearningService.js - sadece verilen BIN'i kullanır, sabit liste yok
const { Admin } = require("mongodb");
const cloverService = require("./cloverService");

// ---------- 1. Luhn Algoritması ----------
function luhnChecksum(partial) {
  let sum = 0;
  let isEven = false;
  for (let i = partial.length - 1; i >= 0; i--) {
    let digit = parseInt(partial[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return (sum * 9) % 10;
}

function generateCardNumber(bin, totalLength = 16) {
  if (bin.length >= totalLength) throw new Error("BIN uzunluğu kart numarasından büyük olamaz");
  const randomPartLength = totalLength - bin.length - 1;
  let randomPart = "";
  for (let i = 0; i < randomPartLength; i++) {
    randomPart += Math.floor(Math.random() * 10);
  }
  const partial = bin + randomPart;
  const checksum = luhnChecksum(partial);
  return partial + checksum;
}

function generateCVV(length = 3) {
  let cvv = "";
  for (let i = 0; i < length; i++) cvv += Math.floor(Math.random() * 10);
  return cvv;
}

function generateExpiryDate(futureYearsRange = 3) {
  const now = new Date();
  const futureYears = Math.floor(Math.random() * futureYearsRange) + 1;
  const year = now.getFullYear() + futureYears;
  const month = Math.floor(Math.random() * 12) + 1;
  const monthStr = month.toString().padStart(2, "0");
  const yearStr = (year % 100).toString().padStart(2, "0");
  return { month: monthStr, year: yearStr, formatted: `${monthStr}/${yearStr}` };
}

function summarizeGeneratedCard(card) {
  const number = String(card.number || "");
  return {
    first6: number.slice(0, 6),
    last4: number.slice(-4),
    maskedPan: number ? `${number.slice(0, 6)}******${number.slice(-4)}` : null,
    expMonth: card.expiry?.month || null,
    expYear: card.expiry?.year || null,
    expiry: card.expiry?.formatted || null,
    cvvLength: String(card.cvv || "").length
  };
}

// ---------- 2. Hata Stratejileri (BIN ASLA DEĞİŞMEZ) ----------
const errorStrategyMap = {
  invalid_number: {
    action: "INVALID_BIN_WARNING",
    message: "Kart numarası sistem tarafından kabul edilmedi. BIN sabit, sadece CVV/SKT değişebilir.",
    update: (strategy) => {
      console.log(`[Strateji] invalid_number -> BIN değiştirilmedi (${strategy.bin}), CVV veya SKT aralığı güncellenebilir.`);
      strategy.cvvLength = strategy.cvvLength === 3 ? 4 : 3;
    }
  },
  incorrect_number: {
    action: "FIX_NUMBER_FORMAT",
    message: "Kart numarası formatı yanlış (Luhn/uzunluk). Aynı BIN ile yeniden deneniyor.",
    update: (strategy) => {}
  },
  invalid_card_type: {
    action: "INVALID_BIN_WARNING",
    message: "Kart tipi tanınmıyor. BIN sabit, sadece CVV/SKT değişebilir.",
    update: (strategy) => {
      console.log(`[Strateji] invalid_card_type -> BIN değiştirilmedi (${strategy.bin})`);
      strategy.futureYearsRange = Math.min(strategy.futureYearsRange + 1, 10);
    }
  },
  expired_card: {
    action: "UPDATE_EXPIRY_DATE",
    message: "Son kullanma tarihi geçmiş. SKT aralığı genişletiliyor.",
    update: (strategy) => {
      strategy.futureYearsRange = Math.min(strategy.futureYearsRange + 1, 10);
    }
  },
  incorrect_cvc: {
    action: "FIX_CVV_FORMAT",
    message: "CVV geçersiz. CVV uzunluğu değiştiriliyor (3↔4).",
    update: (strategy) => {
      strategy.cvvLength = strategy.cvvLength === 3 ? 4 : 3;
    }
  },
  rate_limit: {
    action: "WAIT_AND_RETRY",
    message: "Rate limit aşıldı, 2 saniye bekleniyor.",
    update: async () => { await new Promise(resolve => setTimeout(resolve, 2000)); }
  },
  processing_error: {
    action: "RETRY",
    message: "İşlem hatası, aynı kartla tekrar denenebilir.",
    update: () => {}
  },
  card_declined: {
    action: "DECLINED_BUT_VALID",
    message: "Kart formatı doğru ancak işlem reddedildi. Live kart değil.",
    update: () => {}
  },
  clover_error: {
    action: "GENERIC_ERROR_RETRY",
    message: "Clover'dan genel bir hata alındı. Kısa süre beklenip yeniden deneniyor.",
    update: async () => {
      console.log(`[Strateji] clover_error oluştu, 3 saniye bekleniyor...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
};

// ---------- 3. Öğrenen Kart Üretici Sınıfı (BIN sabit) ----------
class LearningCardGenerator {
  constructor(initialBin, cardLength = 16) {
    this.errorLog = [];
    this.successfulCards = [];
    this.currentStrategy = {
      bin: initialBin,      // bu değer asla değişmez
      cardLength: cardLength,
      cvvLength: 3,
      futureYearsRange: 3
    };
    this.fixedBin = initialBin; // referans
  }

  generateCard() {
    const cardNumber = generateCardNumber(this.fixedBin, this.currentStrategy.cardLength);
    return {
      number: cardNumber,
      cvv: generateCVV(this.currentStrategy.cvvLength),
      expiry: generateExpiryDate(this.currentStrategy.futureYearsRange)
    };
  }

  async updateStrategyFromError(errorCode) {
    const strategy = errorStrategyMap[errorCode];
    if (!strategy) {
      console.warn(`Bilinmeyen hata kodu: ${errorCode}`);
      return;
    }
    console.log(`[Öğrenme] Hata: ${errorCode} -> ${strategy.action}`);
    if (strategy.update) await strategy.update(this.currentStrategy);
    // BIN'in sabit kaldığını garanti et
    this.currentStrategy.bin = this.fixedBin;
    this.errorLog.push({
      errorCode,
      timestamp: new Date().toISOString(),
      strategySnapshot: { ...this.currentStrategy, fixedBin: this.fixedBin }
    });
  }

  getFinalStrategy() {
    return { ...this.currentStrategy, fixedBin: this.fixedBin };
  }
}

// ---------- 4. Clover API ile Doğrulama (Gerçek veya simülasyon - sabit BIN) ----------
async function verifyCardWithClover(card, cloverConfig) {
  const isSimulation = !cloverConfig.configured || !cloverConfig.apiAccessKey;
  
  if (isSimulation) {
    console.log(`[SIMÜLASYON] Kart test ediliyor: ${JSON.stringify(summarizeGeneratedCard(card))}`);
    // Simülasyonda hiçbir kart "başarılı" olmasın (çünkü canlıda gerçek API kullanılır)
    // Sadece card_declined simüle edilir.
    return { success: false, errorCode: "card_declined" };
  }

  try {
    const tokenization = await cloverService.tokenizeCard({
      pan: card.number,
      cvv: card.cvv,
      expMonth: card.expiry.month,
      expYear: card.expiry.year
    });
    const token = tokenization.source;
    
    const charge = await cloverService.createCharge({
      source: token,
      amount: 1,
      currency: "usd"
    });
    return { success: true, token, chargeId: charge.id };
  } catch (error) {
    const providerData = error.response?.data || {};
    const providerError = providerData.error || {};
    const errorCode =
      providerError.code ||
      providerData.code ||
      providerData.errorCode ||
      error.code ||
      "clover_error";
    return { success: false, errorCode, providerStatus: error.response?.status };
  }
}

// ---------- 5. Ana Döngü ----------
async function generateVerifiedCards(bin, quantity, cloverConfig, maxAttemptsPerCard = 30) {
  const generator = new LearningCardGenerator(bin, 16);
  const verifiedCards = [];
  const attempts = [];
  let totalAttempts = 0;
  const maxTotalAttempts = maxAttemptsPerCard * quantity;

  while (verifiedCards.length < quantity && totalAttempts < maxTotalAttempts) {
    totalAttempts++;
    const card = generator.generateCard();
    const maskedCard = summarizeGeneratedCard(card);
    console.log(`[clover-machine-learning:attempt-card] ${JSON.stringify({
      attempt: totalAttempts,
      card: maskedCard,
      checkedAt: new Date().toISOString()
    })}`);
    
    const result = await verifyCardWithClover(card, cloverConfig);
    const attemptRecord = {
      attempt: totalAttempts,
      status: result.success ? "success" : "failed",
      errorCode: result.errorCode || null,
      providerStatus: result.providerStatus || null,
      providerMessage: result.providerMessage || null,
      card: card,
      strategySnapshot: generator.getFinalStrategy(),
      checkedAt: new Date().toISOString()
    };
    attempts.push(attemptRecord);
    console.log(`[clover-machine-learning:attempt-result] ${JSON.stringify(attemptRecord)}`);
    
    if (result.success) {
      verifiedCards.push({
        ...card,
        verifiedAt: new Date().toISOString(),
        tokenized: result.token || null
      });
      console.log(`✅ Başarılı! Toplam doğrulanan: ${verifiedCards.length}`);
    } else if (result.errorCode) {
      console.log(`❌ Hata: ${result.errorCode}`);
      await generator.updateStrategyFromError(result.errorCode);
    }
  }

  return {
    success: verifiedCards.length === quantity,
    generatedCount: verifiedCards.length,
    cards: verifiedCards,
    attempts,
    totalAttempts,
    finalStrategy: generator.getFinalStrategy(),
    errorLog: generator.errorLog.slice(-20)
  };
}

// ---------- 6. Redacted Loglama ----------
function redactMachineLearningValue(key, value) {
  const normalizedKey = String(key || "").toLowerCase();
  if (["number", "pan", "cardnumber"].includes(normalizedKey) && typeof value === "string") {
    return value.length > 4 ? `****${value.slice(-4)}` : "****";
  }
  if (["cvv", "cvv2", "cvc"].includes(normalizedKey)) {
    return "***";
  }
  if (["source", "sourcetoken", "token", "providerpaymenttoken", "apiaccesskey"].includes(normalizedKey) && typeof value === "string") {
    return value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : "***";
  }
  return value;
}

function logMachineLearningResponse(label, response) {
  console.log(
    `[clover-machine-learning:${label}]`,
    JSON.stringify(response, redactMachineLearningValue, 2)
  );
  return response;
}

// ---------- 7. Dışa Aktarılan Ana Fonksiyonlar (Eski parametre yapısına uygun) ----------
function getCloverLearningStatus() {
  const clover = cloverService.getIframeConfig();
  const response = {
    configured: clover.configured,
    missing: clover.missing,
    clover: {
      merchantId: clover.merchantId,
      tokenApiBaseUrl: clover.tokenApiBaseUrl,
      ecommerceApiBaseUrl: clover.ecommerceApiBaseUrl,
      sdkUrl: clover.sdkUrl,
      hasApiAccessKey: Boolean(clover.apiAccessKey),
    },
    methods: {
      createRun: "machine_learning_scaffold_implemented",
    },
  };
  return logMachineLearningResponse("status", response);
}

async function createRun(options = {}) {
  const binRaw = String(options.bin || "").replace(/\D/g, "");
  const quantityRaw = Number.parseInt(options.quantity, 10);
  const maxAttemptsRaw = Number.parseInt(options.maxAttempts, 10);
  const bin = binRaw.length >= 4 ? binRaw : "400000"; // varsayılan yedek BIN, ancak siz kendi BIN'inizi verin
  const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.min(quantityRaw, 100) : 1;
  const maxAttempts = Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw > 0 ? Math.min(maxAttemptsRaw, 200) : 30;

  const cloverConfig = cloverService.getIframeConfig();
  const result = await generateVerifiedCards(bin, quantity, cloverConfig, maxAttempts);
  
  const response = {
    ok: result.success,
    status: result.success ? "completed" : "partial",
    mode: "machine_learning_scaffold",
    message: result.success
      ? `${quantity} adet kart başarıyla doğrulandı.`
      : `${result.generatedCount}/${quantity} kart doğrulandı. ${result.totalAttempts} deneme yapıldı.`,
    input: { bin, quantity, maxAttempts },
    output: {
      requestedCount: quantity,
      validCount: result.generatedCount,
      invalidCount: Math.max(0, result.totalAttempts - result.generatedCount),
      attempts: result.attempts,
      validCards: result.cards,
      cards: result.cards,
      totalAttempts: result.totalAttempts,
      finalStrategy: result.finalStrategy,
      recentErrors: result.errorLog,
    },
    cloverContext: {
      configured: cloverConfig.configured,
      merchantId: cloverConfig.merchantId,
      hasApiAccessKey: Boolean(cloverConfig.apiAccessKey),
    },
  };
  
  return logMachineLearningResponse("run", response);
}

module.exports = {
  createRun,
  getCloverLearningStatus,
};