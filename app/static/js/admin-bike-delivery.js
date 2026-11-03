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
    dispatchConfig: "/admin/api/bike-delivery/dispatch/config",
    dispatchMonitor: "/admin/api/bike-delivery/dispatch/monitor",
    dispatchAnalytics: "/admin/api/bike-delivery/dispatch/analytics",
    dispatchReassign: "/admin/api/bike-delivery/dispatch/reassign",
    dispatchRestrict: function (id) {
      return "/admin/api/bike-delivery/dispatch/drivers/" + encodeURIComponent(id) + "/restriction";
    },
  };

  const DISPATCH_DEFAULTS = {
    multiDispatchEnabled: true,
    routeCompatibilityEnabled: true,
    capacityValidationEnabled: true,
    routeOptimizationEnabled: true,
    capacityNotificationsEnabled: true,
    combinedStatusEnabled: true,
    maxDetourMinutes: 10,
    maxLatenessMinutes: 0,
    maxPickupRadiusKm: 15,
    vehicleLimits: [
      { name: "Bike", max: 3, capacity: 3, enabled: true },
      { name: "Keke", max: 5, capacity: 6, enabled: true },
      { name: "Car", max: 7, capacity: 10, enabled: true },
    ],
    packages: [
      { name: "Small", points: 1, weightKg: 2, maxLengthCm: 40, maxWidthCm: 30, maxHeightCm: 20, bike: true, keke: true, car: true, dedicated: false },
      { name: "Medium", points: 2, weightKg: 5, maxLengthCm: 60, maxWidthCm: 40, maxHeightCm: 40, bike: true, keke: true, car: true, dedicated: false },
      { name: "Large", points: 3, weightKg: 15, maxLengthCm: 90, maxWidthCm: 60, maxHeightCm: 60, bike: false, keke: true, car: true, dedicated: false },
    ],
  };

  let dispatchConfig = null;

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
      const isSuspended = rider.backend_status === "suspended";
      const canApprove = isPending;
      const positiveAction = isSuspended ? "unlock" : "approve";
      const positiveLabel = isSuspended ? "Unlock rider" : "Approve rider";
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
        "<button type=\"button\" class=\"bike-delivery-action-btn bike-delivery-action-btn--approve\" data-action=\"" + positiveAction + "\" data-id=\"" + escapeHtml(rider.id) + "\" aria-label=\"" + escapeHtml(positiveLabel) + "\"" + ((isSuspended || canApprove) ? "" : " disabled") + ">" +
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

  function updateRiderStatus(riderId, status, message, reason) {
    const payload = { status: status };
    if (reason) payload.reason = reason;
    return apiRequest(API.riderStatus(riderId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
        } else if (action === "unlock") {
          window.AdminConfirm.show({
            title: "Unlock rider",
            message: "Confirm the suspension reason for " + rider.full_name + " is settled. They will be able to sign in again.",
            confirmLabel: "Unlock",
          }).then(function (confirmed) {
            if (!confirmed) return;
            apiRequest("/admin/api/drivers/" + encodeURIComponent(id) + "/unlock", { method: "POST" })
              .then(function () {
                showToast(rider.full_name + " unlocked");
                return loadRiders();
              })
              .catch(function (err) {
                showToast(err.message, true);
              });
          });
        } else if (action === "approve") {
          window.AdminConfirm.show({
            title: "Approve rider",
            message: "Approve " + rider.full_name + " for bike deliveries?",
            confirmLabel: "Approve",
          }).then(function (confirmed) {
            if (confirmed) updateRiderStatus(id, "approved", rider.full_name + " approved");
          });
        } else if (action === "reject") {
          window.AdminConfirm.promptNote({
            title: "Reject application",
            message: "Reject " + rider.full_name + "'s bike delivery application?",
            confirmLabel: "Reject",
            variant: "danger",
            inputLabel: "Reason for rejection",
            placeholder: "Explain why this application is being rejected",
            hint: "The rider sees this note in the app and by email.",
          }).then(function (result) {
            if (result && result.confirmed) {
              updateRiderStatus(id, "rejected", rider.full_name + " rejected", result.value.trim());
            }
          });
        } else if (action === "suspend") {
          window.AdminConfirm.promptNote({
            title: "Suspend rider",
            message: "Suspend " + rider.full_name + "? They will not be able to sign in until you unlock the account.",
            confirmLabel: "Suspend",
            variant: "danger",
            inputLabel: "Reason for suspension",
            placeholder: "Explain why this account is being suspended",
            hint: "This reason is emailed to the rider. Only an admin can unlock the account after it is settled.",
          }).then(function (result) {
            if (result && result.confirmed) {
              updateRiderStatus(id, "suspended", rider.full_name + " suspended", result.value.trim());
            }
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
        const onboardSubmit = e.target.querySelector('button[type="submit"], input[type="submit"]');
        if (onboardSubmit && window.ButtonLoading) window.ButtonLoading.start(onboardSubmit, { text: "Onboarding…" });
        apiRequest(API.onboard, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then(function (rider) {
            closeAllModals();
            loadStats();
            loadRiders();
            if (rider && rider.login_email_sent) {
              showToast("Login details emailed to " + (rider.email || "the driver"));
            } else if (rider && rider.temporary_password) {
              window.alert(
                "The rider was added, but the login email did not send. Share this temporary password so they can sign in and change it:\n\n" +
                  rider.temporary_password
              );
            } else {
              showToast("Rider onboarded, but login details were not emailed.", true);
            }
          })
          .catch(function (err) {
            if (onboardError) {
              onboardError.textContent = err.message;
              onboardError.hidden = false;
            } else {
              showToast(err.message, true);
            }
          })
          .finally(function () {
            if (onboardSubmit && window.ButtonLoading) window.ButtonLoading.stop(onboardSubmit);
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

  function dispatchChecked(id) {
    const node = document.getElementById(id);
    return Boolean(node && node.checked);
  }

  function setDispatchChecked(id, value) {
    const node = document.getElementById(id);
    if (node) node.checked = Boolean(value);
  }

  function mergeDispatchConfig(config) {
    const base = JSON.parse(JSON.stringify(DISPATCH_DEFAULTS));
    if (!config || typeof config !== "object") return base;
    return {
      multiDispatchEnabled: config.multiDispatchEnabled != null ? config.multiDispatchEnabled : base.multiDispatchEnabled,
      routeCompatibilityEnabled: config.routeCompatibilityEnabled != null ? config.routeCompatibilityEnabled : base.routeCompatibilityEnabled,
      capacityValidationEnabled: config.capacityValidationEnabled != null ? config.capacityValidationEnabled : base.capacityValidationEnabled,
      routeOptimizationEnabled: config.routeOptimizationEnabled != null ? config.routeOptimizationEnabled : base.routeOptimizationEnabled,
      capacityNotificationsEnabled: config.capacityNotificationsEnabled != null ? config.capacityNotificationsEnabled : base.capacityNotificationsEnabled,
      combinedStatusEnabled: config.combinedStatusEnabled != null ? config.combinedStatusEnabled : base.combinedStatusEnabled,
      maxDetourMinutes: config.maxDetourMinutes != null ? config.maxDetourMinutes : base.maxDetourMinutes,
      maxLatenessMinutes: config.maxLatenessMinutes != null ? config.maxLatenessMinutes : base.maxLatenessMinutes,
      maxPickupRadiusKm: config.maxPickupRadiusKm != null ? config.maxPickupRadiusKm : base.maxPickupRadiusKm,
      vehicleLimits: Array.isArray(config.vehicleLimits) && config.vehicleLimits.length ? config.vehicleLimits : base.vehicleLimits,
      packages: Array.isArray(config.packages) && config.packages.length ? config.packages : base.packages,
    };
  }

  function renderDispatchConfig(config) {
    config = mergeDispatchConfig(config);
    dispatchConfig = config;
    setDispatchChecked("dispatch-enabled", config.multiDispatchEnabled);
    setDispatchChecked("dispatch-route", config.routeCompatibilityEnabled);
    setDispatchChecked("dispatch-capacity", config.capacityValidationEnabled);
    setDispatchChecked("dispatch-optimize", config.routeOptimizationEnabled);
    setDispatchChecked("dispatch-notices", config.capacityNotificationsEnabled);
    setDispatchChecked("dispatch-shared", config.combinedStatusEnabled);
    const detour = document.getElementById("dispatch-detour");
    const lateness = document.getElementById("dispatch-lateness");
    const radius = document.getElementById("dispatch-radius");
    const mode = document.getElementById("dispatch-mode");
    if (detour) detour.value = config.maxDetourMinutes;
    if (lateness) lateness.value = config.maxLatenessMinutes;
    if (radius) radius.value = config.maxPickupRadiusKm;
    if (mode) {
      mode.textContent = config.multiDispatchEnabled
        ? "Drivers can accept another delivery while one is already active."
        : "Drivers finish the current delivery before accepting another. Jobs already accepted stay active.";
    }
    const vehicles = document.getElementById("dispatch-vehicle-body");
    if (vehicles) {
      const rows = config.vehicleLimits || [];
      vehicles.innerHTML = rows.length
        ? rows.map(function (item, index) {
            return (
              '<article class="dispatch-admin__vehicle-card">' +
              '<div class="dispatch-admin__vehicle-card-top">' +
              '<h4 class="dispatch-admin__vehicle-name">' + escapeHtml(item.name) + "</h4>" +
              '<label class="dispatch-admin__switch">' +
              '<input type="checkbox" data-vehicle-enabled="' + index + '"' + (item.enabled ? " checked" : "") + ">" +
              '<span class="dispatch-admin__switch-ui" aria-hidden="true"></span>' +
              '<span class="sr-only">Enable ' + escapeHtml(item.name) + "</span>" +
              "</label>" +
              "</div>" +
              '<div class="dispatch-admin__vehicle-fields">' +
              "<label><span class=\"dispatch-admin__field-label\">Max dispatches</span>" +
              '<input type="number" min="1" max="20" data-vehicle-max="' + index + '" value="' + item.max + '"></label>' +
              "<label><span class=\"dispatch-admin__field-label\">Capacity points</span>" +
              '<input type="number" min="1" max="50" data-vehicle-capacity="' + index + '" value="' + item.capacity + '"></label>' +
              "</div>" +
              "</article>"
            );
          }).join("")
        : '<p class="dispatch-admin__empty">No vehicle limits configured.</p>';
    }
    const packages = document.getElementById("dispatch-package-body");
    if (packages) {
      const rows = config.packages || [];
      packages.innerHTML = rows.length
        ? rows.map(function (item, index) {
            function chip(key, label) {
              return (
                '<label class="dispatch-admin__chip">' +
                '<input type="checkbox" data-package-' + key + '="' + index + '"' + (item[key] ? " checked" : "") + ">" +
                "<span>" + label + "</span></label>"
              );
            }
            return (
              '<article class="dispatch-admin__package-card">' +
              '<div class="dispatch-admin__package-head">' +
              '<h4 class="dispatch-admin__package-name">' + escapeHtml(item.name) + "</h4>" +
              '<span class="dispatch-admin__package-badge">' + item.points + " pts</span>" +
              "</div>" +
              '<div class="dispatch-admin__package-grid">' +
              "<label><span class=\"dispatch-admin__field-label\">Points</span>" +
              '<input type="number" min="1" max="20" data-package-points="' + index + '" value="' + item.points + '"></label>' +
              "<label><span class=\"dispatch-admin__field-label\">Weight (kg)</span>" +
              '<input type="number" min="1" max="200" data-package-weight="' + index + '" value="' + item.weightKg + '"></label>' +
              "<label><span class=\"dispatch-admin__field-label\">Length (cm)</span>" +
              '<input type="number" min="1" max="400" data-package-length="' + index + '" value="' + item.maxLengthCm + '"></label>' +
              "<label><span class=\"dispatch-admin__field-label\">Width (cm)</span>" +
              '<input type="number" min="1" max="400" data-package-width="' + index + '" value="' + item.maxWidthCm + '"></label>' +
              "<label><span class=\"dispatch-admin__field-label\">Height (cm)</span>" +
              '<input type="number" min="1" max="400" data-package-height="' + index + '" value="' + item.maxHeightCm + '"></label>' +
              "</div>" +
              '<div class="dispatch-admin__package-vehicles">' +
              chip("bike", "Bike") +
              chip("keke", "Keke") +
              chip("car", "Car") +
              chip("dedicated", "Dedicated") +
              "</div>" +
              "</article>"
            );
          }).join("")
        : '<p class="dispatch-admin__empty">No packages configured.</p>';
    }
  }

  function readDispatchForm() {
    const source = dispatchConfig || DISPATCH_DEFAULTS;
    function numberValue(selector, fallback) {
      const node = document.querySelector(selector);
      const value = Number(node && node.value);
      return Number.isFinite(value) ? value : fallback;
    }
    function checked(selector) {
      const node = document.querySelector(selector);
      return Boolean(node && node.checked);
    }
    return {
      multiDispatchEnabled: dispatchChecked("dispatch-enabled"),
      routeCompatibilityEnabled: dispatchChecked("dispatch-route"),
      capacityValidationEnabled: dispatchChecked("dispatch-capacity"),
      routeOptimizationEnabled: dispatchChecked("dispatch-optimize"),
      capacityNotificationsEnabled: dispatchChecked("dispatch-notices"),
      combinedStatusEnabled: dispatchChecked("dispatch-shared"),
      maxDetourMinutes: numberValue("#dispatch-detour", source.maxDetourMinutes),
      maxLatenessMinutes: numberValue("#dispatch-lateness", source.maxLatenessMinutes),
      maxPickupRadiusKm: numberValue("#dispatch-radius", source.maxPickupRadiusKm),
      vehicleLimits: (source.vehicleLimits || []).map(function (item, index) {
        return {
          name: item.name,
          max: numberValue('[data-vehicle-max="' + index + '"]', item.max),
          capacity: numberValue('[data-vehicle-capacity="' + index + '"]', item.capacity),
          enabled: checked('[data-vehicle-enabled="' + index + '"]'),
        };
      }),
      packages: (source.packages || []).map(function (item, index) {
        return {
          name: item.name,
          points: numberValue('[data-package-points="' + index + '"]', item.points),
          weightKg: numberValue('[data-package-weight="' + index + '"]', item.weightKg),
          maxLengthCm: numberValue('[data-package-length="' + index + '"]', item.maxLengthCm),
          maxWidthCm: numberValue('[data-package-width="' + index + '"]', item.maxWidthCm),
          maxHeightCm: numberValue('[data-package-height="' + index + '"]', item.maxHeightCm),
          bike: checked('[data-package-bike="' + index + '"]'),
          keke: checked('[data-package-keke="' + index + '"]'),
          car: checked('[data-package-car="' + index + '"]'),
          dedicated: checked('[data-package-dedicated="' + index + '"]'),
        };
      }),
    };
  }

  function limitsWereLowered(previous, next) {
    return (next.vehicleLimits || []).some(function (item) {
      const before = (previous.vehicleLimits || []).find(function (row) { return row.name === item.name; });
      return before && (item.max < before.max || item.capacity < before.capacity || (before.enabled && !item.enabled));
    }) || (previous.multiDispatchEnabled && !next.multiDispatchEnabled);
  }

  function renderAudits(audits) {
    const list = document.getElementById("dispatch-audit");
    if (!list) return;
    if (!audits || !audits.length) {
      list.innerHTML = '<li class="dispatch-admin__empty">No dispatch setting changes yet.</li>';
      return;
    }
    list.innerHTML = audits.map(function (row) {
      const when = row.created_at ? new Date(row.created_at).toLocaleString() : "Unknown time";
      const action = row.next && row.next.action === "reassign"
        ? "Reassigned delivery " + escapeHtml(row.next.ride_id || "")
        : "Updated dispatch settings";
      return "<li><strong>" + action + '</strong><span class="dispatch-admin__audit-meta">' + escapeHtml(when) + "</span></li>";
    }).join("");
  }

  function renderMonitor(payload) {
    const body = document.getElementById("dispatch-monitor-body");
    if (!body) return;
    const drivers = payload && payload.drivers ? payload.drivers : [];
    if (!drivers.length) {
      body.innerHTML = '<tr><td colspan="6"><p class="dispatch-admin__empty">No driver is carrying an active delivery.</p></td></tr>';
      return;
    }
    body.innerHTML = drivers.map(function (driver) {
      const jobs = (driver.dispatches || []).map(function (job) {
        const late = job.late ? " · late" : "";
        return "<li><strong>" + escapeHtml(job.booking_id || job.id) + "</strong> · " + escapeHtml(job.status) + escapeHtml(late) +
          "<br>" + escapeHtml(job.pickup_address || "") + " → " + escapeHtml(job.destination_address || "") +
          '<br><button type="button" class="bike-delivery-btn bike-delivery-btn--ghost" data-reassign="' + escapeHtml(job.id) + '">Reassign</button></li>';
      }).join("");
      const restricted = driver.status === "Restricted";
      const statusClass = restricted ? "dispatch-admin__status dispatch-admin__status--restricted" : "dispatch-admin__status";
      return (
        "<tr>" +
        "<td>" + escapeHtml(driver.name) + (jobs ? '<ul class="dispatch-admin__jobs">' + jobs + "</ul>" : "") + "</td>" +
        "<td>" + escapeHtml(driver.vehicle || "—") + "</td>" +
        "<td>" + escapeHtml(driver.active + "/" + driver.max) + "</td>" +
        "<td>" + escapeHtml(driver.points + "/" + driver.capacity) + "</td>" +
        '<td><span class="' + statusClass + '">' + escapeHtml(driver.status) + "</span></td>" +
        '<td><button type="button" class="bike-delivery-btn bike-delivery-btn--ghost" data-restrict="' + escapeHtml(driver.driver_id) + '" data-restricted="' + (restricted ? "0" : "1") + '">' +
        (restricted ? "Allow more" : "Restrict") + "</button></td>" +
        "</tr>"
      );
    }).join("");
  }

  function metric(label, value) {
    const shown = value == null || value === "" ? "—" : value;
    return '<div class="dispatch-admin__metric"><span>' + label + '</span><strong>' + shown + "</strong></div>";
  }

  function renderAnalytics(data) {
    const node = document.getElementById("dispatch-analytics");
    if (!node) return;
    if (!data) {
      node.innerHTML = '<p class="dispatch-admin__empty">No analytics available for this range.</p>';
      return;
    }
    function rate(value) {
      return value == null ? null : Math.round(Number(value) * 100) + "%";
    }
    node.innerHTML = [
      metric("Stacked deliveries", data.stacked_deliveries),
      metric("Drivers with a stacked delivery", data.stacked_drivers),
      metric("Deliveries in range", data.deliveries),
      metric("Completion rate", rate(data.completion_rate)),
      metric("Cancellation rate", rate(data.cancellation_rate)),
      metric("On-time rate", rate(data.on_time_rate)),
      metric("Drivers with an active delivery", data.active_multi_drivers),
      metric("Average active dispatches", data.average_active_dispatches == null ? null : Number(data.average_active_dispatches).toFixed(1)),
      metric("Customer complaints", data.customer_complaints),
      metric("Average pickup delay (min)", data.average_pickup_delay_minutes),
      metric("Average delivery delay (min)", data.average_delivery_delay_minutes),
      metric("Earnings per active hour", data.earnings_per_active_hour_ngn),
      metric("Route detour impact (min)", data.route_detour_impact_minutes),
      metric("Failed multi-dispatch assignments", data.failed_assignments),
    ].join("");
  }

  function loadDispatch() {
    if (!document.getElementById("dispatch-admin")) return;
    renderDispatchConfig(DISPATCH_DEFAULTS);
    renderAudits([]);
    apiRequest(API.dispatchConfig)
      .then(function (data) {
        renderDispatchConfig(data.config || DISPATCH_DEFAULTS);
        renderAudits(data.audits || []);
      })
      .catch(function (err) {
        renderDispatchConfig(DISPATCH_DEFAULTS);
        renderAudits([]);
        showToast(err.message || "Could not load dispatch settings", true);
      });
    apiRequest(API.dispatchMonitor)
      .then(renderMonitor)
      .catch(function (err) {
        renderMonitor({ drivers: [] });
        showToast(err.message || "Could not load workloads", true);
      });
    const from = document.getElementById("dispatch-from");
    const to = document.getElementById("dispatch-to");
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    if (to && !to.value) to.value = today.toISOString().slice(0, 10);
    if (from && !from.value) from.value = weekAgo.toISOString().slice(0, 10);
    loadDispatchAnalytics();
  }

  function loadDispatchAnalytics() {
    const from = document.getElementById("dispatch-from");
    const to = document.getElementById("dispatch-to");
    const node = document.getElementById("dispatch-analytics");
    if (node) node.innerHTML = '<p class="dispatch-admin__empty">Loading analytics…</p>';
    const params = new URLSearchParams();
    if (from && from.value) params.set("from", from.value);
    if (to && to.value) params.set("to", to.value);
    apiRequest(API.dispatchAnalytics + (params.toString() ? "?" + params.toString() : ""))
      .then(renderAnalytics)
      .catch(function (err) {
        if (node) node.innerHTML = '<p class="dispatch-admin__empty">Could not load analytics.</p>';
        showToast(err.message || "Could not load analytics", true);
      });
  }

  function bindDispatch() {
    const save = document.getElementById("dispatch-save");
    const reset = document.getElementById("dispatch-reset");
    const error = document.getElementById("dispatch-error");
    const analyticsForm = document.getElementById("dispatch-analytics-form");
    const monitor = document.getElementById("dispatch-monitor-body");
    if (save) {
      save.addEventListener("click", function () {
        const next = readDispatchForm();
        const previous = dispatchConfig || DISPATCH_DEFAULTS;
        if (limitsWereLowered(previous, next)) {
          const confirmed = window.confirm("Lowering a limit does not cancel deliveries already accepted. Drivers above the new limit are flagged and cannot accept more until they finish a job. Save anyway?");
          if (!confirmed) return;
        }
        if (error) error.hidden = true;
        apiRequest(API.dispatchConfig, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        })
          .then(function (data) {
            renderDispatchConfig(data.config || next);
            renderAudits(data.audits || []);
            showToast("Dispatch settings saved");
            apiRequest(API.dispatchMonitor).then(renderMonitor).catch(function () {});
          })
          .catch(function (err) {
            if (error) {
              error.textContent = err.message;
              error.hidden = false;
            } else {
              showToast(err.message, true);
            }
          });
      });
    }
    if (reset) {
      reset.addEventListener("click", function () {
        renderDispatchConfig(JSON.parse(JSON.stringify(DISPATCH_DEFAULTS)));
        showToast("Defaults restored in the form. Save to apply them.");
      });
    }
    if (analyticsForm) {
      analyticsForm.addEventListener("submit", function (event) {
        event.preventDefault();
        loadDispatchAnalytics();
      });
    }
    if (monitor) {
      monitor.addEventListener("click", function (event) {
        const restrict = event.target.closest("[data-restrict]");
        const reassign = event.target.closest("[data-reassign]");
        if (restrict) {
          const driverId = restrict.getAttribute("data-restrict");
          const restricted = restrict.getAttribute("data-restricted") === "1";
          apiRequest(API.dispatchRestrict(driverId), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ restricted: restricted }),
          })
            .then(function () {
              showToast(restricted ? "Driver restricted from additional deliveries" : "Driver can accept additional deliveries");
              return apiRequest(API.dispatchMonitor).then(renderMonitor);
            })
            .catch(function (err) { showToast(err.message, true); });
        }
        if (reassign) {
          const rideId = reassign.getAttribute("data-reassign");
          const driverId = window.prompt("Destination driver id. The server checks that driver's capacity and route before moving this delivery.");
          if (!driverId) return;
          apiRequest(API.dispatchReassign, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ride_id: rideId, driver_id: driverId.trim() }),
          })
            .then(function () {
              showToast("Delivery reassigned");
              return apiRequest(API.dispatchMonitor).then(renderMonitor);
            })
            .catch(function (err) { showToast(err.message, true); });
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
    bindDispatch();
    loadDispatch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
