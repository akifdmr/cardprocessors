(function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function render({ processors = [], selected = "", healthClass, healthPillClass, healthLabel, actionRenderer } = {}) {
    if (!processors.length) {
      return `<article class="list-card">Processor list loading.</article>`;
    }
    return processors.map((processor) => `
      <div class="processor-menu-card ${processor.key === selected ? "active" : ""}">
        <a href="#/payment-processors/${encodeURIComponent(processor.key)}">
          <span class="processor-health-dot ${healthClass(processor.health)}" data-processor-health="${escapeHtml(processor.key)}"></span>
          <strong>${escapeHtml(processor.label || processor.key)}</strong>
          <span class="status-pill ${healthPillClass(processor.health, processor.configured)}">${escapeHtml(healthLabel(processor.health, processor.configured))}</span>
        </a>
        <div class="processor-menu-actions">
          ${actionRenderer(processor.key)}
        </div>
      </div>
    `).join("");
  }

  window.PaymentProcessorListComponent = { render };
})();
