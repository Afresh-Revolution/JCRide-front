(function () {
  "use strict";

  const REPORT_CONFIG = {
    trips: {
      title: "Trips report",
      endpoint: "/admin/api/reports/trips",
      columns: [
        { key: "booking_id", label: "Booking" },
        { key: "status", label: "Status" },
        { key: "city", label: "City" },
        { key: "service_tier", label: "Tier" },
        { key: "vehicle_category", label: "Vehicle" },
        { key: "estimated_fare_ngn", label: "Est. fare", format: "money" },
        { key: "final_fare_ngn", label: "Final fare", format: "money" },
        { key: "requested_at", label: "Requested", format: "date" },
        { key: "completed_at", label: "Completed", format: "date" },
      ],
    },
    drivers: {
      title: "Drivers report",
      endpoint: "/admin/api/reports/drivers",
      columns: [
        { key: "full_name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "status", label: "Status" },
        { key: "service_tier", label: "Tier" },
        { key: "vehicle_category", label: "Vehicle" },
        { key: "rating_avg", label: "Rating" },
        { key: "total_completed_trips", label: "Trips" },
        { key: "total_earnings_ngn", label: "Earnings", format: "money" },
      ],
    },
    users: {
      title: "Users report",
      endpoint: "/admin/api/reports/users",
      columns: [
        { key: "full_name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "role", label: "Role" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Joined", format: "date" },
      ],
    },
  };

  const state = {
    tab: "trips",
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
    items: [],
    lastQuery: "",
  };

  const toast = document.getElementById("reports-toast");
  const tableHead = document.getElementById("reports-table-head");
  const tableBody = document.getElementById("reports-table-body");
  const tableTitle = document.getElementById("reports-table-title");
  const tableSubtitle = document.getElementById("reports-table-subtitle");

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

  function apiRequest(url) {
    return fetch(url).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || data.detail || "Request failed");
        return data;
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function formatCell(value, format) {
    if (value == null || value === "") return "-";
    if (format === "money") {
      return "₦" + Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    if (format === "date") {
      return new Date(value).toLocaleString();
    }
    return String(value);
  }

  function getValue(row, key) {
    return row[key];
  }

  function buildQuery() {
    const params = new URLSearchParams();
    params.set("page", String(state.page));
    params.set("limit", String(state.limit));

    if (state.tab === "trips") {
      const from = document.getElementById("report-date-from");
      const to = document.getElementById("report-date-to");
      const status = document.getElementById("report-trip-status");
      const city = document.getElementById("report-trip-city");
      if (from && from.value) params.set("date_from", from.value + "T00:00:00Z");
      if (to && to.value) params.set("date_to", to.value + "T23:59:59Z");
      if (status && status.value) params.set("status", status.value);
      if (city && city.value.trim()) params.set("city", city.value.trim());
    }

    if (state.tab === "drivers") {
      const status = document.getElementById("report-driver-status");
      const city = document.getElementById("report-driver-city");
      const rating = document.getElementById("report-driver-rating");
      if (status && status.value) params.set("status", status.value);
      if (city && city.value.trim()) params.set("city", city.value.trim());
      if (rating && rating.value) params.set("rating_min", rating.value);
    }

    if (state.tab === "users") {
      const search = document.getElementById("report-user-search");
      const status = document.getElementById("report-user-status");
      const from = document.getElementById("report-user-date-from");
      const to = document.getElementById("report-user-date-to");
      if (search && search.value.trim()) params.set("search", search.value.trim());
      if (status && status.value) params.set("status", status.value);
      if (from && from.value) params.set("date_from", from.value + "T00:00:00Z");
      if (to && to.value) params.set("date_to", to.value + "T23:59:59Z");
    }

    return params.toString();
  }

  function renderTable() {
    const config = REPORT_CONFIG[state.tab];
    if (!config || !tableHead || !tableBody) return;

    tableHead.innerHTML =
      "<tr>" + config.columns.map(function (col) {
        return '<th scope="col">' + escapeHtml(col.label) + "</th>";
      }).join("") + "</tr>";

    if (!state.items.length) {
      tableBody.innerHTML =
        '<tr class="queue-table__empty"><td colspan="' + config.columns.length + '">No rows match your filters.</td></tr>';
      return;
    }

    tableBody.innerHTML = state.items
      .map(function (row) {
        return (
          "<tr>" +
          config.columns
            .map(function (col) {
              return "<td>" + escapeHtml(formatCell(getValue(row, col.key), col.format)) + "</td>";
            })
            .join("") +
          "</tr>"
        );
      })
      .join("");
  }

  function updatePagination() {
    const pagination = document.getElementById("reports-pagination");
    const info = document.getElementById("reports-pagination-info");
    const prevBtn = document.getElementById("reports-prev-btn");
    const nextBtn = document.getElementById("reports-next-btn");
    if (!pagination) return;
    pagination.hidden = state.total <= 0;
    if (state.total <= 0) return;
    const start = (state.page - 1) * state.limit + 1;
    const end = Math.min(state.page * state.limit, state.total);
    if (info) info.textContent = "Showing " + start + "–" + end + " of " + state.total.toLocaleString();
    if (prevBtn) prevBtn.disabled = state.page <= 1;
    if (nextBtn) nextBtn.disabled = state.page >= state.totalPages;
  }

  function updateHeader() {
    const config = REPORT_CONFIG[state.tab];
    if (tableTitle) tableTitle.textContent = config.title;
    if (tableSubtitle) {
      tableSubtitle.textContent = state.total
        ? state.total.toLocaleString() + " total rows"
        : "Run a report to load data";
    }
  }

  function loadReport() {
    const config = REPORT_CONFIG[state.tab];
    if (!config) return Promise.resolve();
    state.lastQuery = buildQuery();
    if (tableBody) {
      tableBody.innerHTML = '<tr class="queue-table__loading"><td colspan="8">Loading report…</td></tr>';
    }
    return apiRequest(config.endpoint + "?" + state.lastQuery)
      .then(function (data) {
        state.items = data.items || [];
        state.total = data.total || 0;
        state.totalPages = data.total_pages || 1;
        updateHeader();
        renderTable();
        updatePagination();
      })
      .catch(function (err) {
        if (tableBody) {
          tableBody.innerHTML = '<tr class="queue-table__empty"><td colspan="8">' + escapeHtml(err.message) + "</td></tr>";
        }
        showToast(err.message, true);
      });
  }

  function exportCsv() {
    const config = REPORT_CONFIG[state.tab];
    if (!config || !state.items.length) {
      showToast("Run a report with results before exporting.", true);
      return;
    }
    const header = config.columns.map(function (col) {
      return '"' + col.label.replace(/"/g, '""') + '"';
    });
    const rows = state.items.map(function (row) {
      return config.columns
        .map(function (col) {
          const raw = formatCell(getValue(row, col.key), col.format);
          return '"' + String(raw).replace(/"/g, '""') + '"';
        })
        .join(",");
    });
    const csv = [header.join(","), rows.join("\n")].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "josride-" + state.tab + "-report-page" + state.page + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("CSV exported");
  }

  function exportAllCsv() {
    const config = REPORT_CONFIG[state.tab];
    if (!config) return;
    const baseQuery = buildQuery().replace(/page=\d+/, "page=1");
    const params = new URLSearchParams(baseQuery);
    params.set("limit", "200");
    params.set("page", "1");

    function fetchPage(page) {
      params.set("page", String(page));
      return apiRequest(config.endpoint + "?" + params.toString()).then(function (data) {
        return data;
      });
    }

    showToast("Preparing full export…");
    fetchPage(1)
      .then(function (first) {
        const allItems = (first.items || []).slice();
        const totalPages = first.total_pages || 1;
        const chain = [];
        for (let page = 2; page <= totalPages && page <= 20; page += 1) {
          chain.push(page);
        }
        return chain.reduce(function (promise, page) {
          return promise.then(function () {
            return fetchPage(page).then(function (data) {
              allItems.push.apply(allItems, data.items || []);
            });
          });
        }, Promise.resolve()).then(function () {
          state.items = allItems;
          exportCsv();
        });
      })
      .catch(function (err) {
        showToast(err.message, true);
      });
  }

  function switchTab(tab) {
    state.tab = tab;
    state.page = 1;
    state.items = [];
    state.total = 0;
    document.querySelectorAll("[data-report-tab]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-report-tab") === tab);
    });
    document.getElementById("reports-filters-trips").hidden = tab !== "trips";
    document.getElementById("reports-filters-drivers").hidden = tab !== "drivers";
    document.getElementById("reports-filters-users").hidden = tab !== "users";
    updateHeader();
    renderTable();
    updatePagination();
  }

  function clearFilters() {
    document.querySelectorAll("#reports-filters input, #reports-filters select").forEach(function (el) {
      if (el.tagName === "SELECT") el.selectedIndex = 0;
      else el.value = "";
    });
    state.page = 1;
    state.items = [];
    state.total = 0;
    updateHeader();
    if (tableBody) {
      tableBody.innerHTML = '<tr class="queue-table__loading"><td colspan="8">Run a report to see results.</td></tr>';
    }
    updatePagination();
  }

  function init() {
    document.querySelectorAll("[data-report-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchTab(btn.getAttribute("data-report-tab") || "trips");
      });
    });

    const runBtn = document.getElementById("reports-run-btn");
    const clearBtn = document.getElementById("reports-clear-btn");
    const exportBtn = document.getElementById("reports-export-btn");
    const prevBtn = document.getElementById("reports-prev-btn");
    const nextBtn = document.getElementById("reports-next-btn");

    if (runBtn) {
      runBtn.addEventListener("click", function () {
        state.page = 1;
        loadReport();
      });
    }
    if (clearBtn) clearBtn.addEventListener("click", clearFilters);
    if (exportBtn) exportBtn.addEventListener("click", exportAllCsv);
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (state.page > 1) {
          state.page -= 1;
          loadReport();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (state.page < state.totalPages) {
          state.page += 1;
          loadReport();
        }
      });
    }

    switchTab("trips");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
