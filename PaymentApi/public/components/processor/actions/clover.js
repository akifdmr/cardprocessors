(function () {
  window.PaymentProcessorActionComponents = window.PaymentProcessorActionComponents || {};
  window.PaymentProcessorActionComponents.clover = {
    normalizePayload(payload) {
      if (payload.amount) payload.amount = Number(payload.amount);
      payload.currency = payload.currency || "usd";
      return payload;
    }
  };
})();
