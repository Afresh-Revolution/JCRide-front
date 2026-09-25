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

  function safeHref(url) {
    const raw = String(url || "").trim();
    return /^https?:\/\//i.test(raw) ? raw : "";
  }

  function isHeicUrl(url) {
    return /\.hei[cf](\?|#|$)/i.test(url);
  }

  function isImageUrl(url) {
    return /\.(jpe?g|png|gif|webp|bmp|hei[cf])(\?|#|$)/i.test(url) || /\/image\/upload\//i.test(url);
  }

  function previewSrc(url) {
    if (!isHeicUrl(url) || !/res\.cloudinary\.com/i.test(url) || /\/upload\/f_jpg\//i.test(url)) return url;
    return url.replace("/upload/", "/upload/f_jpg/");
  }

  function documentLabel(type) {
    const labels = {
      license: "License",
      vehicle_papers: "Vehicle papers",
      nin: "NIN",
      insurance: "Insurance",
      profile_photo: "Profile photo",
      vehicle_photo: "Vehicle photo",
    };
    return labels[type] || String(type || "Document").replace(/_/g, " ");
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function renderUpload(url, label) {
    const href = safeHref(url);
    if (!href) return '<span class="drivers-upload-missing">No file</span>';
    const viewHref = previewSrc(href);
    const preview = isImageUrl(href)
      ? '<img src="' + escapeHtml(viewHref) + '" alt="' + escapeHtml(label) + '">'
      : '<span class="drivers-upload-file">Open file</span>';
    return (
      '<a class="drivers-upload drivers-upload--table" href="' + escapeHtml(viewHref) + '" target="_blank" rel="noopener noreferrer">' +
      preview +
      "<span>View submitted</span></a>"
    );
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
        tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="5">No pending document edits.</td></tr>';
        return;
      }
      tbody.innerHTML = requests
        .map(function (row) {
          return (
            "<tr>" +
            "<td>" + escapeHtml(row.driver_name || "Driver") + "</td>" +
            "<td>" + escapeHtml(documentLabel(row.document_type)) + "</td>" +
            "<td>" + renderUpload(row.proposed_file_url, documentLabel(row.document_type)) + "</td>" +
            "<td>" + escapeHtml(formatDate(row.submitted_at)) + "</td>" +
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
      tbody.innerHTML = '<tr class="drivers-table__empty"><td colspan="5">' + escapeHtml(err.message) + "</td></tr>";
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
