(function () {
  let overlay;

  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "actionLoader";
    overlay.className = "action-loader";
    overlay.innerHTML = `<span class="busy-spinner"></span><strong data-action-loader-label>İşlem yapılıyor</strong>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function set(active, label = "İşlem yapılıyor") {
    const element = ensure();
    element.querySelector("[data-action-loader-label]").textContent = label;
    element.classList.toggle("active", Boolean(active));
  }

  window.ActionLoader = { set };
})();
