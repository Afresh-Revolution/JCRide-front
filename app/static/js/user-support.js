(function () {
  "use strict";

  var liveChat = document.getElementById("support-live-chat");
  if (liveChat && window.UserApi) {
    liveChat.addEventListener("click", function (event) {
      event.preventDefault();
      UserApi.post("/user/api/support/live-chat", {})
        .then(function (data) {
          var panel = document.getElementById("live-chat");
          if (panel) panel.scrollIntoView({ behavior: "smooth" });
          alert(data.message || "Live chat started. Our team will reply in your tickets list.");
        })
        .catch(function (err) {
          alert(err.message || "Could not start live chat.");
        });
    });
  }
})();
