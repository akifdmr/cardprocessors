(function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function monthOptions(value = "") {
    return [
      `<option value="">Month</option>`,
      ...Array.from({ length: 12 }, (_, index) => {
        const item = String(index + 1).padStart(2, "0");
        return `<option value="${item}" ${String(value) === item ? "selected" : ""}>${item}</option>`;
      })
    ].join("");
  }

  function yearOptions(value = "") {
    const currentYear = new Date().getFullYear();
    return [
      `<option value="">Year</option>`,
      ...Array.from({ length: 16 }, (_, index) => {
        const item = String(currentYear + index);
        return `<option value="${item}" ${String(value) === item ? "selected" : ""}>${item}</option>`;
      })
    ].join("");
  }

  function renderAddressFields({ open = false } = {}) {
    return `
      <div class="shared-address-block full-span">
        <button type="button" class="ghost small" data-address-toggle>Adres Bilgisi ${open ? "Kapat" : "Ekle"}</button>
        <div class="shared-address-fields form-grid compact-grid" data-address-fields ${open ? "" : "hidden"}>
          <label class="full-span"><span>Street</span><input name="billingAddressLine1" autocomplete="address-line1"></label>
          <label><span>City</span><input name="billingCity" autocomplete="address-level2"></label>
          <label><span>State</span><input name="billingState" autocomplete="address-level1"></label>
          <label><span>ZIP</span><input name="billingZip" autocomplete="postal-code"></label>
          <label><span>Country</span><input name="billingCountry" maxlength="2" value="US" autocomplete="country"></label>
        </div>
      </div>
    `;
  }

  function renderCardFields(options = {}) {
    const {
      includePan = true,
      includeBin = false,
      includeExpiry = true,
      includeCvv = true,
      cvvName = "cvv2",
      includeHolder = true,
      includeAddress = true,
      includeSource = false,
      sourceRequired = false,
      amount = false,
      amountLabel = "Amount",
      amountDefault = "",
      currency = false,
      currencyDefault = "USD",
      panRequired = false,
      binRequired = false
    } = options;

    return `
      <div class="shared-card-fields form-grid compact-grid">
        ${includePan ? `<label class="full-span"><span>Card Number</span><input name="pan" autocomplete="off" inputmode="numeric" data-card-number ${panRequired ? "required" : ""}></label>` : ""}
        ${includeBin ? `<label><span>BIN/IIN</span><input name="bin" maxlength="6" inputmode="numeric" data-bin-input ${binRequired ? "required" : ""}></label>` : ""}
        ${includeExpiry ? `
          <label><span>Exp Month</span><select name="expMonth">${monthOptions()}</select></label>
          <label><span>Exp Year</span><select name="expYear">${yearOptions()}</select></label>
        ` : ""}
        ${includeCvv ? `<label><span>CVV</span><input name="${escapeHtml(cvvName)}" autocomplete="off" inputmode="numeric" maxlength="4"></label>` : ""}
        ${includeHolder ? `<label class="full-span"><span>Cardholder Name</span><input name="cardholderName" autocomplete="cc-name"></label>` : ""}
        ${includeSource ? `<label class="full-span"><span>Source Token</span><input name="source" autocomplete="off" ${sourceRequired ? "required" : ""}></label>` : ""}
        ${amount ? `<label><span>${escapeHtml(amountLabel)}</span><input name="amount" type="text" inputmode="decimal" data-money-format value="${escapeHtml(amountDefault)}"></label>` : ""}
        ${currency ? `<label><span>Currency</span><input name="currency" maxlength="3" value="${escapeHtml(currencyDefault)}"></label>` : ""}
        ${includeAddress ? renderAddressFields({ open: false }) : ""}
      </div>
    `;
  }

  window.CardInputComponent = {
    monthOptions,
    yearOptions,
    renderAddressFields,
    renderCardFields
  };
})();
