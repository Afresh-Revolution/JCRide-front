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

  function showConfirmDialog(options) {
    return window.AdminConfirm.show(options);
  }

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

  function formatCurrency(amount) {
    return "₦" + Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function formatCount(n) {
    return Number(n || 0).toLocaleString();
  }

  function normalizeDriver(raw) {
    if (!raw) return null;
    if (raw.public_id && raw.vehicle_display) return raw;

    const backendStatus = raw.status || "pending_approval";
    const uiStatus = backendStatus === "pending_approval" ? "pending" : backendStatus;
    const statusLabels = {
      pending: "Pending Review",
      approved: "Approved",
      suspended: "Suspended",
      rejected: "Rejected",
    };
    const name = raw.full_name || "Driver";
    const parts = name.trim().split(/\s+/);
    const initials = ((parts[0] || "D").charAt(0) + (parts[1] || parts[0] || "R").charAt(0)).toUpperCase();
    const vehicleMake = raw.vehicle_make || "";
    const vehicleModel = raw.vehicle_model || "";
    const vehicleDisplay = [vehicleMake, vehicleModel].filter(Boolean).join(" ").trim() || "-";

    return {
      id: raw.id,
      public_id: raw.public_id || ("DRV-" + String(raw.id).replace(/-/g, "").slice(-4).toUpperCase()),
      full_name: name,
      initials: raw.initials || initials,
      email: raw.email || "",
      phone: raw.phone || "",
      vehicle_display: vehicleDisplay,
      license_plate: raw.license_plate || raw.plate_number || "-",
      trip_count: raw.trip_count != null ? raw.trip_count : (raw.total_completed_trips || 0),
      earnings_display: raw.earnings_display || formatCurrency(raw.total_earnings_ngn),
      rating_display: raw.rating_display || Number(raw.rating_avg || raw.rating || 0).toFixed(2),
      status: uiStatus,
      backend_status: backendStatus,
      status_label: raw.status_label || statusLabels[uiStatus] || backendStatus,
      documents: raw.documents || [],
    };
  }

  function normalizeDriverList(list) {
    return (list || []).map(normalizeDriver).filter(Boolean);
  }

  function renderStats(stats) {
    if (kpiPending) kpiPending.textContent = formatCount(stats.pending_approval);
    if (kpiActive) kpiActive.textContent = formatCount(stats.active_drivers);
    if (kpiSuspended) kpiSuspended.textContent = formatCount(stats.suspended);
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
        const isPending = driver.backend_status === "pending_approval";
        const isApproved = driver.backend_status === "approved";
        const canApprove = isPending || driver.backend_status === "suspended";
        const declineAction = isPending ? "reject" : (isApproved ? "suspend" : null);
        const declineLabel = isPending ? "Reject driver" : "Suspend driver";
        const declineDisabled = !declineAction;

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
          "<button type=\"button\" class=\"drivers-action-btn drivers-action-btn--suspend\" data-action=\"" + (declineAction || "decline") + "\" data-id=\"" + escapeHtml(driver.id) + "\" aria-label=\"" + escapeHtml(declineLabel) + "\"" + (declineDisabled ? " disabled" : "") + ">" +
          "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button>" +
          "<button type=\"button\" class=\"drivers-action-btn drivers-action-btn--delete\" data-action=\"delete\" data-id=\"" + escapeHtml(driver.id) + "\" aria-label=\"Delete driver\">" +
          "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"><polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6\"/><path d=\"M10 11v6M14 11v6\"/><path d=\"M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2\"/></svg></button>" +
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
        state.drivers = normalizeDriverList(data.drivers);
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

  function updateDriverStatus(driverId, status, message, driver, button) {
    if (button && window.ButtonLoading) window.ButtonLoading.start(button);
    return apiRequest("/admin/api/drivers/" + encodeURIComponent(driverId) + "/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status }),
    })
      .then(function (updated) {
        const normalized = normalizeDriver(updated);
        const idx = state.drivers.findIndex(function (d) {
          return String(d.id) === String(driverId);
        });
        if (idx !== -1 && normalized) {
          state.drivers[idx] = normalized;
          renderTable();
        } else {
          loadDrivers();
        }
        let toastMessage = message;
        if (status === "approved" && driver && driver.email) {
          toastMessage += " - approval email sent to " + driver.email;
        } else if (status === "rejected" && driver && driver.email) {
          toastMessage += " - rejection email sent to " + driver.email;
        }
        showToast(toastMessage);
        loadStats();
      })
      .catch(function (err) {
        if (button && window.ButtonLoading) window.ButtonLoading.stop(button);
        showToast(err.message, true);
      });
  }

  function deleteDriver(driverId, driverName) {
    window.AdminConfirm.show({
      title: "Delete driver",
      message: "Delete " + driverName + "? Their account will be removed and this cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    }).then(function (confirmed) {
      if (!confirmed) return;
      return apiRequest("/admin/api/drivers/" + encodeURIComponent(driverId), {
        method: "DELETE",
      })
        .then(function () {
          showToast(driverName + " deleted");
          closeModal();
          loadStats();
          return loadDrivers();
        })
        .catch(function (err) {
          showToast(err.message, true);
        });
    });
  }

  function viewDriver(driverId) {
    apiRequest("/admin/api/drivers/" + encodeURIComponent(driverId))
      .then(function (driver) {
        const normalized = normalizeDriver(driver);
        const docs = driver.documents && driver.documents.length
          ? driver.documents.map(function (doc) {
              return doc.document_type + " (" + doc.verification_status + ")";
            }).join(", ")
          : "-";
        detailBody.innerHTML =
          "<div class=\"driver-detail-header\">" +
          "<span class=\"drivers-avatar\">" + escapeHtml(normalized.initials) + "</span>" +
          "<div><p class=\"drivers-cell-driver__name\">" + escapeHtml(normalized.full_name) + "</p>" +
          "<p class=\"drivers-cell-driver__id\">" + escapeHtml(normalized.public_id) + " · " + escapeHtml(normalized.status_label) + "</p></div></div>" +
          "<dl class=\"driver-detail-grid\">" +
          "<div><dt>Email</dt><dd>" + escapeHtml(normalized.email || "-") + "</dd></div>" +
          "<div><dt>Phone</dt><dd>" + escapeHtml(normalized.phone || "-") + "</dd></div>" +
          "<div><dt>Vehicle</dt><dd>" + escapeHtml(normalized.vehicle_display) + "</dd></div>" +
          "<div><dt>Plate</dt><dd>" + escapeHtml(normalized.license_plate) + "</dd></div>" +
          "<div><dt>Total trips</dt><dd>" + escapeHtml(normalized.trip_count) + "</dd></div>" +
          "<div><dt>Earnings</dt><dd>" + escapeHtml(normalized.earnings_display) + "</dd></div>" +
          "<div><dt>Rating</dt><dd>" + escapeHtml(normalized.rating_display) + "</dd></div>" +
          "<div><dt>Documents</dt><dd>" + escapeHtml(docs) + "</dd></div>" +
          "<div><dt>Status</dt><dd><span class=\"" + statusClass(normalized.status) + "\">" + escapeHtml(normalized.status_label) + "</span></dd></div>" +
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
    }
    if ((!window.AdminConfirm || !window.AdminConfirm.isOpen()) && document.body.style.overflow === "hidden") {
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
          showConfirmDialog({
            title: "Approve driver",
            message: "Approve " + driver.full_name + "? They will receive an email if an address is on file.",
            confirmLabel: "Approve",
          }).then(function (confirmed) {
            if (confirmed) {
              updateDriverStatus(id, "approved", driver.full_name + " approved", driver, btn);
            }
          });
        } else if (action === "reject") {
          showConfirmDialog({
            title: "Reject application",
            message: "Reject " + driver.full_name + "'s driver application? This cannot be undone.",
            confirmLabel: "Reject",
            variant: "danger",
          }).then(function (confirmed) {
            if (confirmed) {
              updateDriverStatus(id, "rejected", driver.full_name + " rejected", driver, btn);
            }
          });
        } else if (action === "suspend") {
          showConfirmDialog({
            title: "Suspend driver",
            message: "Suspend " + driver.full_name + "? They will no longer be able to go online.",
            confirmLabel: "Suspend",
            variant: "danger",
          }).then(function (confirmed) {
            if (confirmed) {
              updateDriverStatus(id, "suspended", driver.full_name + " suspended", driver, btn);
            }
          });
        } else if (action === "delete") {
          deleteDriver(id, driver.full_name);
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

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (window.AdminConfirm && window.AdminConfirm.isOpen()) return;
      if (detailModal && !detailModal.hidden) {
        closeModal();
      }
    });

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
