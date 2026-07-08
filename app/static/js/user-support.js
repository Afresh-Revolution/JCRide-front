(function () {
  "use strict";

  var liveChat = document.getElementById("support-live-chat");
  if (liveChat && window.UserApi) {
    liveChat.addEventListener("click", function (event) {
      event.preventDefault();
      if (window.ButtonLoading) window.ButtonLoading.start(liveChat, { text: "Connecting…" });
      UserApi.post("/user/api/support/live-chat", {})
        .then(function (data) {
          if (window.ButtonLoading) window.ButtonLoading.stop(liveChat);
          var panel = document.getElementById("live-chat");
          if (panel) panel.scrollIntoView({ behavior: "smooth" });
          alert(data.message || "Live chat started. Our team will reply in your tickets list.");
        })
        .catch(function (err) {
          if (window.ButtonLoading) window.ButtonLoading.stop(liveChat);
          alert(err.message || "Could not start live chat.");
        });
    });
  }
})();
