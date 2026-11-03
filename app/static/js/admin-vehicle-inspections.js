(function () {
  "use strict";

  var tbody = document.getElementById("vehicle-inspections-table-body");
  var modal = document.getElementById("vehicle-inspection-modal");
  var modalBody = document.getElementById("vehicle-inspection-body");
  var saveBtn = document.getElementById("vehicle-inspection-save-btn");
  var kpi = document.getElementById("kpi-inspections");
  var scrollBtn = document.getElementById("vehicle-inspections-scroll");
  var section = document.getElementById("vehicle-inspections-section");
  var locationInput = document.getElementById("vehicle-inspection-location");
  var locationSaveBtn = document.getElementById("vehicle-inspection-location-save");
  var toast = document.getElementById("drivers-toast");
  var activeRequestId = null;
  var inspectionLocation = "Afresh Center";

  if (!tbody) return;

  function showToast(message, isError) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", Boolean(isError));
    toast.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      toast.hidden = true;
    }, 4000);
  }

  function apiRequest(url, options) {
    return fetch(url, options || {}).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(data.message || data.detail || "Request failed");
        }
        return data;
      });
    });
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function normalizeCategory(value) {
    var category = String(value || "").toLowerCase().trim();
    if (category === "keke" || category === "tricycle") return "tricycle";
    if (category === "bike" || category === "bicycle" || category === "motorcycle") return "bike";
    if (category === "car" || category === "vehicle") return "car";
    return category;
  }

  function typeLabel(item) {
    var category = normalizeCategory(item.vehicle_category || item.category || item.vehicle_type);
    if (category === "bike") return "Bike";
    if (category === "tricycle") return "Keke";
    if (category === "car") return "Car";
    return "Unknown";
  }

  function serviceLabel(item) {
    var category = normalizeCategory(item.vehicle_category || item.category || item.vehicle_type);
    var kind = String(item.service_kind || item.serviceKind || "").toLowerCase().trim();
    if (kind === "dispatch" || category === "bike") return "Dispatch";
    if (kind === "ride" || kind === "passenger" || kind === "normal") return "Normal";
    if (category === "car" || category === "tricycle") return "Normal";
    return "Unknown";
  }

  function vehicleDetails(item) {
    return [item.vehicle_make, item.vehicle_model, item.vehicle_color, item.plate_number]
      .filter(Boolean)
      .join(" · ") || "-";
  }

  function formatDate(value) {
    if (!value) return "-";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function slotLabel(item) {
    return [item.preferred_date, item.preferred_time].filter(Boolean).join(" ") || "Not specified";
  }

  function serviceBadge(item) {
    var label = serviceLabel(item);
    var isDispatch = label === "Dispatch";
    return (
      '<span class="drivers-pill' + (isDispatch ? " drivers-pill--dispatch" : " drivers-pill--normal") + '">' +
      escapeHtml(label) +
      "</span>"
    );
  }

  function typeBadge(item) {
    return '<span class="drivers-pill drivers-pill--type">' + escapeHtml(typeLabel(item)) + "</span>";
  }

  function renderTable(requests) {
    if (!requests.length) {
      tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="7">No pending vehicle inspections.</td></tr>';
      return;
    }
    tbody.innerHTML = requests.map(function (item) {
      return (
        "<tr>" +
        '<td data-label="Driver"><strong>' + escapeHtml(item.driver_name || "Driver") + "</strong><br><span class=\"drivers-table__meta\">" + escapeHtml(item.driver_email || item.driver_phone || "") + "</span></td>" +
        '<td data-label="Service">' + serviceBadge(item) + "</td>" +
        '<td data-label="Type">' + typeBadge(item) + "</td>" +
        '<td data-label="Vehicle"><span class="drivers-table__vehicle">' + escapeHtml(vehicleDetails(item)) + "</span></td>" +
        '<td data-label="Preferred slot">' + escapeHtml(slotLabel(item)) + "</td>" +
        '<td data-label="Submitted">' + escapeHtml(formatDate(item.submitted_at)) + "</td>" +
        '<td class="drivers-table__actions" data-label="Actions"><button type="button" class="drivers-btn drivers-btn--ghost drivers-btn--review" data-inspect-id="' + escapeHtml(item.id) + '" aria-pressed="false">Review account</button></td>' +
        "</tr>"
      );
    }).join("");
  }

  function renderModal(item) {
    if (!modalBody) return;
    modalBody.innerHTML =
      '<div class="drivers-inspection-summary">' +
      "<p><strong>" + escapeHtml(item.driver_name || "Driver") + "</strong><br>" +
      escapeHtml(item.driver_email || "") + (item.driver_phone ? "<br>" + escapeHtml(item.driver_phone) : "") + "</p>" +
      '<dl class="drivers-inspection-summary__grid">' +
      "<div><dt>Service</dt><dd>" + serviceBadge(item) + "</dd></div>" +
      "<div><dt>Vehicle type</dt><dd>" + typeBadge(item) + "</dd></div>" +
      "<div><dt>Vehicle</dt><dd>" + escapeHtml(vehicleDetails(item)) + "</dd></div>" +
      "<div><dt>Preferred</dt><dd>" + escapeHtml(slotLabel(item)) + "</dd></div>" +
      "<div><dt>Location</dt><dd>" + escapeHtml(item.location || inspectionLocation) + "</dd></div>" +
      (item.notes ? "<div><dt>Notes</dt><dd>" + escapeHtml(item.notes) + "</dd></div>" : "") +
      "</dl>" +
      "<p class=\"drivers-table__meta\">Completing this review opens the driver's wallet. It does not assign a car class.</p>" +
      "</div>";
  }

  function setReviewButtonActive(requestId) {
    tbody.querySelectorAll("[data-inspect-id]").forEach(function (btn) {
      var active = Boolean(requestId) && btn.getAttribute("data-inspect-id") === String(requestId);
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function openModal() {
    if (modal) modal.hidden = false;
    setReviewButtonActive(activeRequestId);
  }

  function closeModal() {
    if (modal) modal.hidden = true;
    activeRequestId = null;
    setReviewButtonActive(null);
  }

  function setLocationInput(value) {
    inspectionLocation = String(value || "").trim() || "Afresh Center";
    if (locationInput && document.activeElement !== locationInput) {
      locationInput.value = inspectionLocation;
    }
  }

  function loadInspections() {
    return apiRequest("/admin/api/vehicle-inspections?status=pending&limit=50")
      .then(function (data) {
        var requests = data.requests || [];
        if (kpi) kpi.textContent = String(data.total || requests.length || 0);
        setLocationInput(data.location);
        renderTable(requests);
      })
      .catch(function (err) {
        tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="7">' + escapeHtml(err.message) + "</td></tr>";
      });
  }

  function saveLocation() {
    var location = locationInput ? String(locationInput.value || "").trim() : "";
    if (!location) {
      showToast("Enter an inspection location", true);
      return;
    }
    if (window.ButtonLoading) window.ButtonLoading.start(locationSaveBtn, { text: "Saving…" });
    apiRequest("/admin/api/settings/platform", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicle_inspection_location: location }),
    })
      .then(function (data) {
        setLocationInput(data.vehicle_inspection_location || location);
        showToast("Inspection location saved.");
      })
      .catch(function (err) {
        showToast(err.message, true);
      })
      .finally(function () {
        if (window.ButtonLoading) window.ButtonLoading.stop(locationSaveBtn);
      });
  }

  function reviewRequest(requestId) {
    setReviewButtonActive(requestId);
    apiRequest("/admin/api/vehicle-inspections/" + encodeURIComponent(requestId))
      .then(function (item) {
        activeRequestId = requestId;
        renderModal(item);
        openModal();
      })
      .catch(function (err) {
        setReviewButtonActive(activeRequestId);
        showToast(err.message, true);
      });
  }

  function saveClass() {
    if (!activeRequestId) return;
    if (window.ButtonLoading) window.ButtonLoading.start(saveBtn, { text: "Saving…" });
    apiRequest("/admin/api/vehicle-inspections/" + encodeURIComponent(activeRequestId) + "/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(function () {
        showToast("Account review complete. The driver wallet is now open.");
        closeModal();
        loadInspections();
      })
      .catch(function (err) {
        showToast(err.message, true);
      })
      .finally(function () {
        if (window.ButtonLoading) window.ButtonLoading.stop(saveBtn);
      });
  }

  tbody.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-inspect-id]");
    if (!btn) return;
    reviewRequest(btn.getAttribute("data-inspect-id"));
  });

  if (saveBtn) saveBtn.addEventListener("click", saveClass);
  if (locationSaveBtn) locationSaveBtn.addEventListener("click", saveLocation);
  if (locationInput) {
    locationInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        saveLocation();
      }
    });
  }
  document.querySelectorAll("[data-close-inspection-modal]").forEach(function (btn) {
    btn.addEventListener("click", closeModal);
  });
  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal();
    });
  }
  if (scrollBtn && section) {
    scrollBtn.addEventListener("click", function () {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  loadInspections();
})();
