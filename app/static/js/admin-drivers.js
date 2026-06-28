(function () {
  "use strict";

  const state = {
    search: "",
    status: "all",
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    drivers: [],
    searchTimer: null,
  };

  const tbody = document.getElementById("drivers-table-body");
  const searchInput = document.getElementById("drivers-search-input");
  const filterTabs = document.querySelectorAll(".drivers-filter-tab");
  const kpiPending = document.getElementById("kpi-pending");
  const kpiActive = document.getElementById("kpi-active");
  const kpiSuspended = document.getElementById("kpi-suspended");
  const kpiExpiring = document.getElementById("kpi-expiring");
  const detailModal = document.getElementById("driver-detail-modal");
  const detailBody = document.getElementById("driver-detail-body");
  const pagination = document.getElementById("drivers-pagination");
  const paginationInfo = document.getElementById("drivers-pagination-info");
  const prevBtn = document.getElementById("drivers-prev-btn");
  const nextBtn = document.getElementById("drivers-next-btn");
  const toast = document.getElementById("drivers-toast");

  const starSvg =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

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
      if (res.status === 204) {
        if (!res.ok) throw new Error("Request failed");
        return {};
      }
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(data.message || data.detail || "Request failed");
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

  function statusClass(status) {
    return "drivers-status drivers-status--" + status;
  }

  function formatCount(n) {
    return Number(n || 0).toLocaleString();
  }

  function renderStats(stats) {
    if (kpiPending) kpiPending.textContent = formatCount(stats.pending_approval);
    if (kpiActive) kpiActive.textContent = formatCount(stats.active_drivers);
    if (kpiSuspended) kpiSuspended.textContent = formatCount(stats.suspended);
    if (kpiExpiring) kpiExpiring.textContent = formatCount(stats.documents_expiring);
  }

  function loadStats() {
    return apiRequest("/admin/api/drivers/stats")
      .then(renderStats)
      .catch(function () {});
  }

  function renderTable() {
    if (!tbody) return;

    if (!state.drivers.length) {
      tbody.innerHTML =
        '<tr class="drivers-table__empty"><td colspan="8">No drivers match your search.</td></tr>';
      return;
    }

    tbody.innerHTML = state.drivers
      .map(function (driver) {
        const canApprove = driver.status !== "approved";
        const canSuspend = driver.status !== "suspended";
        return (
          "<tr data-driver-id=\"" + escapeHtml(driver.id) + "\">" +
          "<td><div class=\"drivers-cell-driver\">" +
          "<span class=\"drivers-avatar\">" + escapeHtml(driver.initials) + "</span>" +
          "<div><span class=\"drivers-cell-driver__name\">" + escapeHtml(driver.full_name) + "</span>" +
          "<span class=\"drivers-cell-driver__id\">ID - " + escapeHtml(driver.public_id) + "</span></div></div></td>" +
          "<td class=\"drivers-cell-vehicle\">" + escapeHtml(driver.vehicle_display) + "</td>" +
          "<td class=\"drivers-cell-plate\">" + escapeHtml(driver.license_plate) + "</td>" +
          "<td class=\"drivers-cell-trips\">" + escapeHtml(driver.trip_count) + "</td>" +
          "<td class=\"drivers-cell-earnings\">" + escapeHtml(driver.earnings_display) + "</td>" +
          "<td class=\"drivers-cell-rating\">" + starSvg + escapeHtml(driver.rating_display) + "</td>" +
          "<td><span class=\"" + statusClass(driver.status) + "\">" + escapeHtml(driver.status_label) + "</span></td>" +
          "<td><div class=\"drivers-actions\">" +
          "<button type=\"button\" class=\"drivers-action-btn\" data-action=\"view\" data-id=\"" + escapeHtml(driver.id) + "\" aria-label=\"View driver\">" +
          "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"><path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg></button>" +
          "<button type=\"button\" class=\"drivers-action-btn drivers-action-btn--approve\" data-action=\"approve\" data-id=\"" + escapeHtml(driver.id) + "\" aria-label=\"Approve driver\"" + (canApprove ? "" : " disabled") + ">" +
          "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><polyline points=\"20 6 9 17 4 12\"/></svg></button>" +
          "<button type=\"button\" class=\"drivers-action-btn drivers-action-btn--suspend\" data-action=\"suspend\" data-id=\"" + escapeHtml(driver.id) + "\" aria-label=\"Suspend driver\"" + (canSuspend ? "" : " disabled") + ">" +
          "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button>" +
          "</div></td></tr>"
        );
      })
      .join("");
  }

  function updatePagination() {
    if (!pagination) return;
    const show = state.total > state.limit;
    pagination.hidden = !show;
    if (!show) return;
    const start = (state.page - 1) * state.limit + 1;
    const end = Math.min(state.page * state.limit, state.total);
    paginationInfo.textContent = "Showing " + start + "–" + end + " of " + state.total.toLocaleString();
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= state.totalPages;
  }

  function loadDrivers() {
    const params = new URLSearchParams({
      page: String(state.page),
      limit: String(state.limit),
    });
    if (state.search) params.set("search", state.search);
    if (state.status && state.status !== "all") params.set("status", state.status);

    return apiRequest("/admin/api/drivers?" + params.toString())
      .then(function (data) {
        state.drivers = data.drivers || [];
        state.total = data.total || 0;
        state.totalPages = data.total_pages || 1;
        renderTable();
        updatePagination();
      })
      .catch(function (err) {
        if (tbody) {
          tbody.innerHTML =
            '<tr class="drivers-table__empty"><td colspan="8">' + escapeHtml(err.message) + "</td></tr>";
        }
        showToast(err.message, true);
      });
  }

  function setFilter(status) {
    state.status = status;
    state.page = 1;
    filterTabs.forEach(function (tab) {
      tab.classList.toggle("is-active", tab.dataset.status === status);
    });
    loadDrivers();
  }

  function updateDriverStatus(driverId, status, message) {
    return apiRequest("/admin/api/drivers/" + encodeURIComponent(driverId) + "/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status }),
    })
      .then(function (updated) {
        const idx = state.drivers.findIndex(function (d) {
          return String(d.id) === String(driverId);
        });
        if (idx !== -1 && updated) {
          state.drivers[idx] = updated;
          renderTable();
        } else {
          loadDrivers();
        }
        showToast(message);
        loadStats();
      })
      .catch(function (err) {
        showToast(err.message, true);
      });
  }

  function viewDriver(driverId) {
    apiRequest("/admin/api/drivers/" + encodeURIComponent(driverId))
      .then(function (driver) {
        const docs = driver.documents_expires_at
          ? new Date(driver.documents_expires_at).toLocaleDateString()
          : "—";
        detailBody.innerHTML =
          "<div class=\"driver-detail-header\">" +
          "<span class=\"drivers-avatar\">" + escapeHtml(driver.initials) + "</span>" +
          "<div><p class=\"drivers-cell-driver__name\">" + escapeHtml(driver.full_name) + "</p>" +
          "<p class=\"drivers-cell-driver__id\">" + escapeHtml(driver.public_id) + " · " + escapeHtml(driver.status_label) + "</p></div></div>" +
          "<dl class=\"driver-detail-grid\">" +
          "<div><dt>Vehicle</dt><dd>" + escapeHtml(driver.vehicle_display) + "</dd></div>" +
          "<div><dt>Plate</dt><dd>" + escapeHtml(driver.license_plate) + "</dd></div>" +
          "<div><dt>Total trips</dt><dd>" + escapeHtml(driver.trip_count) + "</dd></div>" +
          "<div><dt>Earnings</dt><dd>" + escapeHtml(driver.earnings_display) + "</dd></div>" +
          "<div><dt>Rating</dt><dd>" + escapeHtml(driver.rating_display) + "</dd></div>" +
          "<div><dt>Documents expire</dt><dd>" + escapeHtml(docs) + "</dd></div>" +
          "<div><dt>Status</dt><dd><span class=\"" + statusClass(driver.status) + "\">" + escapeHtml(driver.status_label) + "</span></dd></div>" +
          "</dl>";
        detailModal.hidden = false;
        document.body.style.overflow = "hidden";
      })
      .catch(function (err) {
        showToast(err.message, true);
      });
  }

  function closeModal() {
    if (detailModal) {
      detailModal.hidden = true;
      document.body.style.overflow = "";
    }
  }

  function bindEvents() {
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(function () {
          state.search = searchInput.value.trim();
          state.page = 1;
          loadDrivers();
        }, 300);
      });
    }

    filterTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        setFilter(tab.dataset.status || "all");
      });
    });

    document.querySelectorAll(".drivers-kpi-card__review").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setFilter(btn.dataset.filter || "all");
      });
    });

    if (tbody) {
      tbody.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        const driver = state.drivers.find(function (d) { return String(d.id) === String(id); });
        if (!driver) return;

        if (action === "view") {
          viewDriver(id);
        } else if (action === "approve") {
          updateDriverStatus(id, "approved", driver.full_name + " approved");
        } else if (action === "suspend") {
          updateDriverStatus(id, "suspended", driver.full_name + " suspended");
        }
      });
    }

    document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
      btn.addEventListener("click", closeModal);
    });

    if (detailModal) {
      detailModal.addEventListener("click", function (e) {
        if (e.target === detailModal) closeModal();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (state.page > 1) {
          state.page -= 1;
          loadDrivers();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (state.page < state.totalPages) {
          state.page += 1;
          loadDrivers();
        }
      });
    }
  }

  function init() {
    bindEvents();
    loadStats();
    loadDrivers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
