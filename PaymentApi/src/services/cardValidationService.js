function sanitizePan(pan) {
  return String(pan || "").replace(/\D/g, "");
}

function luhnCheck(pan) {
  let sum = 0;
  let shouldDouble = false;

  for (let i = pan.length - 1; i >= 0; i -= 1) {
    let digit = Number(pan[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function inferBrand(pan) {
  if (/^4\d{12}(\d{3})?(\d{3})?$/.test(pan)) {
    return "VISA";
  }
  if (/^(5[1-5]\d{14}|2(2[2-9]|[3-6]\d|7[01])\d{12}|2720\d{12})$/.test(pan)) {
    return "MASTERCARD";
  }
  if (/^3[47]\d{13}$/.test(pan)) {
    return "AMEX";
  }
  if (/^6(?:011|5\d{2}|4[4-9]\d)\d{12,15}$/.test(pan)) {
    return "DISCOVER";
  }
  return "UNKNOWN";
}

function validateExpiry(expMonth, expYear) {
  const month = Number(expMonth);
  const year = Number(expYear);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { valid: false, reason: "Invalid expiration month" };
  }

  if (!Number.isInteger(year) || String(expYear).length !== 4) {
    return { valid: false, reason: "Invalid expiration year" };
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { valid: false, reason: "Card is expired" };
  }

  return { valid: true };
}

function maskPan(pan) {
  return `**** **** **** ${pan.slice(-4)}`;
}

function validateCardInput({ pan, expMonth, expYear, cardholderName, billingZip }) {
  const normalizedPan = sanitizePan(pan);
  const issues = [];

  if (!normalizedPan) {
    issues.push("Card number is required");
  } else if (normalizedPan.length < 12 || normalizedPan.length > 19) {
    issues.push("Card number length is invalid");
  } else if (!luhnCheck(normalizedPan)) {
    issues.push("Card number failed Luhn validation");
  }

  const expiry = validateExpiry(expMonth, expYear);
  if (!expiry.valid) {
    issues.push(expiry.reason);
  }

  if (!cardholderName) {
    issues.push("Cardholder name is recommended");
  }

  if (!billingZip) {
    issues.push("Billing ZIP is recommended");
  }

  return {
    isValid: issues.filter((issue) => issue.includes("invalid") || issue.includes("failed") || issue.includes("expired") || issue.includes("required")).length === 0,
    normalizedPan,
    maskedPan: normalizedPan ? maskPan(normalizedPan) : null,
    first6: normalizedPan ? normalizedPan.slice(0, 6) : null,
    last4: normalizedPan ? normalizedPan.slice(-4) : null,
    brand: normalizedPan ? inferBrand(normalizedPan) : "UNKNOWN",
    issues
  };
}

module.exports = {
  validateCardInput
};
