(function () {
  "use strict";

  const state = {
    search: "",
    sort: "balance",
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 1,
    holders: [],
    searchTimer: null,
  };

  const kpiTotalFunds = document.getElementById("kpi-total-funds");
  const kpiInflowAmount = document.getElementById("kpi-inflow-amount");
  const kpiInflowTrend = document.getElementById("kpi-inflow-trend");
  const kpiOutflowAmount = document.getElementById("kpi-outflow-amount");
  const kpiOutflowTrend = document.getElementById("kpi-outflow-trend");
  const kpiRefundsAmount = document.getElementById("kpi-refunds-amount");
  const kpiRefundsTrend = document.getElementById("kpi-refunds-trend");
  const holdersGrid = document.getElementById("wallets-holders-grid");
  const searchInput = document.getElementById("wallets-search-input");
  const sortSelect = document.getElementById("wallets-sort-select");
  const pagination = document.getElementById("wallets-pagination");
  const paginationInfo = document.getElementById("wallets-pagination-info");
  const prevBtn = document.getElementById("wallets-prev-btn");
  const nextBtn = document.getElementById("wallets-next-btn");
  const toast = document.getElementById("wallets-toast");

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
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function formatNaira(amount) {
    const value = Number(amount || 0);
    if (value >= 1000000000) {
      return "₦" + (value / 1000000000).toFixed(2).replace(/\.00$/, "") + "B";
    }
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

  function renderStats(stats) {
    const inflow = stats.inflow_24h || {};
    const outflow = stats.outflow_24h || {};
    const refunds = stats.auto_refunds_24h || {};

    if (kpiTotalFunds) kpiTotalFunds.textContent = formatNaira(stats.total_wallet_funds);
    if (kpiInflowAmount) kpiInflowAmount.textContent = formatNaira(inflow.amount_ngn);
    if (kpiInflowTrend) {
      const label = inflow.trend_label || formatCount(inflow.transaction_count) + " fundings";
      kpiInflowTrend.textContent = "▲ " + label;
    }
    if (kpiOutflowAmount) kpiOutflowAmount.textContent = formatNaira(outflow.amount_ngn);
    if (kpiOutflowTrend) {
      kpiOutflowTrend.textContent = "▲ " + (outflow.trend_label || "Trips + payouts");
    }
    if (kpiRefundsAmount) kpiRefundsAmount.textContent = formatNaira(refunds.amount_ngn);
    if (kpiRefundsTrend) {
      kpiRefundsTrend.textContent = "▲ " + (refunds.trend_label || "Per-km reconciliation");
    }
  }

  function loadStats() {
    return apiRequest("/admin/api/wallets/stats")
      .then(renderStats)
      .catch(function () {
        // KPI cards stay at em dash if stats are unavailable.
      });
  }

  function renderHolders() {
    if (!holdersGrid) return;
    if (!state.holders.length) {
      holdersGrid.innerHTML = '<p class="wallets-holders__empty">No wallet holders found.</p>';
      return;
    }
    holdersGrid.innerHTML = state.holders
      .map(function (holder) {
        return (
          '<article class="wallets-holder">' +
          '<div class="wallets-holder__left">' +
          '<span class="wallets-holder__avatar" aria-hidden="true">' + escapeHtml(holder.initials) + "</span>" +
          '<div class="wallets-holder__meta">' +
          '<span class="wallets-holder__name">' + escapeHtml(holder.display_name) + "</span>" +
          '<span class="wallets-holder__role">' + escapeHtml(holder.role_label) + "</span>" +
          "</div></div>" +
          '<div class="wallets-holder__right">' +
          '<span class="wallets-holder__amount">' + escapeHtml(formatNairaFull(holder.balance_ngn)) + "</span>" +
          '<span class="wallets-holder__label">Balance</span>' +
          "</div></article>"
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

  function buildHoldersQuery() {
    const params = new URLSearchParams();
    params.set("page", String(state.page));
    params.set("limit", String(state.limit));
    params.set("sort", state.sort);
    if (state.search) params.set("search", state.search);
    return "/admin/api/wallets/holders?" + params.toString();
  }

  function loadHolders() {
    if (holdersGrid) {
      holdersGrid.innerHTML = '<p class="wallets-holders__loading">Loading wallet holders…</p>';
    }
    return apiRequest(buildHoldersQuery())
      .then(function (data) {
        state.holders = data.items || [];
        state.total = data.total || 0;
        state.totalPages = data.total_pages || 1;
        renderHolders();
        updatePagination();
      })
      .catch(function (err) {
        if (holdersGrid) {
          holdersGrid.innerHTML =
            '<p class="wallets-holders__empty">' + escapeHtml(err.message || "Failed to load holders") + "</p>";
        }
        showToast(err.message || "Could not load wallet holders", true);
      });
  }

  function init() {
    loadStats();
    loadHolders();
    initWithdrawalsQueue();

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(function () {
          state.search = searchInput.value.trim();
          state.page = 1;
          loadHolders();
        }, 300);
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener("change", function () {
        state.sort = sortSelect.value || "balance";
        state.page = 1;
        loadHolders();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (state.page > 1) {
          state.page -= 1;
          loadHolders();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (state.page < state.totalPages) {
          state.page += 1;
          loadHolders();
        }
      });
    }
  }

  const withdrawalState = {
    status: "pending",
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    items: [],
    rejectId: null,
  };

  function formatDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function queueStatusClass(status) {
    return "queue-status queue-status--" + String(status || "pending").replace(/\s+/g, "_");
  }

  function maskAccount(number) {
    const text = String(number || "");
    if (text.length <= 4) return text;
    return "****" + text.slice(-4);
  }

  function renderWithdrawalsTable() {
    const tbody = document.getElementById("withdrawals-table-body");
    if (!tbody) return;
    if (!withdrawalState.items.length) {
      tbody.innerHTML = '<tr class="queue-table__empty"><td colspan="7">No withdrawal requests found.</td></tr>';
      return;
    }
    tbody.innerHTML = withdrawalState.items
      .map(function (item) {
        return (
          "<tr>" +
          '<td><span class="queue-ref">' + escapeHtml(item.reference) + "</span></td>" +
          "<td>" + escapeHtml(item.user_short) + "</td>" +
          '<td class="queue-amount">' + escapeHtml(formatNairaFull(item.net_amount_ngn)) +
          '<div style="font-size:0.75rem;color:var(--dash-muted);font-weight:400;">Fee ' + escapeHtml(formatNairaFull(item.withdrawal_fee_ngn)) + "</div></td>" +
          "<td>" + escapeHtml(item.bank_name) + " · " + escapeHtml(maskAccount(item.account_number)) + " · " + escapeHtml(item.account_name) + "</td>" +
          '<td><span class="' + queueStatusClass(item.status) + '">' + escapeHtml(item.status) + "</span></td>" +
          "<td>" + escapeHtml(formatDate(item.created_at)) + "</td>" +
          '<td><div class="queue-actions">' +
          '<button type="button" class="queue-btn queue-btn--approve" data-withdrawal-approve="' + escapeHtml(item.id) + '"' + (item.can_approve ? "" : " disabled") + ">Approve</button>" +
          '<button type="button" class="queue-btn queue-btn--neutral" data-withdrawal-paid="' + escapeHtml(item.id) + '"' + (item.can_mark_paid ? "" : " disabled") + ">Mark paid</button>" +
          '<button type="button" class="queue-btn queue-btn--reject" data-withdrawal-reject="' + escapeHtml(item.id) + '"' + (item.can_reject ? "" : " disabled") + ">Reject</button>" +
          "</div></td></tr>"
        );
      })
      .join("");
  }

  function updateWithdrawalsPagination() {
    const pagination = document.getElementById("withdrawals-pagination");
    const info = document.getElementById("withdrawals-pagination-info");
    const prevBtn = document.getElementById("withdrawals-prev-btn");
    const nextBtn = document.getElementById("withdrawals-next-btn");
    if (!pagination) return;
    pagination.hidden = withdrawalState.total <= 0;
    if (withdrawalState.total <= 0) return;
    const start = (withdrawalState.page - 1) * withdrawalState.limit + 1;
    const end = Math.min(withdrawalState.page * withdrawalState.limit, withdrawalState.total);
    if (info) info.textContent = "Showing " + start + "–" + end + " of " + formatCount(withdrawalState.total);
    if (prevBtn) prevBtn.disabled = withdrawalState.page <= 1;
    if (nextBtn) nextBtn.disabled = withdrawalState.page >= withdrawalState.totalPages;
  }

  function loadWithdrawals() {
    const tbody = document.getElementById("withdrawals-table-body");
    if (tbody) {
      tbody.innerHTML = '<tr class="queue-table__loading"><td colspan="7">Loading withdrawals…</td></tr>';
    }
    const params = new URLSearchParams();
    params.set("page", String(withdrawalState.page));
    params.set("limit", String(withdrawalState.limit));
    if (withdrawalState.status) params.set("status", withdrawalState.status);
    return apiRequest("/admin/api/payments/withdrawals?" + params.toString())
      .then(function (data) {
        withdrawalState.items = data.items || [];
        withdrawalState.total = data.total || 0;
        withdrawalState.totalPages = data.total_pages || 1;
        renderWithdrawalsTable();
        updateWithdrawalsPagination();
      })
      .catch(function (err) {
        if (tbody) {
          tbody.innerHTML = '<tr class="queue-table__empty"><td colspan="7">' + escapeHtml(err.message) + "</td></tr>";
        }
        showToast(err.message, true);
      });
  }

  function approveWithdrawal(id, button) {
    window.AdminConfirm.show({
      title: "Approve withdrawal",
      message: "Approve this payout? The rider's wallet will be deducted now. Mark it paid after you send the bank transfer.",
      confirmLabel: "Approve",
    }).then(function (confirmed) {
      if (!confirmed) return;
      if (button && window.ButtonLoading) window.ButtonLoading.start(button, { text: "Approving…" });
      return apiRequest("/admin/api/payments/withdrawals/" + encodeURIComponent(id) + "/approve", { method: "POST" })
        .then(function () {
          showToast("Withdrawal approved");
          loadWithdrawals();
        })
        .catch(function (err) {
          if (button && window.ButtonLoading) window.ButtonLoading.stop(button);
          showToast(err.message, true);
        });
    });
  }

  function markWithdrawalPaid(id, button) {
    window.AdminConfirm.show({
      title: "Mark as paid",
      message: "Confirm the bank transfer has been completed?",
      confirmLabel: "Mark paid",
    }).then(function (confirmed) {
      if (!confirmed) return;
      if (button && window.ButtonLoading) window.ButtonLoading.start(button, { text: "Saving…" });
      return apiRequest("/admin/api/payments/withdrawals/" + encodeURIComponent(id) + "/mark-paid", { method: "POST" })
        .then(function () {
          showToast("Withdrawal marked paid");
          loadWithdrawals();
          loadStats();
        })
        .catch(function (err) {
          if (button && window.ButtonLoading) window.ButtonLoading.stop(button);
          showToast(err.message, true);
        });
    });
  }

  function openWithdrawalRejectModal(id) {
    withdrawalState.rejectId = id;
    const modal = document.getElementById("withdrawal-reject-modal");
    const form = document.getElementById("withdrawal-reject-form");
    const error = document.getElementById("withdrawal-reject-error");
    if (form) form.reset();
    if (error) error.hidden = true;
    if (modal) modal.hidden = false;
  }

  function closeWithdrawalRejectModal() {
    withdrawalState.rejectId = null;
    const modal = document.getElementById("withdrawal-reject-modal");
    if (modal) modal.hidden = true;
  }

  function submitWithdrawalReject(event) {
    event.preventDefault();
    const reasonEl = document.getElementById("withdrawal-reject-reason");
    const error = document.getElementById("withdrawal-reject-error");
    const reason = reasonEl ? reasonEl.value.trim() : "";
    if (!withdrawalState.rejectId || reason.length < 2) return;
    var submitBtn = event.target.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn && window.ButtonLoading) window.ButtonLoading.start(submitBtn, { text: "Rejecting…" });
    apiRequest("/admin/api/payments/withdrawals/" + encodeURIComponent(withdrawalState.rejectId) + "/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason }),
    })
      .then(function () {
        closeWithdrawalRejectModal();
        showToast("Withdrawal rejected");
        loadWithdrawals();
      })
      .catch(function (err) {
        if (error) {
          error.textContent = err.message;
          error.hidden = false;
        }
      })
      .finally(function () {
        if (submitBtn && window.ButtonLoading) window.ButtonLoading.stop(submitBtn);
      });
  }

  function initWithdrawalsQueue() {
    const statusFilter = document.getElementById("withdrawals-status-filter");
    const prevBtn = document.getElementById("withdrawals-prev-btn");
    const nextBtn = document.getElementById("withdrawals-next-btn");
    const rejectForm = document.getElementById("withdrawal-reject-form");
    const tbody = document.getElementById("withdrawals-table-body");

    loadWithdrawals();

    if (statusFilter) {
      statusFilter.addEventListener("change", function () {
        withdrawalState.status = statusFilter.value;
        withdrawalState.page = 1;
        loadWithdrawals();
      });
    }
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (withdrawalState.page > 1) {
          withdrawalState.page -= 1;
          loadWithdrawals();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (withdrawalState.page < withdrawalState.totalPages) {
          withdrawalState.page += 1;
          loadWithdrawals();
        }
      });
    }
    if (rejectForm) {
      rejectForm.addEventListener("submit", submitWithdrawalReject);
    }
    document.querySelectorAll("[data-close-withdrawal-reject]").forEach(function (btn) {
      btn.addEventListener("click", closeWithdrawalRejectModal);
    });
    if (tbody) {
      tbody.addEventListener("click", function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const approveId = target.getAttribute("data-withdrawal-approve");
        const paidId = target.getAttribute("data-withdrawal-paid");
        const rejectId = target.getAttribute("data-withdrawal-reject");
        if (approveId && !target.disabled) approveWithdrawal(approveId, target);
        if (paidId && !target.disabled) markWithdrawalPaid(paidId, target);
        if (rejectId && !target.disabled) openWithdrawalRejectModal(rejectId);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
