(function () {
  "use strict";

  const form = document.getElementById("settings-form");
  const saveBtn = document.getElementById("settings-save-btn");
  const zonesEl = document.getElementById("settings-zones-tags");
  const cityInput = document.getElementById("settings-city-input");
  const addCityBtn = document.getElementById("settings-add-city-btn");
  const toast = document.getElementById("settings-toast");
  const bikeSaveBadge = document.getElementById("bike-pricing-save-badge");

  const BIKE_FIELD_NAMES = [
    "base_bike_fare_ngn",
    "per_km_bike_ngn",
    "small_package_ngn",
    "medium_package_ngn",
    "large_package_ngn",
    "bike_insurance_cover_ngn",
  ];

  let operationalZones = [];
  let platformSettingsLoaded = false;
  let zonesDirty = false;

  function markZonesDirty() {
    zonesDirty = true;
  }

  function showToast(message, isError) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", Boolean(isError));
    toast.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () { toast.hidden = true; }, 4000);
  }

  function showBikeSaveBadge() {
    if (!bikeSaveBadge) return;
    bikeSaveBadge.hidden = false;
    bikeSaveBadge.classList.add("is-visible");
    clearTimeout(showBikeSaveBadge._timer);
    showBikeSaveBadge._timer = setTimeout(function () {
      bikeSaveBadge.hidden = true;
      bikeSaveBadge.classList.remove("is-visible");
    }, 3500);
  }

  function apiRequest(url, options) {
    return fetch(url, options).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          const detail = data.detail;
          const message = data.message
            || (typeof detail === "string" ? detail : null)
            || (Array.isArray(detail) ? detail.map(function (item) { return item.msg; }).join(", ") : null)
            || "Request failed";
          throw new Error(message);
        }
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
        markZonesDirty();
        renderZones();
      });
    });
  }

  function setField(name, value) {
    const input = form && form.querySelector('[name="' + name + '"]');
    if (input && value != null && value !== "") input.value = value;
  }

  function parseOptionalNumber(name) {
    const input = form && form.querySelector('[name="' + name + '"]');
    if (!input) return undefined;
    const raw = String(input.value).trim();
    if (raw === "") return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }

  function parseOptionalString(name) {
    const input = form && form.querySelector('[name="' + name + '"]');
    if (!input) return undefined;
    const raw = String(input.value).trim();
    return raw === "" ? undefined : raw;
  }

  function assignIfDefined(target, key, value) {
    if (value !== undefined) target[key] = value;
  }

  function loadBikePricing() {
    return apiRequest("/admin/api/settings/bike-delivery")
      .then(function (data) {
        BIKE_FIELD_NAMES.forEach(function (name) {
          setField(name, data[name]);
        });
      })
      .catch(function () {
        return apiRequest("/admin/api/bike-delivery/pricing").then(function (data) {
          const map = {
            base_bike_fare: "base_bike_fare_ngn",
            per_km_bike: "per_km_bike_ngn",
            small_package: "small_package_ngn",
            medium_package: "medium_package_ngn",
            large_package: "large_package_ngn",
          };
          (data.items || []).forEach(function (item) {
            const field = map[item.key];
            if (field) setField(field, item.amount_ngn);
          });
        });
      })
      .catch(function () {
        /* bike pricing unavailable */
      });
  }

  function loadSettings() {
    return Promise.all([
      apiRequest("/admin/api/settings/platform").then(function (data) {
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
        platformSettingsLoaded = true;
        zonesDirty = false;
        renderZones();
      }),
      loadBikePricing(),
    ]).catch(function (err) {
      showToast(err.message, true);
    });
  }

  function collectBikePayload() {
    const payload = {};
    BIKE_FIELD_NAMES.forEach(function (name) {
      assignIfDefined(payload, name, parseOptionalNumber(name));
    });
    return payload;
  }

  function collectPlatformPayload() {
    const payload = {};
    assignIfDefined(payload, "economy_base_fare_ngn", parseOptionalNumber("economy_base_fare_ngn"));
    assignIfDefined(payload, "comfort_base_fare_ngn", parseOptionalNumber("comfort_base_fare_ngn"));
    assignIfDefined(payload, "premium_base_fare_ngn", parseOptionalNumber("premium_base_fare_ngn"));
    assignIfDefined(payload, "economy_per_km_ngn", parseOptionalNumber("economy_per_km_ngn"));
    assignIfDefined(payload, "waiting_time_per_minute_ngn", parseOptionalNumber("waiting_time_per_minute_ngn"));
    assignIfDefined(payload, "traffic_surcharge_multiplier", parseOptionalNumber("traffic_surcharge_multiplier"));
    assignIfDefined(payload, "cancellation_fee_ngn", parseOptionalNumber("cancellation_fee_ngn"));
    assignIfDefined(payload, "service_fee_percent", parseOptionalNumber("service_fee_percent"));
    assignIfDefined(payload, "min_vehicle_year", parseOptionalNumber("min_vehicle_year"));
    assignIfDefined(payload, "min_driver_rating_threshold", parseOptionalNumber("min_driver_rating_threshold"));
    assignIfDefined(payload, "background_check_provider", parseOptionalString("background_check_provider"));

    const docsRaw = (form.querySelector('[name="required_documents"]') || {}).value || "";
    const docs = docsRaw.split(",").map(function (part) { return part.trim(); }).filter(Boolean);
    if (docs.length) payload.required_documents = docs;

    if (platformSettingsLoaded || zonesDirty) {
      payload.operational_zones = operationalZones.slice();
    }

    const paymentIntegration = {};
    assignIfDefined(paymentIntegration, "merchant_code", parseOptionalString("merchant_code"));
    assignIfDefined(paymentIntegration, "settlement_account", parseOptionalString("settlement_account"));
    assignIfDefined(paymentIntegration, "webhook_url", parseOptionalString("webhook_url"));
    assignIfDefined(paymentIntegration, "settlement_schedule", parseOptionalString("settlement_schedule"));
    const apiSecret = parseOptionalString("api_secret");
    if (apiSecret) paymentIntegration.api_secret = apiSecret;
    if (Object.keys(paymentIntegration).length) payload.payment_integration = paymentIntegration;

    return payload;
  }

  function savePlatformSettings() {
    const payload = collectPlatformPayload();
    if (Object.keys(payload).length === 0) {
      return Promise.resolve();
    }
    return apiRequest("/admin/api/settings/platform", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  function saveBikePricing() {
    const payload = collectBikePayload();
    if (Object.keys(payload).length === 0) {
      return Promise.resolve(false);
    }
    return apiRequest("/admin/api/settings/bike-delivery", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function () { return true; });
  }

  if (addCityBtn && cityInput) {
    addCityBtn.addEventListener("click", function () {
      const city = cityInput.value.trim();
      if (!city) return;
      if (operationalZones.indexOf(city) === -1) operationalZones.push(city);
      markZonesDirty();
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
    saveBtn.addEventListener("click", function () {
      const isLanding = window.LandingSettings && window.LandingSettings.isLandingTabActive();
      if (isLanding) {
        if (window.ButtonLoading) window.ButtonLoading.start(saveBtn, { text: "Publishing…" });
        else saveBtn.disabled = true;
        Promise.resolve(window.LandingSettings.save())
          .then(function () { showToast("Landing page published."); })
          .catch(function (err) { showToast(err.message, true); })
          .finally(function () {
            if (window.ButtonLoading) window.ButtonLoading.stop(saveBtn);
            else saveBtn.disabled = false;
          });
        return;
      }

      const bikePayload = collectBikePayload();
      const platformPayload = collectPlatformPayload();
      if (Object.keys(bikePayload).length === 0 && Object.keys(platformPayload).length === 0) {
        showToast("Nothing to save yet.", true);
        return;
      }

      const hasBike = Object.keys(bikePayload).length > 0;
      const hasPlatform = Object.keys(platformPayload).length > 0;

      if (window.ButtonLoading) window.ButtonLoading.start(saveBtn, { text: "Saving…" });
      else saveBtn.disabled = true;
      Promise.all([
        hasPlatform ? savePlatformSettings() : Promise.resolve(),
        hasBike ? saveBikePricing() : Promise.resolve(false),
      ])
        .then(function (results) {
          const bikeSaved = Boolean(results[1]);
          if (bikeSaved) {
            showBikeSaveBadge();
          }
          if (bikeSaved && hasPlatform) {
            showToast("Platform and bike delivery pricing saved.");
          } else if (bikeSaved) {
            showToast("Bike delivery pricing saved.");
          } else {
            showToast("Platform settings saved.");
          }
          return loadSettings();
        })
        .catch(function (err) { showToast(err.message, true); })
        .finally(function () {
          if (window.ButtonLoading) window.ButtonLoading.stop(saveBtn);
          else saveBtn.disabled = false;
        });
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
