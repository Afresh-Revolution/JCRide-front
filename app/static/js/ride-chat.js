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

  function renderMessages(listEl, messages, viewerRole) {
    if (!listEl) return;
    if (!messages || !messages.length) {
      listEl.innerHTML = '<li class="ride-chat-empty">No messages yet. Say hello to your driver.</li>';
      return;
    }
    listEl.innerHTML = messages
      .map(function (msg) {
        var role = msg.sender_role || "user";
        var mine = role === viewerRole;
        return (
          '<li class="ride-chat-item' +
          (mine ? " ride-chat-item--mine" : " ride-chat-item--theirs") +
          '">' +
          '<span class="ride-chat-item__meta">' +
          escapeHtml(role) +
          (formatTime(msg.created_at) ? " · " + formatTime(msg.created_at) : "") +
          "</span>" +
          '<p class="ride-chat-item__text">' +
          escapeHtml(msg.message || "") +
          "</p></li>"
        );
      })
      .join("");
    listEl.scrollTop = listEl.scrollHeight;
  }

  function appendMessage(listEl, msg, viewerRole) {
    if (!listEl || !msg) return;
    var empty = listEl.querySelector(".ride-chat-empty");
    if (empty) empty.remove();
    var role = msg.sender_role || "user";
    var mine = role === viewerRole;
    var item = document.createElement("li");
    item.className =
      "ride-chat-item" + (mine ? " ride-chat-item--mine" : " ride-chat-item--theirs");
    item.innerHTML =
      '<span class="ride-chat-item__meta">' +
      escapeHtml(role) +
      (formatTime(msg.created_at) ? " · " + formatTime(msg.created_at) : "") +
      '</span><p class="ride-chat-item__text">' +
      escapeHtml(msg.message || "") +
      "</p>";
    listEl.appendChild(item);
    listEl.scrollTop = listEl.scrollHeight;
  }

  global.RideChat = {
    renderMessages: renderMessages,
    appendMessage: appendMessage,
  };
})(window);
