(function (global) {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTime(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (err) {
      return "";
    }
  }

  function normalizeRole(role) {
    return String(role || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function messageId(msg) {
    if (!msg || typeof msg !== "object") return "";
    return String(msg.id || msg.message_id || "");
  }

  function isMine(msg, viewerRole) {
    var role = normalizeRole(msg && msg.sender_role);
    var viewer = normalizeRole(viewerRole);
    if (!role) return false;
    if (role === viewer) return true;
    if (viewer === "customer" && (role === "rider" || role === "user")) return true;
    if (viewer === "driver" && role === "captain") return true;
    return false;
  }

  function displayName(msg, viewerRole, names) {
    names = names || {};
    var explicit =
      (msg && (msg.sender_name || msg.sender_full_name || msg.full_name || msg.name)) || "";
    if (explicit) return String(explicit).trim();

    var role = normalizeRole(msg && msg.sender_role);
    var mine = isMine(msg, viewerRole);

    if (mine) {
      return names.self || names.me || "You";
    }
    if (role === "driver") {
      return names.driver || names.peer || "Driver";
    }
    if (role === "customer" || role === "rider" || role === "user") {
      return names.rider || names.customer || names.peer || "Rider";
    }
    if (role === "admin") {
      return names.admin || "Support";
    }
    return names.peer || "User";
  }

  function messageHtml(msg, viewerRole, names) {
    var mine = isMine(msg, viewerRole);
    var name = displayName(msg, viewerRole, names);
    var time = formatTime(msg && msg.created_at);
    var id = messageId(msg);
    return (
      '<li class="ride-chat-item' +
      (mine ? " ride-chat-item--mine" : " ride-chat-item--theirs") +
      '"' +
      (id ? ' data-message-id="' + escapeHtml(id) + '"' : "") +
      ">" +
      '<span class="ride-chat-item__meta">' +
      escapeHtml(name) +
      (time ? " · " + escapeHtml(time) : "") +
      "</span>" +
      '<p class="ride-chat-item__text">' +
      escapeHtml((msg && msg.message) || "") +
      "</p></li>"
    );
  }

  function hasMessage(listEl, msg) {
    var id = messageId(msg);
    if (!listEl || !id) return false;
    var items = listEl.querySelectorAll("[data-message-id]");
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].getAttribute("data-message-id") === id) return true;
    }
    return false;
  }

  function renderMessages(listEl, messages, viewerRole, names) {
    if (!listEl) return;
    if (!messages || !messages.length) {
      var emptyCopy =
        normalizeRole(viewerRole) === "driver"
          ? "No messages yet. Say hello to your rider."
          : "No messages yet. Say hello to your driver.";
      listEl.innerHTML = '<li class="ride-chat-empty">' + emptyCopy + "</li>";
      return;
    }

    // API returns newest-first — show oldest at top for chat UX.
    var ordered = messages.slice().sort(function (a, b) {
      var at = a && a.created_at ? new Date(a.created_at).getTime() : 0;
      var bt = b && b.created_at ? new Date(b.created_at).getTime() : 0;
      return at - bt;
    });

    var seen = {};
    listEl.innerHTML = ordered
      .filter(function (msg) {
        var id = messageId(msg);
        if (!id) return true;
        if (seen[id]) return false;
        seen[id] = true;
        return true;
      })
      .map(function (msg) {
        return messageHtml(msg, viewerRole, names);
      })
      .join("");
    listEl.scrollTop = listEl.scrollHeight;
  }

  function appendMessage(listEl, msg, viewerRole, names) {
    if (!listEl || !msg) return false;
    if (hasMessage(listEl, msg)) return false;

    var empty = listEl.querySelector(".ride-chat-empty");
    if (empty) empty.remove();

    var wrap = document.createElement("div");
    wrap.innerHTML = messageHtml(msg, viewerRole, names);
    var item = wrap.firstChild;
    if (!item) return false;
    listEl.appendChild(item);
    listEl.scrollTop = listEl.scrollHeight;
    return true;
  }

  global.RideChat = {
    renderMessages: renderMessages,
    appendMessage: appendMessage,
    hasMessage: hasMessage,
    displayName: displayName,
  };
})(window);
