(function () {
  "use strict";

  function readConfig() {
    var el = document.getElementById("driver-active-trip-config");
    if (!el) return {};
    try {
      return JSON.parse(el.textContent || "{}");
    } catch (err) {
      return {};
    }
  }

  function resolveRideId(config, chatBtn) {
    if (config.rideId) return config.rideId;
    if (chatBtn && chatBtn.getAttribute("data-ride-id")) {
      return chatBtn.getAttribute("data-ride-id");
    }
    var realtimeEl = document.getElementById("driver-realtime-config");
    if (realtimeEl) {
      try {
        var realtime = JSON.parse(realtimeEl.textContent || "{}");
        if (realtime.activeTripId) return realtime.activeTripId;
      } catch (err) {
        /* ignore */
      }
    }
    return "";
  }

  function cleanName(value) {
    var name = String(value || "").trim();
    if (!name) return "";
    var lower = name.toLowerCase();
    if (lower === "driver" || lower === "customer" || lower === "rider" || lower === "user") {
      return "";
    }
    return name;
  }

  function initDriverTripChat() {
    var chatBtn = document.querySelector(".active-trip-comms__btn--chat");
    var chatPanel = document.getElementById("driver-trip-chat-panel");
    if (!chatBtn || !chatPanel) return;

    if (chatPanel.parentNode !== document.body) {
      document.body.appendChild(chatPanel);
    }

    var config = readConfig();
    var rideId = resolveRideId(config, chatBtn);
    var chatCloseBtn = document.getElementById("driver-trip-chat-close");
    var chatList = document.getElementById("driver-trip-chat-list");
    var chatForm = document.getElementById("driver-trip-chat-form");
    var chatInput = document.getElementById("driver-trip-chat-input");
    var chatSendBtn = document.getElementById("driver-trip-chat-send");
    var subtitleEl = document.getElementById("driver-trip-chat-subtitle");

    function chatNames() {
      var profileEl = document.querySelector(".admin-profile__name");
      var riderEl = document.querySelector(".active-trip-rider__name");
      var selfName =
        cleanName(chatPanel.getAttribute("data-self-name")) ||
        cleanName(config.driverName) ||
        cleanName(profileEl && profileEl.textContent) ||
        "You";
      var riderName =
        cleanName(chatPanel.getAttribute("data-peer-name")) ||
        cleanName(chatBtn.getAttribute("data-chat-rider")) ||
        cleanName(subtitleEl && (subtitleEl.getAttribute("data-peer-name") || subtitleEl.textContent)) ||
        cleanName(riderEl && riderEl.textContent) ||
        cleanName(config.riderName) ||
        "Rider";

      if (subtitleEl && riderName) subtitleEl.textContent = riderName;

      return {
        self: selfName,
        me: selfName,
        driver: selfName,
        rider: riderName,
        customer: riderName,
        peer: riderName,
      };
    }

    function setReloadBtnHiddenForChat(hidden) {
      var reloadBtn = document.getElementById("pwa-reload-btn");
      if (!reloadBtn) return;
      var isSmall = window.matchMedia("(max-width: 900px)").matches;
      if (hidden && isSmall) {
        reloadBtn.classList.add("is-chat-hidden");
      } else {
        reloadBtn.classList.remove("is-chat-hidden");
      }
    }

    function openChat() {
      chatPanel.classList.add("is-open");
      document.body.classList.add("driver-trip-chat-open");
      chatBtn.setAttribute("aria-expanded", "true");
      setReloadBtnHiddenForChat(true);

      /* Non-modal open keeps the top navbar above/outside the sheet (no top-layer / backdrop). */
      try {
        if (typeof chatPanel.show === "function") {
          if (!chatPanel.open) {
            chatPanel.show();
          }
        } else {
          chatPanel.setAttribute("open", "open");
        }
      } catch (err) {
        chatPanel.setAttribute("open", "open");
      }

      loadMessages();
      window.setTimeout(function () {
        if (chatInput) chatInput.focus();
      }, 280);
    }

    function closeChat() {
      chatPanel.classList.remove("is-open");
      document.body.classList.remove("driver-trip-chat-open");
      chatBtn.setAttribute("aria-expanded", "false");
      setReloadBtnHiddenForChat(false);

      try {
        if (typeof chatPanel.close === "function" && chatPanel.open) {
          chatPanel.close();
        } else {
          chatPanel.removeAttribute("open");
        }
      } catch (err) {
        chatPanel.removeAttribute("open");
      }
    }

    function loadMessages() {
      if (!chatList || !rideId || !window.DriverApi) return;
      DriverApi.request(DriverApi.base + "/rides/" + encodeURIComponent(rideId) + "/messages")
        .then(function (data) {
          if (window.RideChat) {
            window.RideChat.renderMessages(
              chatList,
              (data && data.messages) || [],
              "driver",
              chatNames()
            );
          }
        })
        .catch(function () {});
    }

    function appendMessage(msg) {
      if (!window.RideChat || !chatList || !msg) return false;
      var names = chatNames();
      if (typeof msg === "object") {
        var role = String(msg.sender_role || "").toLowerCase();
        if (!msg.sender_name) {
          if (role === "driver") msg.sender_name = names.self;
          else if (role === "customer" || role === "rider") msg.sender_name = names.rider;
        }
      }
      return window.RideChat.appendMessage(chatList, msg, "driver", names);
    }

    chatBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      openChat();
    });

    if (chatCloseBtn) {
      chatCloseBtn.addEventListener("click", function (event) {
        event.preventDefault();
        closeChat();
      });
    }

    chatPanel.addEventListener("click", function (event) {
      if (event.target === chatPanel) closeChat();
    });

    chatPanel.addEventListener("cancel", function (event) {
      event.preventDefault();
      closeChat();
    });

    var sending = false;

    function sendMessage() {
      var text = chatInput ? chatInput.value.trim() : "";
      if (!text || !rideId || !window.DriverApi || sending) return;
      sending = true;
      if (chatSendBtn) chatSendBtn.disabled = true;
      DriverApi.post(DriverApi.base + "/rides/" + encodeURIComponent(rideId) + "/messages", {
        message: text,
      })
        .then(function (msg) {
          if (chatInput) chatInput.value = "";
          if (msg && typeof msg === "object") {
            msg.sender_role = msg.sender_role || "driver";
            msg.sender_name = msg.sender_name || chatNames().self;
          }
          appendMessage(msg);
        })
        .catch(function (err) {
          window.alert(err.message || "Could not send message.");
        })
        .finally(function () {
          sending = false;
          if (chatSendBtn) chatSendBtn.disabled = false;
        });
    }

    if (chatForm) {
      chatForm.addEventListener("submit", function (event) {
        event.preventDefault();
        sendMessage();
      });
    }

    window.__driverAppendChatMessage = appendMessage;
    loadMessages();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDriverTripChat);
  } else {
    initDriverTripChat();
  }
})();
