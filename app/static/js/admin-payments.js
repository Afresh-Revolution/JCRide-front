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
    if (!iso) return "-";
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderStats(stats) {
    const successful24h = stats.successful_24h || {};
    const failed24h = stats.failed_24h || {};
    const funding24h = stats.wallet_funding_24h || {};
    const refunds24h = stats.refunds_24h || {};
    const successfulAll = stats.successful_all || successful24h;
    const failedAll = stats.failed_all || failed24h;
    const fundingAll = stats.wallet_funding_all || funding24h;
    const refundsAll = stats.refunds_all || refunds24h;

    if (kpiSuccessfulAmount) kpiSuccessfulAmount.textContent = formatNaira(successfulAll.amount_ngn);
    if (kpiSuccessfulTrend) {
      kpiSuccessfulTrend.textContent =
        "▲ " + formatCount(successfulAll.transaction_count) + " total · " +
        formatCount(successful24h.transaction_count) + " (24h)";
    }
    if (kpiFailedAmount) kpiFailedAmount.textContent = formatNaira(failedAll.amount_ngn);
    if (kpiFailedTrend) {
      kpiFailedTrend.textContent =
        "▲ " + formatCount(failedAll.transaction_count) + " total · " +
        formatCount(failed24h.transaction_count) + " (24h)";
    }
    if (kpiFundingAmount) kpiFundingAmount.textContent = formatNaira(fundingAll.amount_ngn);
    if (kpiFundingTrend) {
      const provider = fundingAll.provider_label || funding24h.provider_label || "Monnify";
      kpiFundingTrend.textContent =
        "▲ " + formatCount(fundingAll.transaction_count) + " fundings · " + provider;
    }
    if (kpiRefundsAmount) kpiRefundsAmount.textContent = formatNaira(refundsAll.amount_ngn);
    if (kpiRefundsTrend) {
      kpiRefundsTrend.textContent =
        "▲ " + formatCount(refundsAll.transaction_count) + " total · " +
        formatCount(refunds24h.transaction_count) + " (24h)";
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
    if (state.category) params.set("category", state.category);
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
            " completed - " +
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
    initFundingQueue();
    initPaymentsTabs();

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

  const fundingState = {
    status: "pending",
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    items: [],
    rejectId: null,
  };

  function initPaymentsTabs() {
    const tabs = document.querySelectorAll("[data-payments-tab]");
    const panels = document.querySelectorAll("[data-payments-panel]");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        const target = tab.getAttribute("data-payments-tab");
        tabs.forEach(function (btn) {
          const active = btn.getAttribute("data-payments-tab") === target;
          btn.classList.toggle("is-active", active);
          btn.setAttribute("aria-selected", active ? "true" : "false");
        });
        panels.forEach(function (panel) {
          panel.hidden = panel.getAttribute("data-payments-panel") !== target;
        });
        if (target === "funding" && !fundingState.items.length) {
          loadFundingRequests();
        }
      });
    });
  }

  function queueStatusClass(status) {
    return "queue-status queue-status--" + String(status || "pending").replace(/\s+/g, "_");
  }

  function renderFundingTable() {
    const tbody = document.getElementById("funding-table-body");
    if (!tbody) return;
    if (!fundingState.items.length) {
      tbody.innerHTML = '<tr class="queue-table__empty"><td colspan="8">No funding requests found.</td></tr>';
      return;
    }
    tbody.innerHTML = fundingState.items
      .map(function (item) {
        const proof = item.proof_url
          ? '<a class="queue-proof-link" href="' + escapeHtml(item.proof_url) + '" target="_blank" rel="noopener">Proof</a>'
          : "-";
        const approveDisabled = item.can_approve ? "" : " disabled";
        const approveTitle = item.can_approve
          ? "Approve and credit wallet"
          : item.provider !== "manual"
            ? "Paystack fundings verify automatically"
            : "Already reviewed";
        return (
          "<tr data-funding-id=\"" + escapeHtml(item.id) + "\">" +
          '<td><span class="queue-ref">' + escapeHtml(item.reference) + "</span></td>" +
          "<td>" + escapeHtml(item.user_short) + "</td>" +
          '<td class="queue-amount">' + escapeHtml(formatNairaFull(item.amount_ngn)) + "</td>" +
          "<td>" + escapeHtml(item.bank_name) + " · " + escapeHtml(item.account_name) + " · " + proof + "</td>" +
          '<td><span class="queue-provider-tag' + (item.provider === "manual" ? " queue-provider-tag--manual" : "") + '">' + escapeHtml(item.provider) + "</span></td>" +
          '<td><span class="' + queueStatusClass(item.status) + '">' + escapeHtml(item.status) + "</span></td>" +
          '<td class="payments-date">' + escapeHtml(formatDate(item.created_at)) + "</td>" +
          '<td><div class="queue-actions">' +
          '<button type="button" class="queue-btn queue-btn--approve" data-funding-approve="' + escapeHtml(item.id) + '"' + approveDisabled + ' title="' + escapeHtml(approveTitle) + '">Approve</button>' +
          '<button type="button" class="queue-btn queue-btn--reject" data-funding-reject="' + escapeHtml(item.id) + '"' + (item.status === "pending" ? "" : " disabled") + ">Reject</button>" +
          "</div></td></tr>"
        );
      })
      .join("");
  }

  function updateFundingPagination() {
    const pagination = document.getElementById("funding-pagination");
    const info = document.getElementById("funding-pagination-info");
    const prevBtn = document.getElementById("funding-prev-btn");
    const nextBtn = document.getElementById("funding-next-btn");
    if (!pagination) return;
    pagination.hidden = fundingState.total <= 0;
    if (fundingState.total <= 0) return;
    const start = (fundingState.page - 1) * fundingState.limit + 1;
    const end = Math.min(fundingState.page * fundingState.limit, fundingState.total);
    if (info) info.textContent = "Showing " + start + "–" + end + " of " + formatCount(fundingState.total);
    if (prevBtn) prevBtn.disabled = fundingState.page <= 1;
    if (nextBtn) nextBtn.disabled = fundingState.page >= fundingState.totalPages;
  }

  function loadFundingRequests() {
    const tbody = document.getElementById("funding-table-body");
    if (tbody) {
      tbody.innerHTML = '<tr class="queue-table__loading"><td colspan="8">Loading funding requests…</td></tr>';
    }
    const params = new URLSearchParams();
    params.set("page", String(fundingState.page));
    params.set("limit", String(fundingState.limit));
    if (fundingState.status) params.set("status", fundingState.status);
    return apiRequest("/admin/api/payments/funding-requests?" + params.toString())
      .then(function (data) {
        fundingState.items = data.items || [];
        fundingState.total = data.total || 0;
        fundingState.totalPages = data.total_pages || 1;
        renderFundingTable();
        updateFundingPagination();
      })
      .catch(function (err) {
        if (tbody) {
          tbody.innerHTML = '<tr class="queue-table__empty"><td colspan="8">' + escapeHtml(err.message) + "</td></tr>";
        }
        showToast(err.message, true);
      });
  }

  function approveFunding(requestId) {
    window.AdminConfirm.show({
      title: "Approve funding",
      message: "Credit this user's wallet with the requested amount?",
      confirmLabel: "Approve",
    }).then(function (confirmed) {
      if (!confirmed) return;
      return apiRequest("/admin/api/payments/funding-requests/" + encodeURIComponent(requestId) + "/approve", {
        method: "POST",
      })
        .then(function () {
          showToast("Funding approved");
          loadFundingRequests();
          loadStats();
        })
        .catch(function (err) {
          showToast(err.message, true);
        });
    });
  }

  function openFundingRejectModal(requestId) {
    fundingState.rejectId = requestId;
    const modal = document.getElementById("funding-reject-modal");
    const form = document.getElementById("funding-reject-form");
    const error = document.getElementById("funding-reject-error");
    if (form) form.reset();
    if (error) error.hidden = true;
    if (modal) modal.hidden = false;
  }

  function closeFundingRejectModal() {
    fundingState.rejectId = null;
    const modal = document.getElementById("funding-reject-modal");
    if (modal) modal.hidden = true;
  }

  function submitFundingReject(event) {
    event.preventDefault();
    const reasonEl = document.getElementById("funding-reject-reason");
    const error = document.getElementById("funding-reject-error");
    const reason = reasonEl ? reasonEl.value.trim() : "";
    if (!fundingState.rejectId || reason.length < 2) return;
    if (error) error.hidden = true;
    apiRequest(
      "/admin/api/payments/funding-requests/" + encodeURIComponent(fundingState.rejectId) + "/reject",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason }),
      }
    )
      .then(function () {
        closeFundingRejectModal();
        showToast("Funding request rejected");
        loadFundingRequests();
      })
      .catch(function (err) {
        if (error) {
          error.textContent = err.message;
          error.hidden = false;
        }
      });
  }

  function initFundingQueue() {
    const statusFilter = document.getElementById("funding-status-filter");
    const prevBtn = document.getElementById("funding-prev-btn");
    const nextBtn = document.getElementById("funding-next-btn");
    const rejectForm = document.getElementById("funding-reject-form");
    const fundingBody = document.getElementById("funding-table-body");

    if (statusFilter) {
      statusFilter.addEventListener("change", function () {
        fundingState.status = statusFilter.value;
        fundingState.page = 1;
        loadFundingRequests();
      });
    }
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (fundingState.page > 1) {
          fundingState.page -= 1;
          loadFundingRequests();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (fundingState.page < fundingState.totalPages) {
          fundingState.page += 1;
          loadFundingRequests();
        }
      });
    }
    if (rejectForm) {
      rejectForm.addEventListener("submit", submitFundingReject);
    }
    document.querySelectorAll("[data-close-funding-reject]").forEach(function (btn) {
      btn.addEventListener("click", closeFundingRejectModal);
    });
    if (fundingBody) {
      fundingBody.addEventListener("click", function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const approveId = target.getAttribute("data-funding-approve");
        const rejectId = target.getAttribute("data-funding-reject");
        if (approveId && !target.disabled) approveFunding(approveId);
        if (rejectId && !target.disabled) openFundingRejectModal(rejectId);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
