(function () {
  "use strict";

  const state = {
    search: "",
    status: "all",
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    users: [],
    activeMenuUser: null,
    searchTimer: null,
  };

  const tbody = document.getElementById("users-table-body");
  const searchInput = document.getElementById("users-search-input");
  const filterToggle = document.getElementById("users-filter-toggle");
  const filterMenu = document.getElementById("users-filter-menu");
  const filterLabel = document.getElementById("users-filter-label");
  const inviteBtn = document.getElementById("users-invite-btn");
  const inviteModal = document.getElementById("invite-modal");
  const inviteForm = document.getElementById("invite-admin-form");
  const inviteSuccess = document.getElementById("invite-success");
  const inviteFormError = document.getElementById("invite-form-error");
  const userDetailModal = document.getElementById("user-detail-modal");
  const userDetailBody = document.getElementById("user-detail-body");
  const actionsMenu = document.getElementById("users-actions-menu");
  const pagination = document.getElementById("users-pagination");
  const paginationInfo = document.getElementById("users-pagination-info");
  const prevBtn = document.getElementById("users-prev-btn");
  const nextBtn = document.getElementById("users-next-btn");
  const toast = document.getElementById("users-toast");

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
          const err = new Error(data.message || data.detail || "Request failed");
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function statusClass(status) {
    if (status === "verified") {
      return "users-status users-status--approved";
    }
    return "users-status users-status--" + status;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function renderTable() {
    if (!tbody) return;

    if (!state.users.length) {
      const hasFilters = state.search || (state.status && state.status !== "all");
      const emptyMessage = hasFilters
        ? "No users match your search."
        : "No rider accounts yet. Users appear here after signup or JosCity login.";
      tbody.innerHTML =
        '<tr class="users-table__empty"><td colspan="7">' + escapeHtml(emptyMessage) + "</td></tr>";
      return;
    }

    tbody.innerHTML = state.users
      .map(function (user) {
        return (
          "<tr data-user-id=\"" + escapeHtml(user.id) + "\">" +
          "<td><div class=\"users-cell-user\">" +
          "<span class=\"users-avatar\" aria-hidden=\"true\">" + escapeHtml(user.initials) + "</span>" +
          "<div><span class=\"users-cell-user__name\">" + escapeHtml(user.full_name) + "</span>" +
          "<span class=\"users-cell-user__id\">ID - " + escapeHtml(user.public_id) + "</span></div></div></td>" +
          "<td><div class=\"users-cell-contact\">" +
          "<span class=\"users-cell-contact__email\">" + escapeHtml(user.email) + "</span>" +
          "<span class=\"users-cell-contact__phone\">" + escapeHtml(user.phone || "-") + "</span></div></td>" +
          "<td class=\"users-cell-trips\">" + escapeHtml(user.trip_count) + "</td>" +
          "<td class=\"users-cell-spend\">" + escapeHtml(user.lifetime_spend_display) + "</td>" +
          "<td class=\"users-cell-joined\">" + escapeHtml(user.joined_display) + "</td>" +
          "<td><span class=\"" + statusClass(user.status) + "\">" + escapeHtml(user.status_label) + "</span></td>" +
          "<td><button type=\"button\" class=\"users-actions-btn\" data-actions=\"" + escapeHtml(user.id) + "\" aria-label=\"User actions\">" +
          "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><circle cx=\"12\" cy=\"5\" r=\"1.5\"/><circle cx=\"12\" cy=\"12\" r=\"1.5\"/><circle cx=\"12\" cy=\"19\" r=\"1.5\"/></svg>" +
          "</button></td></tr>"
        );
      })
      .join("");
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

  function loadUsers() {
    const params = new URLSearchParams({
      page: String(state.page),
      limit: String(state.limit),
    });
    if (state.search) params.set("search", state.search);
    if (state.status && state.status !== "all") params.set("status", state.status);

    return apiRequest("/admin/api/users?" + params.toString())
      .then(function (data) {
        state.users = data.users || [];
        state.total = data.total || 0;
        state.totalPages = data.total_pages || 1;
        renderTable();
        updatePagination();
      })
      .catch(function (err) {
        if (tbody) {
          tbody.innerHTML =
            '<tr class="users-table__empty"><td colspan="7">' + escapeHtml(err.message) + "</td></tr>";
        }
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
    document.querySelectorAll(".users-modal-overlay").forEach(function (modal) {
      closeModal(modal);
    });
    closeActionsMenu();
  }

  function resetInviteModal() {
    if (inviteForm) {
      inviteForm.reset();
      inviteForm.hidden = false;
    }
    if (inviteSuccess) inviteSuccess.hidden = true;
    if (inviteFormError) inviteFormError.hidden = true;
  }

  function renderUserDetail(user) {
    const synced = user.synced_at
      ? new Date(user.synced_at).toLocaleString()
      : "Not synced from JosCity";

    userDetailBody.innerHTML =
      "<div class=\"user-detail-header\">" +
      "<span class=\"users-avatar\">" + escapeHtml(user.initials) + "</span>" +
      "<div><p class=\"user-detail-header__name\">" + escapeHtml(user.full_name) + "</p>" +
      "<p class=\"user-detail-header__meta\">" + escapeHtml(user.public_id) + " · " + escapeHtml(user.status_label) + "</p></div></div>" +
      "<dl class=\"user-detail-grid\">" +
      "<div><dt>Email</dt><dd>" + escapeHtml(user.email) + "</dd></div>" +
      "<div><dt>Phone</dt><dd>" + escapeHtml(user.phone || "-") + "</dd></div>" +
      "<div><dt>Total trips</dt><dd>" + escapeHtml(user.trip_count) + "</dd></div>" +
      "<div><dt>Lifetime spend</dt><dd>" + escapeHtml(user.lifetime_spend_display) + "</dd></div>" +
      "<div><dt>Joined</dt><dd>" + escapeHtml(user.joined_display) + "</dd></div>" +
      "<div><dt>JosCity ID</dt><dd>" + escapeHtml(user.joscity_user_id || "-") + "</dd></div>" +
      "<div><dt>Last synced</dt><dd>" + escapeHtml(synced) + "</dd></div>" +
      "<div><dt>Account status</dt><dd><span class=\"" + statusClass(user.status) + "\">" + escapeHtml(user.status_label) + "</span></dd></div>" +
      "</dl>";
  }

  function viewUser(userId) {
    apiRequest("/admin/api/users/" + encodeURIComponent(userId))
      .then(function (user) {
        renderUserDetail(user);
        openModal(userDetailModal);
      })
      .catch(function (err) {
        showToast(err.message, true);
      });
  }

  function updateUserStatus(userId, status, message, user) {
    return apiRequest("/admin/api/users/" + encodeURIComponent(userId) + "/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status }),
    })
      .then(function (updatedUser) {
        const idx = state.users.findIndex(function (u) {
          return String(u.id) === String(userId);
        });
        if (idx !== -1 && updatedUser) {
          state.users[idx] = updatedUser;
          renderTable();
        } else {
          return loadUsers();
        }
        let toastMessage = message;
        if (status === "verified" && user && user.email) {
          toastMessage += " - approval email sent to " + user.email;
        }
        showToast(toastMessage);
      })
      .catch(function (err) {
        showToast(err.message, true);
      });
  }

  function deleteUser(userId, userName) {
    window.AdminConfirm.show({
      title: "Delete user",
      message: "Delete " + userName + "? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    }).then(function (confirmed) {
      if (!confirmed) return;
      return apiRequest("/admin/api/users/" + encodeURIComponent(userId), {
        method: "DELETE",
      })
        .then(function () {
          showToast(userName + " deleted");
          return loadUsers();
        })
        .catch(function (err) {
          showToast(err.message, true);
        });
    });
  }

  function buildActionsMenu(user) {
    const items = [];

    if (user.status !== "verified") {
      items.push({
        label: "Approve",
        action: "approve",
        icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"><path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"/><polyline points=\"22 4 12 14.01 9 11.01\"/></svg>",
      });
    }

    if (user.status !== "suspended") {
      items.push({
        label: "Suspend",
        action: "suspend",
        icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"4.93\" y1=\"4.93\" x2=\"19.07\" y2=\"19.07\"/></svg>",
      });
    }

    items.push({
      label: "Delete user",
      action: "delete",
      danger: true,
      icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"><polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6\"/><path d=\"M10 11v6M14 11v6\"/><path d=\"M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2\"/></svg>",
    });

    return items
      .map(function (item) {
        return (
          "<button type=\"button\" data-action=\"" + item.action + "\"" +
          (item.danger ? " class=\"is-danger\"" : "") + ">" +
          item.icon + escapeHtml(item.label) + "</button>"
        );
      })
      .join("");
  }

  function openActionsMenu(button, user) {
    state.activeMenuUser = user;
    actionsMenu.innerHTML = buildActionsMenu(user);
    actionsMenu.hidden = false;

    const rect = button.getBoundingClientRect();
    const menuWidth = 220;
    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    let top = rect.bottom + 6;
    actionsMenu.style.left = left + "px";
    actionsMenu.style.top = top + "px";
  }

  function closeActionsMenu() {
    if (!actionsMenu) return;
    actionsMenu.hidden = true;
    state.activeMenuUser = null;
  }

  function handleMenuAction(action, user) {
    closeActionsMenu();
    if (action === "approve") {
      window.AdminConfirm.show({
        title: "Approve user",
        message: "Approve " + user.full_name + "? They will be able to request rides.",
        confirmLabel: "Approve",
      }).then(function (confirmed) {
        if (confirmed) {
          updateUserStatus(user.id, "verified", user.full_name + " approved", user);
        }
      });
      return;
    }
    if (action === "suspend") {
      window.AdminConfirm.show({
        title: "Suspend user",
        message: "Suspend " + user.full_name + "? They will not be able to request rides until reinstated.",
        confirmLabel: "Suspend",
        variant: "danger",
      }).then(function (confirmed) {
        if (confirmed) {
          updateUserStatus(user.id, "suspended", user.full_name + " suspended");
        }
      });
      return;
    }
    if (action === "delete") {
      deleteUser(user.id, user.full_name);
    }
  }

  function bindEvents() {
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(function () {
          state.search = searchInput.value.trim();
          state.page = 1;
          loadUsers();
        }, 300);
      });
    }

    if (filterToggle && filterMenu) {
      filterToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        const open = filterMenu.hidden;
        filterMenu.hidden = !open;
        filterToggle.setAttribute("aria-expanded", String(open));
      });

      filterMenu.querySelectorAll("li").forEach(function (item) {
        item.addEventListener("click", function () {
          filterMenu.querySelectorAll("li").forEach(function (li) {
            li.classList.remove("is-selected");
          });
          item.classList.add("is-selected");
          state.status = item.dataset.value || "all";
          filterLabel.textContent = item.textContent.trim();
          filterMenu.hidden = true;
          filterToggle.setAttribute("aria-expanded", "false");
          state.page = 1;
          loadUsers();
        });
      });
    }

    if (inviteBtn) {
      inviteBtn.addEventListener("click", function () {
        resetInviteModal();
        openModal(inviteModal);
      });
    }

    if (inviteForm) {
      inviteForm.addEventListener("submit", function (e) {
        e.preventDefault();
        inviteFormError.hidden = true;

        const name = document.getElementById("invite-name").value.trim();
        const email = document.getElementById("invite-email").value.trim();
        const password = document.getElementById("invite-password").value;
        const confirm = document.getElementById("invite-password-confirm").value;

        if (password !== confirm) {
          inviteFormError.textContent = "Passwords do not match.";
          inviteFormError.hidden = false;
          return;
        }

        apiRequest("/admin/api/users/invite-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name, email: email, password: password }),
        })
          .then(function (data) {
            inviteForm.hidden = true;
            inviteSuccess.hidden = false;
            const successMessage = document.getElementById("invite-success-message");
            if (successMessage) {
              successMessage.textContent = data.message || "Admin account created.";
            }
            showToast(data.message || "Admin invited");
            loadUsers();
          })
          .catch(function (err) {
            inviteFormError.textContent = err.message;
            inviteFormError.hidden = false;
          });
      });
    }

    if (tbody) {
      tbody.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-actions]");
        if (!btn) return;
        e.stopPropagation();
        const userId = btn.getAttribute("data-actions");
        const user = state.users.find(function (u) { return u.id === userId; });
        if (user) openActionsMenu(btn, user);
      });
    }

    if (actionsMenu) {
      actionsMenu.addEventListener("click", function (e) {
        e.stopPropagation();
        const btn = e.target.closest("[data-action]");
        if (!btn || !state.activeMenuUser) return;
        handleMenuAction(btn.getAttribute("data-action"), state.activeMenuUser);
      });
    }

    document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeAllModals();
        resetInviteModal();
      });
    });

    document.querySelectorAll(".users-modal-overlay").forEach(function (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          closeAllModals();
          resetInviteModal();
        }
      });
    });

    document.addEventListener("click", function () {
      if (filterMenu && !filterMenu.hidden) {
        filterMenu.hidden = true;
        if (filterToggle) filterToggle.setAttribute("aria-expanded", "false");
      }
      closeActionsMenu();
    });

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (state.page > 1) {
          state.page -= 1;
          loadUsers();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (state.page < state.totalPages) {
          state.page += 1;
          loadUsers();
        }
      });
    }
  }

  function init() {
    bindEvents();
    loadUsers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
