(function () {
  "use strict";

  const tbody = document.getElementById("service-fees-body");
  const tabs = document.querySelectorAll(".drivers-filter-tab");
  let status = "open";

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function apiRequest(url) {
    return fetch(url).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || data.detail || "Request failed");
        return data;
      });
    });
  }

  function money(amount) {
    return "₦" + Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function when(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function statusLabel(value) {
    if (value === "bank_due") return "Bank transfer due";
    if (value === "overdue") return "Suspended";
    if (value === "paid") return "Paid";
    if (value === "pending") return "Due month end";
    return value || "Open";
  }

  function render(fees) {
    if (!tbody) return;
    if (!fees.length) {
      tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="6">No service fees in this list.</td></tr>';
      return;
    }
    tbody.innerHTML = fees.map(function (fee) {
      const contact = [fee.driver_phone, fee.driver_email].filter(Boolean).join(" · ");
      const due = fee.status === "bank_due" || fee.status === "overdue"
        ? "Pay by " + when(fee.pay_by)
        : when(fee.due_at);
      return (
        "<tr>" +
        "<td data-label=\"Driver\"><div class=\"drivers-cell-driver__name\">" + escapeHtml(fee.driver_name) + "</div>" +
        "<div class=\"drivers-cell-driver__id\">" + escapeHtml(contact || "No contact") + "</div></td>" +
        "<td data-label=\"Trip\">" + escapeHtml(fee.booking_id) + "</td>" +
        "<td data-label=\"Fare\">" + escapeHtml(money(fee.fare_ngn)) + "</td>" +
        "<td data-label=\"Fee\">" + escapeHtml(money(fee.amount_ngn)) + " · " + escapeHtml(Number(fee.percent || 0).toFixed(0)) + "%</td>" +
        "<td data-label=\"Due\">" + escapeHtml(due) + "</td>" +
        "<td data-label=\"Status\"><span class=\"drivers-status\">" + escapeHtml(statusLabel(fee.status)) + "</span></td>" +
        "</tr>"
      );
    }).join("");
  }

  function load() {
    if (tbody) {
      tbody.innerHTML = '<tr class="drivers-table__loading"><td colspan="6">Loading service fees…</td></tr>';
    }
    const query = status === "open" ? "" : "?status=" + encodeURIComponent(status);
    apiRequest("/admin/api/service-fees" + query)
      .then(function (data) {
        render(data.fees || []);
      })
      .catch(function (err) {
        if (tbody) {
          tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="6">' + escapeHtml(err.message) + "</td></tr>";
        }
      });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      status = tab.dataset.status || "open";
      tabs.forEach(function (item) {
        item.classList.toggle("is-active", item === tab);
      });
      load();
    });
  });

  load();
})();
