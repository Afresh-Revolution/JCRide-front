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

    function openChat() {
      chatPanel.classList.add("is-open");
      document.body.classList.add("driver-trip-chat-open");
      chatBtn.setAttribute("aria-expanded", "true");

      try {
        if (typeof chatPanel.showModal === "function") {
          if (!chatPanel.open) {
            chatPanel.showModal();
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
            window.RideChat.renderMessages(chatList, (data && data.messages) || [], "driver");
          }
        })
        .catch(function () {});
    }

    function appendMessage(msg) {
      if (window.RideChat && chatList) {
        window.RideChat.appendMessage(chatList, msg, "driver");
      }
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

    function sendMessage() {
      var text = chatInput ? chatInput.value.trim() : "";
      if (!text || !rideId || !window.DriverApi) return;
      if (chatSendBtn) chatSendBtn.disabled = true;
      DriverApi.post(DriverApi.base + "/rides/" + encodeURIComponent(rideId) + "/messages", {
        message: text,
      })
        .then(function (msg) {
          if (chatInput) chatInput.value = "";
          appendMessage(msg);
        })
        .catch(function (err) {
          window.alert(err.message || "Could not send message.");
        })
        .finally(function () {
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
