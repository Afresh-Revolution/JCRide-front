(function () {
  "use strict";

  var listEl = document.getElementById("notifications-list");
  var subEl = document.getElementById("notifications-inbox-sub");
  var markAllBtn = document.getElementById("notifications-mark-all");

  function apiRequest(url, options) {
    return fetch(url, options).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || data.detail || "Request failed");
        return data;
      });
    });
  }

  function unreadCount() {
    if (!listEl) return 0;
    return listEl.querySelectorAll(".rider-notification-item.is-unread").length;
  }

  function updateInboxMeta() {
    var count = unreadCount();
    if (subEl) {
      subEl.textContent = count + " unread · last 7 days";
    }
    if (markAllBtn) {
      markAllBtn.disabled = count === 0;
    }
  }

  function markItemRead(item) {
    if (!item || item.getAttribute("data-unread") !== "true") return;

    var id = item.getAttribute("data-id");
    apiRequest("/user/api/notifications/" + encodeURIComponent(id) + "/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then(function () {
        item.classList.remove("is-unread");
        item.setAttribute("data-unread", "false");
        var dot = item.querySelector(".rider-notification-item__dot");
        if (dot) dot.remove();
        updateInboxMeta();
      })
      .catch(function () {});
  }

  if (listEl) {
    listEl.addEventListener("click", function (event) {
      var item = event.target.closest(".rider-notification-item");
      if (!item) return;
      markItemRead(item);
      var href = item.getAttribute("data-href");
      if (href) {
        window.location.href = href;
      }
    });
  }

  if (markAllBtn) {
    markAllBtn.addEventListener("click", function () {
      apiRequest("/user/api/notifications/read-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
        .then(function () {
          listEl.querySelectorAll(".rider-notification-item.is-unread").forEach(function (item) {
            item.classList.remove("is-unread");
            item.setAttribute("data-unread", "false");
            var dot = item.querySelector(".rider-notification-item__dot");
            if (dot) dot.remove();
          });
          updateInboxMeta();
        })
        .catch(function () {});
    });
  }

  document.querySelectorAll(".notification-pref-toggle").forEach(function (input) {
    input.addEventListener("change", function () {
      apiRequest("/user/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group: input.getAttribute("data-group"),
          id: input.getAttribute("data-id"),
          enabled: input.checked,
        }),
      }).catch(function () {
        input.checked = !input.checked;
      });
    });
  });
})();
