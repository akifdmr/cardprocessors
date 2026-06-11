(function () {
  window.PaymentProcessorActionComponents = window.PaymentProcessorActionComponents || {};
  window.PaymentProcessorActionComponents.propelrpay = {
    normalizePayload(payload) {
      payload.account = payload.account || String(payload.pan || "").replace(/\D/g, "");
      if (!payload.expiry && payload.expMonth && payload.expYear) {
        payload.expiry = `${String(payload.expMonth).padStart(2, "0")}${String(payload.expYear).slice(-2)}`;
      }
      payload.expiry = String(payload.expiry || "").replace(/\D/g, "");
      delete payload.cvv2;
      delete payload.expMonth;
      delete payload.expYear;
      delete payload.cardholderName;
      delete payload.billingAddressLine1;
      delete payload.billingCity;
      delete payload.billingState;
      delete payload.billingZip;
      delete payload.billingCountry;
      delete payload.currency;
      delete payload.reference;
      return payload;
    }
  };
})();
