(function () {
  "use strict";

  var page = document.querySelector("[data-notifications-page]");
  if (!page) return;

  var listEl = document.getElementById("notifications-list");
  var subEl = document.getElementById("notifications-inbox-sub");
  var markAllBtn = document.getElementById("notifications-mark-all");
  var clearAllBtn = document.getElementById("notifications-clear-all");
  var clearForm = document.getElementById("notifications-clear-form");
  var selectBtn = document.getElementById("notifications-select-btn");
  var defaultActions = document.getElementById("notifications-default-actions");
  var selectActions = document.getElementById("notifications-select-actions");
  var selectionCountEl = document.getElementById("notifications-selection-count");
  var shareSelectedBtn = document.getElementById("notifications-share-selected");
  var deleteSelectedBtn = document.getElementById("notifications-delete-selected");
  var cancelSelectBtn = document.getElementById("notifications-cancel-select");
  var selecting = false;

  function confirmAction(options) {
    if (window.DriverConfirm && typeof DriverConfirm.show === "function") {
      return DriverConfirm.show(options);
    }
    return Promise.resolve(
      window.confirm((options.title || "Confirm") + "\n\n" + (options.message || ""))
    );
  }

  function showNotice(message) {
    return confirmAction({
      title: "Notice",
      message: message || "",
      confirmLabel: "OK",
      cancelLabel: "Close",
      variant: "primary",
    });
  }

  function items() {
    return listEl ? Array.prototype.slice.call(listEl.querySelectorAll(".notifications-item")) : [];
  }

  function unreadCount() {
    return items().filter(function (item) {
      return item.getAttribute("data-unread") === "true";
    }).length;
  }

  function selectedItems() {
    return items().filter(function (item) {
      var checkbox = item.querySelector(".notifications-item__checkbox");
      return checkbox && checkbox.checked;
    });
  }

  function updateInboxMeta() {
    var count = unreadCount();
    var total = items().length;
    if (subEl) {
      subEl.textContent = count + " unread";
    }
    if (markAllBtn) {
      markAllBtn.disabled = count === 0;
    }
    if (clearAllBtn) {
      clearAllBtn.disabled = total === 0;
    }
    if (selectBtn) {
      selectBtn.disabled = total === 0;
    }
    ensureEmptyState();
  }

  function ensureEmptyState() {
    if (!listEl) return;
    var empty = document.getElementById("notifications-empty");
    if (items().length === 0) {
      if (!empty) {
        empty = document.createElement("li");
        empty.className = "notifications-empty";
        empty.id = "notifications-empty";
        empty.innerHTML = "<p>No notifications yet.</p>";
        listEl.appendChild(empty);
      }
      exitSelectMode();
    } else if (empty) {
      empty.remove();
    }
  }

  function updateSelectionUi() {
    var selected = selectedItems();
    var count = selected.length;
    if (selectionCountEl) {
      selectionCountEl.textContent = count + " selected";
    }
    if (shareSelectedBtn) {
      shareSelectedBtn.disabled = count === 0;
    }
    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = count === 0;
    }
  }

  function setSelectMode(on) {
    selecting = !!on;
    page.classList.toggle("is-selecting", selecting);
    if (defaultActions) {
      defaultActions.classList.toggle("is-hidden", selecting);
      defaultActions.hidden = selecting;
    }
    if (selectActions) {
      selectActions.classList.toggle("is-hidden", !selecting);
      selectActions.hidden = !selecting;
    }
    items().forEach(function (item) {
      var checkbox = item.querySelector(".notifications-item__checkbox");
      if (checkbox && !selecting) {
        checkbox.checked = false;
      }
    });
    updateSelectionUi();
  }

  function exitSelectMode() {
    setSelectMode(false);
  }

  function markItemRead(item) {
    if (!item || item.getAttribute("data-unread") !== "true") return;
    if (!window.DriverApi || !DriverApi.markNotificationRead) return;

    var id = item.getAttribute("data-id");
    DriverApi.markNotificationRead(id)
      .then(function () {
        item.classList.remove("is-unread");
        item.setAttribute("data-unread", "false");
        var dot = item.querySelector(".notifications-item__dot");
        if (dot) dot.remove();
        updateInboxMeta();
      })
      .catch(function () {});
  }

  function shareTextForItems(selected) {
    return selected
      .map(function (item) {
        var title = item.getAttribute("data-title") || "Notification";
        var body = item.getAttribute("data-body") || "";
        return title + (body ? "\n" + body : "");
      })
      .join("\n\n");
  }

  function shareItems(selected) {
    var text = shareTextForItems(selected);
    if (!text) return Promise.resolve();

    if (navigator.share) {
      return navigator.share({
        title: selected.length === 1 ? selected[0].getAttribute("data-title") || "JC-Ride" : "JC-Ride notifications",
        text: text,
      });
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return showNotice("Notification details copied to clipboard.");
      });
    }

    return showNotice(text);
  }

  function removeItems(selected) {
    selected.forEach(function (item) {
      item.remove();
    });
    updateInboxMeta();
    updateSelectionUi();
    if (items().length === 0) {
      exitSelectMode();
    }
  }

  if (listEl) {
    listEl.addEventListener("click", function (event) {
      if (selecting) return;
      if (event.target.closest(".notifications-item__check")) return;
      var item = event.target.closest(".notifications-item");
      if (item) markItemRead(item);
    });

    listEl.addEventListener("change", function (event) {
      if (!event.target.classList.contains("notifications-item__checkbox")) return;
      updateSelectionUi();
    });
  }

  if (selectBtn) {
    selectBtn.addEventListener("click", function () {
      setSelectMode(true);
    });
  }

  if (cancelSelectBtn) {
    cancelSelectBtn.addEventListener("click", exitSelectMode);
  }

  if (shareSelectedBtn) {
    shareSelectedBtn.addEventListener("click", function () {
      var selected = selectedItems();
      if (!selected.length) return;
      shareItems(selected).catch(function () {});
    });
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", function () {
      var selected = selectedItems();
      if (!selected.length) return;
      var count = selected.length;
      confirmAction({
        title: "Delete notifications",
        message:
          "Delete " +
          count +
          " notification" +
          (count === 1 ? "" : "s") +
          "? This permanently removes them and cannot be undone.",
        confirmLabel: "Delete",
        cancelLabel: "Keep",
        variant: "danger",
      }).then(function (ok) {
        if (!ok) return;
        var ids = selected
          .map(function (item) {
            return item.getAttribute("data-id");
          })
          .filter(Boolean);
        if (!ids.length) return;
        if (!window.DriverApi || !DriverApi.deleteNotifications) {
          showNotice("Delete is unavailable right now. Refresh and try again.");
          return;
        }
        deleteSelectedBtn.disabled = true;
        // Remove from the list immediately, then persist to the API.
        removeItems(selected);
        DriverApi.deleteNotifications(ids)
          .then(function () {
            exitSelectMode();
          })
          .catch(function (err) {
            showNotice(
              (err && err.message) || "Failed to delete notifications. Refreshing inbox…"
            ).then(function () {
              window.location.reload();
            });
          });
      });
    });
  }

  if (clearForm) {
    var clearSubmitting = false;
    clearForm.addEventListener("submit", function (event) {
      if (clearSubmitting) return;
      event.preventDefault();
      if (!items().length) return;

      confirmAction({
        title: "Clear all notifications",
        message: "Clear all notifications? This permanently removes them from your inbox.",
        confirmLabel: "Clear all",
        cancelLabel: "Keep",
        variant: "danger",
      }).then(function (ok) {
        if (!ok) return;
        clearSubmitting = true;
        HTMLFormElement.prototype.submit.call(clearForm);
      });
    });
  }

  document.querySelectorAll(".notification-pref-toggle").forEach(function (input) {
    input.addEventListener("change", function () {
      var form = input.closest("form");
      if (!form) return;

      var body = new FormData(form);
      if (!input.checked) {
        body.delete("enabled");
      }

      input.disabled = true;
      fetch(form.action, {
        method: "POST",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json",
        },
        body: body,
        credentials: "same-origin",
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok || data.ok === false) {
              throw new Error(data.error || data.message || "Failed to update setting");
            }
            return data;
          });
        })
        .catch(function () {
          input.checked = !input.checked;
        })
        .finally(function () {
          input.disabled = false;
        });
    });
  });

  updateInboxMeta();
})();
