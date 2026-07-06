(function () {
  "use strict";

  const API = {
    stats: "/admin/api/bike-delivery/stats",
    pricing: "/admin/api/bike-delivery/pricing",
    zones: "/admin/api/bike-delivery/zones",
    riders: "/admin/api/bike-delivery/riders",
    rider: function (id) {
      return "/admin/api/bike-delivery/riders/" + encodeURIComponent(id);
    },
    riderStatus: function (id) {
      return "/admin/api/bike-delivery/riders/" + encodeURIComponent(id) + "/status";
    },
    onboard: "/admin/api/bike-delivery/riders",
  };

  const state = {
    search: "",
    status: "all",
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    riders: [],
    zones: [],
    searchTimer: null,
  };

  const tbody = document.getElementById("bike-riders-table-body");
  const searchInput = document.getElementById("bike-riders-search");
  const filterTabs = document.querySelectorAll(".bike-delivery-filter-tab");
  const pricingList = document.getElementById("bike-pricing-list");
  const zonesTags = document.getElementById("bike-zones-tags");
  const onboardZoneSelect = document.getElementById("bike-onboard-zone");
  const detailModal = document.getElementById("bike-rider-detail-modal");
  const detailBody = document.getElementById("bike-rider-detail-body");
  const onboardModal = document.getElementById("bike-onboard-modal");
  const onboardForm = document.getElementById("bike-onboard-form");
  const onboardError = document.getElementById("bike-onboard-error");
  const pagination = document.getElementById("bike-riders-pagination");
  const paginationInfo = document.getElementById("bike-riders-pagination-info");
  const prevBtn = document.getElementById("bike-riders-prev-btn");
  const nextBtn = document.getElementById("bike-riders-next-btn");
  const toast = document.getElementById("bike-delivery-toast");

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
        if (!res.ok) {
          return res.json().then(function (data) {
            throw new Error(data.message || data.detail || "Request failed");
          }).catch(function () {
            throw new Error("Request failed");
          });
        }
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

  function formatCurrency(amount) {
    if (amount == null || amount === "") return "-";
    return "₦" + Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function formatCount(n) {
    if (n == null || n === "") return "-";
    return Number(n).toLocaleString();
  }

  function formatMinutes(n) {
    if (n == null || n === "") return "-";
    return Number(n).toFixed(1) + " min";
  }

  function formatPercent(n) {
    if (n == null || n === "") return "-";
    return Number(n).toFixed(1) + "%";
  }

  function formatKm(n) {
    if (n == null || n === "") return "-";
    return Number(n).toFixed(1) + " km";
  }

  function formatRating(n) {
    if (n == null || n === "") return "-";
    return Number(n).toFixed(2) + "★";
  }

  function formatGmv(amount) {
    if (amount == null || amount === "") return "-";
    const n = Number(amount);
    if (n >= 1_000_000) return "₦" + (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return "₦" + (n / 1_000).toFixed(1) + "k";
    return formatCurrency(n);
  }

  function statusClass(status) {
    return "bike-delivery-status bike-delivery-status--" + (status || "pending");
  }

  function normalizeRider(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = raw.full_name || raw.name || "-";
    const parts = String(name).trim().split(/\s+/);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : String(name).slice(0, 2).toUpperCase();
    const backendStatus = raw.status || raw.backend_status || "pending";
    const statusLabels = {
      approved: "Approved",
      pending: "Pending Review",
      pending_approval: "Pending Review",
      suspended: "Suspended",
      rejected: "Rejected",
    };
    return {
      id: raw.id,
      full_name: name,
      initials: initials,
      public_id: raw.public_id || raw.rider_id || "-",
      bike_model: raw.bike_model || raw.bike || "-",
      plate_number: raw.plate_number || raw.plate || "-",
      zone: raw.zone || "-",
      delivery_count: raw.delivery_count != null ? raw.delivery_count : raw.deliveries,
      earnings_ngn: raw.earnings_ngn != null ? raw.earnings_ngn : raw.earnings,
      earnings_display: raw.earnings_display || formatCurrency(raw.earnings_ngn != null ? raw.earnings_ngn : raw.earnings),
      rating: raw.rating,
      rating_display: raw.rating_display || (raw.rating != null ? Number(raw.rating).toFixed(2) : "-"),
      status: backendStatus === "pending_approval" ? "pending" : backendStatus,
      backend_status: backendStatus,
      status_label: raw.status_label || statusLabels[backendStatus] || backendStatus,
      email: raw.email || "",
      phone: raw.phone || "",
    };
  }

  function renderStats(data) {
    const elActive = document.getElementById("bike-kpi-active-riders");
    const elDeliveries = document.getElementById("bike-kpi-deliveries-today");
    const elPickup = document.getElementById("bike-kpi-pickup-time");
    const elGmv = document.getElementById("bike-kpi-weekly-gmv");
    if (elActive) elActive.textContent = formatCount(data.active_riders);
    if (elDeliveries) elDeliveries.textContent = formatCount(data.deliveries_today);
    if (elPickup) elPickup.textContent = formatMinutes(data.avg_pickup_time_min);
    if (elGmv) elGmv.textContent = formatGmv(data.weekly_gmv_ngn);
  }

  function renderPricing(data) {
    if (!pricingList) return;
    const items = data.items || [];
    if (!items.length) {
      pricingList.innerHTML = '<li class="bike-delivery-pricing__loading">No pricing configured yet.</li>';
      return;
    }
    pricingList.innerHTML = items.map(function (item) {
      return (
        "<li><span>" + escapeHtml(item.label) + "</span>" +
        "<span>" + escapeHtml(item.amount_display || formatCurrency(item.amount_ngn)) + "</span></li>"
      );
    }).join("");
  }

  function renderZoneOptions(zones) {
    if (!onboardZoneSelect) return;
    const current = onboardZoneSelect.value;
    onboardZoneSelect.innerHTML = '<option value="">Select zone</option>' +
      zones.map(function (zone) {
        const name = typeof zone === "string" ? zone : zone.name;
        return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + "</option>";
      }).join("");
    if (current) onboardZoneSelect.value = current;
  }

  function renderZones(data) {
    const zones = data.zones || [];
    state.zones = zones;
    renderZoneOptions(zones);

    if (zonesTags) {
      if (!zones.length) {
        zonesTags.innerHTML = '<span class="bike-delivery-zones__loading">No active zones yet.</span>';
      } else {
        zonesTags.innerHTML = zones.map(function (zone) {
          const name = typeof zone === "string" ? zone : zone.name;
          return '<span class="bike-delivery-zone-tag">' + escapeHtml(name) + "</span>";
        }).join("");
      }
    }

    const stats = data.stats || {};
    const map = {
      "bike-stat-insurance": formatCurrency(stats.insurance_cover_ngn),
      "bike-stat-helmet": formatPercent(stats.helmet_compliance_pct),
      "bike-stat-ontime": formatPercent(stats.on_time_rate_pct),
      "bike-stat-cancellations": formatPercent(stats.cancellation_rate_pct),
      "bike-stat-avg-trip": formatKm(stats.avg_trip_km),
      "bike-stat-rating": stats.rider_rating != null ? formatRating(stats.rider_rating) : "-",
    };
    Object.keys(map).forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = map[id];
    });
  }

  function renderTable() {
    if (!tbody) return;

    if (!state.riders.length) {
      const hasFilters = state.search || (state.status && state.status !== "all");
      const emptyMessage = hasFilters
        ? "No riders match your search."
        : "No bike delivery riders yet. Onboard your first rider with the button above.";
      tbody.innerHTML =
        '<tr class="bike-delivery-table__empty"><td colspan="9">' + escapeHtml(emptyMessage) + "</td></tr>";
      return;
    }

    tbody.innerHTML = state.riders.map(function (rider) {
      const isPending = rider.backend_status === "pending" || rider.backend_status === "pending_approval";
      const isApproved = rider.backend_status === "approved";
      const canApprove = isPending || rider.backend_status === "suspended";
      const declineAction = isPending ? "reject" : (isApproved ? "suspend" : null);
      const declineLabel = isPending ? "Reject rider" : "Suspend rider";
      const declineDisabled = !declineAction;

      return (
        "<tr data-rider-id=\"" + escapeHtml(rider.id) + "\">" +
        "<td><div class=\"bike-delivery-cell-rider\">" +
        "<span class=\"bike-delivery-avatar\">" + escapeHtml(rider.initials) + "</span>" +
        "<div><span class=\"bike-delivery-cell-rider__name\">" + escapeHtml(rider.full_name) + "</span>" +
        "<span class=\"bike-delivery-cell-rider__id\">" + escapeHtml(rider.public_id) + "</span></div></div></td>" +
        "<td>" + escapeHtml(rider.bike_model) + "</td>" +
        "<td>" + escapeHtml(rider.plate_number) + "</td>" +
        "<td>" + escapeHtml(rider.zone) + "</td>" +
        "<td>" + escapeHtml(formatCount(rider.delivery_count)) + "</td>" +
        "<td>" + escapeHtml(rider.earnings_display) + "</td>" +
        "<td><span class=\"bike-delivery-cell-rating\">" + starSvg + escapeHtml(rider.rating_display) + "</span></td>" +
        "<td><span class=\"" + statusClass(rider.status) + "\">" + escapeHtml(rider.status_label) + "</span></td>" +
        "<td><div class=\"bike-delivery-actions\">" +
        "<button type=\"button\" class=\"bike-delivery-action-btn\" data-action=\"view\" data-id=\"" + escapeHtml(rider.id) + "\" aria-label=\"View rider\">" +
        "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"><path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg></button>" +
        "<button type=\"button\" class=\"bike-delivery-action-btn bike-delivery-action-btn--approve\" data-action=\"approve\" data-id=\"" + escapeHtml(rider.id) + "\" aria-label=\"Approve rider\"" + (canApprove ? "" : " disabled") + ">" +
        "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><polyline points=\"20 6 9 17 4 12\"/></svg></button>" +
        "<button type=\"button\" class=\"bike-delivery-action-btn bike-delivery-action-btn--reject\" data-action=\"" + (declineAction || "decline") + "\" data-id=\"" + escapeHtml(rider.id) + "\" aria-label=\"" + escapeHtml(declineLabel) + "\"" + (declineDisabled ? " disabled" : "") + ">" +
        "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg></button>" +
        "</div></td></tr>"
      );
    }).join("");
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

  function loadStats() {
    return apiRequest(API.stats).then(renderStats).catch(function () {
      renderStats({});
    });
  }

  function loadPricing() {
    return apiRequest(API.pricing).then(renderPricing).catch(function () {
      if (pricingList) {
        pricingList.innerHTML = '<li class="bike-delivery-pricing__loading">Unable to load pricing.</li>';
      }
    });
  }

  function loadZones() {
    return apiRequest(API.zones).then(renderZones).catch(function () {
      if (zonesTags) {
        zonesTags.innerHTML = '<span class="bike-delivery-zones__loading">Unable to load zones.</span>';
      }
    });
  }

  function loadRiders() {
    const params = new URLSearchParams({
      page: String(state.page),
      limit: String(state.limit),
    });
    if (state.search) params.set("search", state.search);
    if (state.status && state.status !== "all") params.set("status", state.status);

    return apiRequest(API.riders + "?" + params.toString())
      .then(function (data) {
        state.riders = (data.riders || []).map(normalizeRider).filter(Boolean);
        state.total = data.total || 0;
        state.totalPages = data.total_pages || 1;
        renderTable();
        updatePagination();
      })
      .catch(function (err) {
        if (tbody) {
          tbody.innerHTML =
            '<tr class="bike-delivery-table__empty"><td colspan="9">' + escapeHtml(err.message) + "</td></tr>";
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
    loadRiders();
  }

  function updateRiderStatus(riderId, status, message) {
    return apiRequest(API.riderStatus(riderId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status }),
    })
      .then(function (updated) {
        const normalized = normalizeRider(updated);
        const idx = state.riders.findIndex(function (r) {
          return String(r.id) === String(riderId);
        });
        if (idx !== -1 && normalized) {
          state.riders[idx] = normalized;
          renderTable();
        } else {
          loadRiders();
        }
        showToast(message);
        loadStats();
      })
      .catch(function (err) {
        showToast(err.message, true);
      });
  }

  function viewRider(riderId) {
    apiRequest(API.rider(riderId))
      .then(function (raw) {
        const rider = normalizeRider(raw);
        detailBody.innerHTML =
          "<div class=\"bike-delivery-cell-rider\" style=\"margin-bottom:1.25rem\">" +
          "<span class=\"bike-delivery-avatar\">" + escapeHtml(rider.initials) + "</span>" +
          "<div><p class=\"bike-delivery-cell-rider__name\">" + escapeHtml(rider.full_name) + "</p>" +
          "<p class=\"bike-delivery-cell-rider__id\">" + escapeHtml(rider.public_id) + " · " + escapeHtml(rider.status_label) + "</p></div></div>" +
          "<dl class=\"bike-delivery-detail-grid\">" +
          "<div><dt>Email</dt><dd>" + escapeHtml(rider.email || "-") + "</dd></div>" +
          "<div><dt>Phone</dt><dd>" + escapeHtml(rider.phone || "-") + "</dd></div>" +
          "<div><dt>Bike</dt><dd>" + escapeHtml(rider.bike_model) + "</dd></div>" +
          "<div><dt>Plate</dt><dd>" + escapeHtml(rider.plate_number) + "</dd></div>" +
          "<div><dt>Zone</dt><dd>" + escapeHtml(rider.zone) + "</dd></div>" +
          "<div><dt>Deliveries</dt><dd>" + escapeHtml(formatCount(rider.delivery_count)) + "</dd></div>" +
          "<div><dt>Earnings</dt><dd>" + escapeHtml(rider.earnings_display) + "</dd></div>" +
          "<div><dt>Rating</dt><dd>" + escapeHtml(rider.rating_display) + "</dd></div>" +
          "</dl>";
        openModal(detailModal);
      })
      .catch(function (err) {
        showToast(err.message, true);
      });
  }

  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    if (!window.AdminConfirm || !window.AdminConfirm.isOpen()) {
      document.body.style.overflow = "";
    }
  }

  function closeAllModals() {
    [detailModal, onboardModal].forEach(closeModal);
    if (onboardForm) onboardForm.reset();
    if (onboardError) onboardError.hidden = true;
  }

  function bindEvents() {
    const onboardBtn = document.getElementById("bike-onboard-btn");
    if (onboardBtn) {
      onboardBtn.addEventListener("click", function () {
        if (onboardError) onboardError.hidden = true;
        openModal(onboardModal);
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(function () {
          state.search = searchInput.value.trim();
          state.page = 1;
          loadRiders();
        }, 300);
      });
    }

    filterTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        setFilter(tab.dataset.status || "all");
      });
    });

    if (tbody) {
      tbody.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-action]");
        if (!btn || btn.disabled) return;
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        const rider = state.riders.find(function (r) { return String(r.id) === String(id); });
        if (!rider) return;

        if (action === "view") {
          viewRider(id);
        } else if (action === "approve") {
          window.AdminConfirm.show({
            title: "Approve rider",
            message: "Approve " + rider.full_name + " for bike deliveries?",
            confirmLabel: "Approve",
          }).then(function (confirmed) {
            if (confirmed) updateRiderStatus(id, "approved", rider.full_name + " approved");
          });
        } else if (action === "reject") {
          window.AdminConfirm.show({
            title: "Reject application",
            message: "Reject " + rider.full_name + "'s bike delivery application?",
            confirmLabel: "Reject",
            variant: "danger",
          }).then(function (confirmed) {
            if (confirmed) updateRiderStatus(id, "rejected", rider.full_name + " rejected");
          });
        } else if (action === "suspend") {
          window.AdminConfirm.show({
            title: "Suspend rider",
            message: "Suspend " + rider.full_name + "? They will not receive new deliveries.",
            confirmLabel: "Suspend",
            variant: "danger",
          }).then(function (confirmed) {
            if (confirmed) updateRiderStatus(id, "suspended", rider.full_name + " suspended");
          });
        }
      });
    }

    if (onboardForm) {
      onboardForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (onboardError) onboardError.hidden = true;
        const formData = new FormData(onboardForm);
        const payload = Object.fromEntries(formData.entries());
        apiRequest(API.onboard, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then(function () {
            closeAllModals();
            showToast("Rider onboarded");
            loadStats();
            loadRiders();
          })
          .catch(function (err) {
            if (onboardError) {
              onboardError.textContent = err.message;
              onboardError.hidden = false;
            } else {
              showToast(err.message, true);
            }
          });
      });
    }

    document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
      btn.addEventListener("click", closeAllModals);
    });

    [detailModal, onboardModal].forEach(function (overlay) {
      if (!overlay) return;
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeAllModals();
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (window.AdminConfirm && window.AdminConfirm.isOpen()) return;
      closeAllModals();
    });

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (state.page > 1) {
          state.page -= 1;
          loadRiders();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (state.page < state.totalPages) {
          state.page += 1;
          loadRiders();
        }
      });
    }
  }

  function init() {
    if (!document.querySelector(".bike-delivery-page")) return;
    bindEvents();
    loadStats();
    loadPricing();
    loadZones();
    loadRiders();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
