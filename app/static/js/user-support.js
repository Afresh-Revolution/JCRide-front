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

  var accidentForm = document.getElementById("accident-report-form");
  if (accidentForm && window.UserApi) {
    accidentForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var submitBtn = accidentForm.querySelector('button[type="submit"]');
      var description = (accidentForm.description.value || "").trim();
      if (description.length < 10) {
        alert("Please describe the incident in at least 10 characters.");
        return;
      }
      var payload = {
        description: description,
        severity: accidentForm.severity.value || "moderate",
        injuries: Boolean(accidentForm.injuries && accidentForm.injuries.checked),
        ride_id: (accidentForm.ride_id.value || "").trim() || null,
        contact_phone: (accidentForm.contact_phone.value || "").trim() || null,
      };
      if (window.ButtonLoading && submitBtn) {
        window.ButtonLoading.start(submitBtn, { text: "Submitting…" });
      }
      UserApi.post("/user/api/safety/accidents", payload)
        .then(function () {
          if (window.ButtonLoading && submitBtn) window.ButtonLoading.stop(submitBtn);
          accidentForm.reset();
          alert("Accident report received. Our team will follow up shortly.");
        })
        .catch(function (err) {
          if (window.ButtonLoading && submitBtn) window.ButtonLoading.stop(submitBtn);
          alert(err.message || "Could not submit accident report.");
        });
    });
  }
})();
