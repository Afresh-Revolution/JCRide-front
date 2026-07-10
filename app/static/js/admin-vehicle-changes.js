(function () {
  "use strict";

  var tbody = document.getElementById("vehicle-changes-table-body");
  var modal = document.getElementById("vehicle-change-modal");
  var modalBody = document.getElementById("vehicle-change-body");
  var approveBtn = document.getElementById("vehicle-change-approve-btn");
  var rejectBtn = document.getElementById("vehicle-change-reject-btn");
  var kpiExpiring = document.getElementById("kpi-expiring");
  var scrollBtn = document.getElementById("vehicle-changes-scroll");
  var section = document.getElementById("vehicle-changes-section");
  var toast = document.getElementById("drivers-toast");
  var activeRequestId = null;

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

  function vehicleLabel(make, model, color, plate, tier) {
    var makeModel = [make, model].filter(Boolean).join(" ").trim() || "-";
    var parts = [makeModel];
    if (color) parts.push(color);
    if (plate) parts.push(plate);
    if (tier) parts.push(String(tier).replace("_", " "));
    return parts.join(" · ");
  }

  function formatDate(value) {
    if (!value) return "-";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function renderTable(requests) {
    if (!requests.length) {
      tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="5">No pending vehicle change requests.</td></tr>';
      return;
    }

    tbody.innerHTML = requests.map(function (item) {
      return (
        '<tr>' +
        '<td data-label="Driver"><strong>' + escapeHtml(item.driver_name || "Driver") + '</strong><br><span class="drivers-table__meta">' + escapeHtml(item.driver_email || "") + '</span></td>' +
        '<td data-label="Current vehicle">' + escapeHtml(vehicleLabel(item.previous_vehicle_make, item.previous_vehicle_model, item.previous_vehicle_color, item.previous_plate_number, item.previous_service_tier)) + '</td>' +
        '<td data-label="Requested vehicle">' + escapeHtml(vehicleLabel(item.vehicle_make, item.vehicle_model, item.vehicle_color, item.plate_number, item.service_tier)) + '</td>' +
        '<td data-label="Submitted">' + escapeHtml(formatDate(item.submitted_at)) + '</td>' +
        '<td class="drivers-table__actions" data-label="Actions"><button type="button" class="drivers-btn drivers-btn--ghost" data-review-id="' + escapeHtml(item.id) + '">Review</button></td>' +
        '</tr>'
      );
    }).join("");
  }

  function renderModal(item) {
    if (!modalBody) return;
    modalBody.innerHTML =
      '<div class="vehicle-change-review">' +
      '<div class="vehicle-change-review__cols">' +
      '<section><h3>Current</h3><p>' + escapeHtml(vehicleLabel(item.previous_vehicle_make, item.previous_vehicle_model, item.previous_vehicle_color, item.previous_plate_number, item.previous_service_tier)) + '</p></section>' +
      '<section><h3>Requested</h3><p>' + escapeHtml(vehicleLabel(item.vehicle_make, item.vehicle_model, item.vehicle_color, item.plate_number, item.service_tier)) + '</p></section>' +
      '</div>' +
      '<div class="vehicle-change-review__photos">' +
      '<a href="' + escapeHtml(item.photo_plate_distance_url) + '" target="_blank" rel="noopener"><img src="' + escapeHtml(item.photo_plate_distance_url) + '" alt="Plate distance photo"></a>' +
      '<a href="' + escapeHtml(item.photo_interior_url) + '" target="_blank" rel="noopener"><img src="' + escapeHtml(item.photo_interior_url) + '" alt="Interior photo"></a>' +
      '<a href="' + escapeHtml(item.photo_driver_with_car_url) + '" target="_blank" rel="noopener"><img src="' + escapeHtml(item.photo_driver_with_car_url) + '" alt="Driver with car photo"></a>' +
      '</div>' +
      '</div>';
  }

  function openModal() {
    if (!modal) return;
    modal.hidden = false;
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    activeRequestId = null;
  }

  function loadVehicleChanges() {
    return apiRequest("/admin/api/vehicle-changes?status=pending&limit=50")
      .then(function (data) {
        var requests = data.requests || [];
        if (kpiExpiring) kpiExpiring.textContent = String(data.total || requests.length || 0);
        renderTable(requests);
      })
      .catch(function (err) {
        tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="5">' + escapeHtml(err.message) + '</td></tr>';
      });
  }

  function reviewRequest(requestId) {
    apiRequest("/admin/api/vehicle-changes/" + encodeURIComponent(requestId))
      .then(function (item) {
        activeRequestId = requestId;
        renderModal(item);
        openModal();
      })
      .catch(function (err) {
        showToast(err.message, true);
      });
  }

  function approveRequest() {
    if (!activeRequestId) return;
    if (window.ButtonLoading) window.ButtonLoading.start(approveBtn, { text: "Approving…" });
    apiRequest("/admin/api/vehicle-changes/" + encodeURIComponent(activeRequestId) + "/approve", { method: "POST" })
      .then(function () {
        showToast("Vehicle change approved.");
        closeModal();
        loadVehicleChanges();
      })
      .catch(function (err) {
        showToast(err.message, true);
      })
      .finally(function () {
        if (window.ButtonLoading) window.ButtonLoading.stop(approveBtn);
      });
  }

  function rejectRequest() {
    if (!activeRequestId) return;
    var reason = window.prompt("Optional reason for the driver:");
    if (reason === null) return;
    if (window.ButtonLoading) window.ButtonLoading.start(rejectBtn, { text: "Rejecting…" });
    apiRequest("/admin/api/vehicle-changes/" + encodeURIComponent(activeRequestId) + "/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || undefined }),
    })
      .then(function () {
        showToast("Vehicle change rejected.");
        closeModal();
        loadVehicleChanges();
      })
      .catch(function (err) {
        showToast(err.message, true);
      })
      .finally(function () {
        if (window.ButtonLoading) window.ButtonLoading.stop(rejectBtn);
      });
  }

  tbody.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-review-id]");
    if (!btn) return;
    reviewRequest(btn.getAttribute("data-review-id"));
  });

  if (approveBtn) approveBtn.addEventListener("click", approveRequest);
  if (rejectBtn) rejectBtn.addEventListener("click", rejectRequest);

  document.querySelectorAll("[data-close-vehicle-modal]").forEach(function (btn) {
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

  loadVehicleChanges();
})();
