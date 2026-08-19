(function () {
  "use strict";

  if (!window.UserApi) return;

  var addBtn = document.getElementById("profile-add-location");
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      var label = window.prompt("Label (e.g. Home, Work):");
      var address = window.prompt("Address:");
      if (!label || !address) return;
      if (window.ButtonLoading) window.ButtonLoading.start(addBtn, { text: "Saving…" });
      UserApi.post("/user/api/saved-locations", {
        label: label.trim(),
        address: address.trim(),
        is_default: false,
      })
        .then(function () {
          window.location.reload();
        })
        .catch(function (err) {
          if (window.ButtonLoading) window.ButtonLoading.stop(addBtn);
          alert(err.message || "Could not save location.");
        });
    });
  }

  document.querySelectorAll(".profile-location-delete").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-id");
      var label = btn.getAttribute("data-label") || "this saved place";
      if (!id) return;
      if (!window.confirm("Remove " + label + " from your account? This cannot be undone.")) {
        return;
      }
      if (window.ButtonLoading) window.ButtonLoading.start(btn, { text: "Removing…" });
      window.UserApi.delete("/user/api/saved-locations/" + encodeURIComponent(id))
        .then(function () {
          var item = btn.closest(".profile-location-item");
          if (item) item.remove();
          var list = document.getElementById("profile-locations-list");
          if (list && !list.querySelector(".profile-location-item:not(.profile-location-item--empty)")) {
            list.innerHTML =
              '<li class="profile-location-item profile-location-item--empty">No saved locations yet.</li>';
          }
        })
        .catch(function (err) {
          if (window.ButtonLoading) window.ButtonLoading.stop(btn);
          alert(err.message || "Could not delete that place.");
        });
    });
  });
})();
