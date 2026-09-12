(function () {
  "use strict";

  const tbody = document.getElementById("document-edits-table-body");
  const kpi = document.getElementById("kpi-document-edits") || document.getElementById("kpi-expiring");
  const toast = document.getElementById("drivers-toast");
  const pageRoot = document.querySelector(".drivers-page");
  const vehicleCategory = pageRoot && pageRoot.dataset.vehicleCategory ? pageRoot.dataset.vehicleCategory : "car";
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

  function load() {
    const params = new URLSearchParams({ status: "pending_review" });
    if (vehicleCategory) params.set("vehicle_category", vehicleCategory);
    return apiRequest("/admin/api/document-edits?" + params.toString()).then(function (data) {
      const requests = data.requests || [];
      if (kpi) kpi.textContent = String(data.total || requests.length || 0);
      if (!requests.length) {
        tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="4">No pending document edits.</td></tr>';
        return;
      }
      tbody.innerHTML = requests
        .map(function (row) {
          return (
            "<tr>" +
            "<td>" + escapeHtml(row.driver_name || "Driver") + "</td>" +
            "<td>" + escapeHtml(row.document_type) + "</td>" +
            "<td>" + escapeHtml(row.submitted_at || "") + "</td>" +
            "<td><button type=\"button\" class=\"drivers-btn drivers-btn--primary\" data-approve=\"" +
            escapeHtml(row.id) +
            "\">Approve</button> <button type=\"button\" class=\"drivers-btn drivers-btn--danger\" data-reject=\"" +
            escapeHtml(row.id) +
            "\">Reject</button></td>" +
            "</tr>"
          );
        })
        .join("");
    }).catch(function (err) {
      tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="4">' + escapeHtml(err.message) + "</td></tr>";
    });
  }

  tbody.addEventListener("click", function (event) {
    const approveId = event.target.getAttribute("data-approve");
    const rejectId = event.target.getAttribute("data-reject");
    if (approveId) {
      apiRequest("/admin/api/document-edits/" + encodeURIComponent(approveId) + "/approve", { method: "POST" })
        .then(function () {
          showToast("Document update approved");
          load();
        })
        .catch(function (err) {
          showToast(err.message, true);
        });
    }
    if (rejectId) {
      apiRequest("/admin/api/document-edits/" + encodeURIComponent(rejectId) + "/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected by admin" }),
      })
        .then(function () {
          showToast("Document update rejected");
          load();
        })
        .catch(function (err) {
          showToast(err.message, true);
        });
    }
  });

  const scrollBtn = document.getElementById("document-edits-scroll");
  if (scrollBtn) {
    scrollBtn.addEventListener("click", function () {
      document.getElementById("document-edits-section")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  load();
})();
