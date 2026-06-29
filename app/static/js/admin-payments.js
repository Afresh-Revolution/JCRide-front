(function () {
  "use strict";

  const state = {
    search: "",
    status: "",
    category: "",
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    transactions: [],
  };

  const kpiSuccessfulAmount = document.getElementById("kpi-successful-amount");
  const kpiSuccessfulTrend = document.getElementById("kpi-successful-trend");
  const kpiFailedAmount = document.getElementById("kpi-failed-amount");
  const kpiFailedTrend = document.getElementById("kpi-failed-trend");
  const kpiFundingAmount = document.getElementById("kpi-funding-amount");
  const kpiFundingTrend = document.getElementById("kpi-funding-trend");
  const kpiRefundsAmount = document.getElementById("kpi-refunds-amount");
  const kpiRefundsTrend = document.getElementById("kpi-refunds-trend");
  const tbody = document.getElementById("payments-table-body");
  const filterToggle = document.getElementById("payments-filter-toggle");
  const filterPanel = document.getElementById("payments-filter-panel");
  const filterStatus = document.getElementById("payments-filter-status");
  const filterType = document.getElementById("payments-filter-type");
  const filterSearch = document.getElementById("payments-filter-search");
  const filterApply = document.getElementById("payments-filter-apply");
  const filterClear = document.getElementById("payments-filter-clear");
  const settleBtn = document.getElementById("payments-settle-btn");
  const settleModal = document.getElementById("settle-modal");
  const settleForm = document.getElementById("settle-form");
  const settleFormError = document.getElementById("settle-form-error");
  const pagination = document.getElementById("payments-pagination");
  const paginationInfo = document.getElementById("payments-pagination-info");
  const prevBtn = document.getElementById("payments-prev-btn");
  const nextBtn = document.getElementById("payments-next-btn");
  const toast = document.getElementById("payments-toast");

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
          const detail = data.message || data.detail;
          const message = typeof detail === "string" ? detail : "Request failed";
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

  function formatNaira(amount) {
    const value = Number(amount || 0);
    if (value >= 1000000) {
      return "₦" + (value / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    }
    if (value >= 1000) {
      return "₦" + (value / 1000).toFixed(0) + "k";
    }
    return "₦" + value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function formatNairaFull(amount) {
    return "₦" + Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function formatCount(n) {
    return Number(n || 0).toLocaleString();
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderStats(stats) {
    const successful = stats.successful_24h || {};
    const failed = stats.failed_24h || {};
    const funding = stats.wallet_funding_24h || {};
    const refunds = stats.refunds_24h || {};

    if (kpiSuccessfulAmount) kpiSuccessfulAmount.textContent = formatNaira(successful.amount_ngn);
    if (kpiSuccessfulTrend) {
      kpiSuccessfulTrend.textContent = "▲ " + formatCount(successful.transaction_count) + " txns";
    }
    if (kpiFailedAmount) kpiFailedAmount.textContent = formatNaira(failed.amount_ngn);
    if (kpiFailedTrend) {
      kpiFailedTrend.textContent = "▲ " + formatCount(failed.transaction_count) + " txns";
    }
    if (kpiFundingAmount) kpiFundingAmount.textContent = formatNaira(funding.amount_ngn);
    if (kpiFundingTrend) {
      const provider = funding.provider_label || "paystack";
      kpiFundingTrend.textContent = "▲ " + provider;
    }
    if (kpiRefundsAmount) kpiRefundsAmount.textContent = formatNaira(refunds.amount_ngn);
    if (kpiRefundsTrend) {
      kpiRefundsTrend.textContent = "▲ " + formatCount(refunds.transaction_count) + " txns";
    }
  }

  function loadStats() {
    return apiRequest("/admin/api/payments/stats")
      .then(renderStats)
      .catch(function () {
        // Stats are supplementary; table data may still load. Avoid noisy toasts on 404/stale API.
      });
  }

  function statusClass(status) {
    return "payments-status payments-status--" + (status || "pending");
  }

  function renderTable() {
    if (!tbody) return;
    if (!state.transactions.length) {
      tbody.innerHTML = '<tr class="payments-table__empty"><td colspan="7">No transactions found.</td></tr>';
      return;
    }
    tbody.innerHTML = state.transactions
      .map(function (tx) {
        return (
          "<tr>" +
          '<td><span class="payments-ref">' + escapeHtml(tx.reference) + "</span></td>" +
          '<td><span class="payments-user">' + escapeHtml(tx.user_name) + "</span></td>" +
          "<td>" + escapeHtml(tx.type_label) + "</td>" +
          "<td>" + escapeHtml(tx.payment_method) + "</td>" +
          '<td class="payments-amount">' + escapeHtml(formatNairaFull(tx.amount_ngn)) + "</td>" +
          '<td><span class="' + statusClass(tx.status) + '">' + escapeHtml(tx.status) + "</span></td>" +
          '<td class="payments-date">' + escapeHtml(formatDate(tx.created_at)) + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function updatePagination() {
    if (!pagination) return;
    const hasPages = state.total > 0;
    pagination.hidden = !hasPages;
    if (!hasPages) return;
    const start = (state.page - 1) * state.limit + 1;
    const end = Math.min(state.page * state.limit, state.total);
    if (paginationInfo) {
      paginationInfo.textContent = "Showing " + start + "–" + end + " of " + formatCount(state.total);
    }
    if (prevBtn) prevBtn.disabled = state.page <= 1;
    if (nextBtn) nextBtn.disabled = state.page >= state.totalPages;
  }

  function buildQuery() {
    const params = new URLSearchParams();
    params.set("page", String(state.page));
    params.set("limit", String(state.limit));
    if (state.search) params.set("search", state.search);
    if (state.status) params.set("status", state.status);
    if (state.category) params.set("type", state.category);
    return "/admin/api/payments/transactions?" + params.toString();
  }

  function loadTransactions() {
    if (tbody) {
      tbody.innerHTML = '<tr class="payments-table__loading"><td colspan="7">Loading transactions…</td></tr>';
    }
    return apiRequest(buildQuery())
      .then(function (data) {
        state.transactions = data.transactions || [];
        state.total = data.total || 0;
        state.totalPages = data.total_pages || 1;
        renderTable();
        updatePagination();
      })
      .catch(function (err) {
        if (tbody) {
          tbody.innerHTML =
            '<tr class="payments-table__empty"><td colspan="7">' +
            escapeHtml(err.message || "Failed to load transactions") +
            "</td></tr>";
        }
        showToast(err.message || "Could not load transactions", true);
      });
  }

  function openModal(modal) {
    if (modal) modal.hidden = false;
  }

  function closeModal(modal) {
    if (modal) modal.hidden = true;
  }

  function toggleFilterPanel(forceOpen) {
    if (!filterPanel || !filterToggle) return;
    const open = typeof forceOpen === "boolean" ? forceOpen : filterPanel.hidden;
    filterPanel.hidden = !open;
    filterToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function applyFilters() {
    state.search = filterSearch ? filterSearch.value.trim() : "";
    state.status = filterStatus ? filterStatus.value : "";
    state.category = filterType ? filterType.value : "";
    state.page = 1;
    toggleFilterPanel(false);
    loadTransactions();
  }

  function clearFilters() {
    if (filterSearch) filterSearch.value = "";
    if (filterStatus) filterStatus.value = "";
    if (filterType) filterType.value = "";
    state.search = "";
    state.status = "";
    state.category = "";
    state.page = 1;
    toggleFilterPanel(false);
    loadTransactions();
  }

  function submitSettlement(event) {
    event.preventDefault();
    if (settleFormError) settleFormError.hidden = true;
    const amountInput = document.getElementById("settle-amount");
    const notesInput = document.getElementById("settle-notes");
    const payload = {};
    if (amountInput && amountInput.value) {
      payload.amount_ngn = Number(amountInput.value);
    }
    if (notesInput && notesInput.value.trim()) {
      payload.notes = notesInput.value.trim();
    }
    if (settleBtn) settleBtn.disabled = true;
    apiRequest("/admin/api/payments/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (result) {
        closeModal(settleModal);
        if (settleForm) settleForm.reset();
        showToast(
          "Settlement " +
            result.reference +
            " completed — " +
            formatNairaFull(result.amount_ngn) +
            " sent to bank."
        );
        loadStats();
        loadTransactions();
      })
      .catch(function (err) {
        if (settleFormError) {
          settleFormError.textContent = err.message || "Settlement failed";
          settleFormError.hidden = false;
        }
      })
      .finally(function () {
        if (settleBtn) settleBtn.disabled = false;
      });
  }

  function init() {
    loadStats();
    loadTransactions();

    if (filterToggle) {
      filterToggle.addEventListener("click", function () {
        toggleFilterPanel(filterPanel && filterPanel.hidden);
      });
    }
    if (filterApply) filterApply.addEventListener("click", applyFilters);
    if (filterClear) filterClear.addEventListener("click", clearFilters);

    document.addEventListener("click", function (event) {
      if (!filterPanel || filterPanel.hidden) return;
      const target = event.target;
      if (target.closest("#payments-filter")) return;
      toggleFilterPanel(false);
    });

    if (settleBtn) {
      settleBtn.addEventListener("click", function () {
        openModal(settleModal);
      });
    }

    if (settleForm) {
      settleForm.addEventListener("submit", submitSettlement);
    }

    document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeModal(settleModal);
      });
    });

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (state.page > 1) {
          state.page -= 1;
          loadTransactions();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (state.page < state.totalPages) {
          state.page += 1;
          loadTransactions();
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
