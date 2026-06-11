(function () {
  window.PaymentProcessorActionComponents = window.PaymentProcessorActionComponents || {};
  window.PaymentProcessorActionComponents.paypal = {
    normalizePayload(payload) {
      if (payload.amount) payload.amount = Number(payload.amount);
      return payload;
    }
  };
})();
