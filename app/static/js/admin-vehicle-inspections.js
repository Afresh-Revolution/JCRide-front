(function () {
  "use strict";

  var tbody = document.getElementById("vehicle-inspections-table-body");
  var modal = document.getElementById("vehicle-inspection-modal");
  var modalBody = document.getElementById("vehicle-inspection-body");
  var saveBtn = document.getElementById("vehicle-inspection-save-btn");
  var kpi = document.getElementById("kpi-inspections");
  var scrollBtn = document.getElementById("vehicle-inspections-scroll");
  var section = document.getElementById("vehicle-inspections-section");
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

  function vehicleLabel(item) {
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

  function renderTable(requests) {
    if (!requests.length) {
      tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="5">No pending vehicle inspections.</td></tr>';
      return;
    }
    tbody.innerHTML = requests.map(function (item) {
      return (
        "<tr>" +
        '<td data-label="Driver"><strong>' + escapeHtml(item.driver_name || "Driver") + "</strong><br><span class=\"drivers-table__meta\">" + escapeHtml(item.driver_email || item.driver_phone || "") + "</span></td>" +
        '<td data-label="Vehicle">' + escapeHtml(vehicleLabel(item)) + "</td>" +
        '<td data-label="Preferred slot">' + escapeHtml(slotLabel(item)) + "</td>" +
        '<td data-label="Submitted">' + escapeHtml(formatDate(item.submitted_at)) + "</td>" +
        '<td class="drivers-table__actions" data-label="Actions"><button type="button" class="drivers-btn drivers-btn--ghost" data-inspect-id="' + escapeHtml(item.id) + '">Assign class</button></td>' +
        "</tr>"
      );
    }).join("");
  }

  function renderModal(item) {
    if (!modalBody) return;
    modalBody.innerHTML =
      "<p><strong>" + escapeHtml(item.driver_name || "Driver") + "</strong><br>" +
      escapeHtml(item.driver_email || "") + (item.driver_phone ? "<br>" + escapeHtml(item.driver_phone) : "") + "</p>" +
      "<p>" + escapeHtml(vehicleLabel(item)) + "</p>" +
      "<p>Preferred: " + escapeHtml(slotLabel(item)) + "</p>" +
      (item.notes ? "<p>Notes: " + escapeHtml(item.notes) + "</p>" : "") +
      '<label class="drivers-field"><span>Car class after inspection</span>' +
      '<select id="inspection-service-tier" required>' +
      '<option value="economy">Economy</option>' +
      '<option value="comfort">Comfort</option>' +
      '<option value="premium">Premium</option>' +
      "</select></label>";
  }

  function openModal() {
    if (modal) modal.hidden = false;
  }

  function closeModal() {
    if (modal) modal.hidden = true;
    activeRequestId = null;
  }

  function loadInspections() {
    return apiRequest("/admin/api/vehicle-inspections?status=pending&limit=50")
      .then(function (data) {
        var requests = data.requests || [];
        if (kpi) kpi.textContent = String(data.total || requests.length || 0);
        renderTable(requests);
      })
      .catch(function (err) {
        tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="5">' + escapeHtml(err.message) + "</td></tr>";
      });
  }

  function reviewRequest(requestId) {
    apiRequest("/admin/api/vehicle-inspections/" + encodeURIComponent(requestId))
      .then(function (item) {
        activeRequestId = requestId;
        renderModal(item);
        openModal();
      })
      .catch(function (err) {
        showToast(err.message, true);
      });
  }

  function saveClass() {
    if (!activeRequestId) return;
    var select = document.getElementById("inspection-service-tier");
    var tier = select ? select.value : "economy";
    if (window.ButtonLoading) window.ButtonLoading.start(saveBtn, { text: "Saving…" });
    apiRequest("/admin/api/vehicle-inspections/" + encodeURIComponent(activeRequestId) + "/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_tier: tier }),
    })
      .then(function () {
        showToast("Vehicle class saved. The driver can go online.");
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
