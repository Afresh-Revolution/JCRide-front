(function () {
  "use strict";

  const form = document.getElementById("settings-form");
  const saveBtn = document.getElementById("settings-save-btn");
  const zonesEl = document.getElementById("settings-zones-tags");
  const cityInput = document.getElementById("settings-city-input");
  const addCityBtn = document.getElementById("settings-add-city-btn");
  const toast = document.getElementById("settings-toast");

  let operationalZones = [];
  let settingsLoaded = false;

  function showToast(message, isError) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", Boolean(isError));
    toast.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { toast.hidden = true; }, 4000);
  }

  function apiRequest(url, options) {
    return fetch(url, options).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || data.detail || "Request failed");
        return data;
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function renderZones() {
    if (!zonesEl) return;
    zonesEl.innerHTML = operationalZones.map(function (city, index) {
      return (
        '<span class="settings-zone-tag">' +
          escapeHtml(city) +
          '<button type="button" data-index="' + index + '" aria-label="Remove ' + escapeHtml(city) + '">×</button>' +
        '</span>'
      );
    }).join("");
    zonesEl.querySelectorAll("button[data-index]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        operationalZones.splice(Number(btn.getAttribute("data-index")), 1);
        renderZones();
      });
    });
  }

  function setField(name, value) {
    const input = form && form.querySelector('[name="' + name + '"]');
    if (input && value != null) input.value = value;
  }

  function loadSettings() {
    return apiRequest("/admin/api/settings/platform").then(function (data) {
      setField("economy_base_fare_ngn", data.economy_base_fare_ngn);
      setField("comfort_base_fare_ngn", data.comfort_base_fare_ngn);
      setField("premium_base_fare_ngn", data.premium_base_fare_ngn);
      setField("economy_per_km_ngn", data.economy_per_km_ngn);
      setField("waiting_time_per_minute_ngn", data.waiting_time_per_minute_ngn);
      setField("traffic_surcharge_multiplier", data.traffic_surcharge_multiplier);
      setField("cancellation_fee_ngn", data.cancellation_fee_ngn);
      setField("service_fee_percent", data.service_fee_percent);
      setField("min_vehicle_year", data.min_vehicle_year);
      setField("background_check_provider", data.background_check_provider);
      setField("min_driver_rating_threshold", data.min_driver_rating_threshold);

      const docs = data.required_documents || [];
      setField("required_documents", Array.isArray(docs) ? docs.join(", ") : docs);

      const integration = data.payment_integration || {};
      setField("merchant_code", integration.merchant_code);
      setField("settlement_account", integration.settlement_account);
      setField("webhook_url", integration.webhook_url);
      setField("settlement_schedule", integration.settlement_schedule);
      setField("api_secret", "");

      operationalZones = Array.isArray(data.operational_zones) ? data.operational_zones.slice() : [];
      renderZones();
      settingsLoaded = true;
      if (saveBtn) saveBtn.disabled = false;
    }).catch(function (err) {
      settingsLoaded = false;
      if (saveBtn) saveBtn.disabled = true;
      showToast(err.message, true);
    });
  }

  function collectPayload() {
    const docsRaw = (form.querySelector('[name="required_documents"]') || {}).value || "";
    const docs = docsRaw.split(",").map(function (part) { return part.trim(); }).filter(Boolean);
    const payload = {
      economy_base_fare_ngn: Number(form.querySelector('[name="economy_base_fare_ngn"]').value),
      comfort_base_fare_ngn: Number(form.querySelector('[name="comfort_base_fare_ngn"]').value),
      premium_base_fare_ngn: Number(form.querySelector('[name="premium_base_fare_ngn"]').value),
      economy_per_km_ngn: Number(form.querySelector('[name="economy_per_km_ngn"]').value),
      waiting_time_per_minute_ngn: Number(form.querySelector('[name="waiting_time_per_minute_ngn"]').value),
      traffic_surcharge_multiplier: Number(form.querySelector('[name="traffic_surcharge_multiplier"]').value),
      cancellation_fee_ngn: Number(form.querySelector('[name="cancellation_fee_ngn"]').value),
      service_fee_percent: Number(form.querySelector('[name="service_fee_percent"]').value),
      min_vehicle_year: Number(form.querySelector('[name="min_vehicle_year"]').value),
      required_documents: docs,
      background_check_provider: form.querySelector('[name="background_check_provider"]').value,
      min_driver_rating_threshold: Number(form.querySelector('[name="min_driver_rating_threshold"]').value),
      operational_zones: operationalZones,
      payment_integration: {
        merchant_code: form.querySelector('[name="merchant_code"]').value,
        settlement_account: form.querySelector('[name="settlement_account"]').value,
        webhook_url: form.querySelector('[name="webhook_url"]').value,
        settlement_schedule: form.querySelector('[name="settlement_schedule"]').value,
      },
    };
    const apiSecret = form.querySelector('[name="api_secret"]').value;
    if (apiSecret) payload.payment_integration.api_secret = apiSecret;
    return payload;
  }

  if (addCityBtn && cityInput) {
    addCityBtn.addEventListener("click", function () {
      const city = cityInput.value.trim();
      if (!city) return;
      if (operationalZones.indexOf(city) === -1) operationalZones.push(city);
      cityInput.value = "";
      renderZones();
    });
    cityInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        addCityBtn.click();
      }
    });
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.addEventListener("click", function () {
      const isLanding = window.LandingSettings && window.LandingSettings.isLandingTabActive();
      if (!isLanding && !settingsLoaded) {
        showToast("Platform settings are not loaded yet.", true);
        return;
      }
      saveBtn.disabled = true;
      const request = isLanding
        ? window.LandingSettings.save()
        : apiRequest("/admin/api/settings/platform", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(collectPayload()),
          });

      Promise.resolve(request)
        .then(function () {
          showToast(isLanding ? "Landing page published." : "Platform settings saved.");
          if (!isLanding) loadSettings();
        })
        .catch(function (err) { showToast(err.message, true); })
        .finally(function () { saveBtn.disabled = false; });
    });
  }

  document.querySelectorAll(".settings-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      const target = tab.getAttribute("data-settings-tab");
      document.querySelectorAll(".settings-tab").forEach(function (t) {
        t.classList.toggle("is-active", t === tab);
      });
      const platformPanel = document.getElementById("settings-platform-panel");
      const landingPanel = document.getElementById("settings-landing-panel");
      if (platformPanel) platformPanel.hidden = target !== "platform";
      if (landingPanel) landingPanel.hidden = target !== "landing";
      if (saveBtn) {
        saveBtn.lastChild.textContent = target === "landing" ? " Publish landing page" : " Save changes";
      }
    });
  });

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (saveBtn) saveBtn.click();
    });
  }

  loadSettings();
})();
