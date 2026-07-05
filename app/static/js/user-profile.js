(function () {
  "use strict";

  if (!window.UserApi) return;

  var addBtn = document.getElementById("profile-add-location");
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      var label = window.prompt("Label (e.g. Home, Work):");
      var address = window.prompt("Address:");
      if (!label || !address) return;
      UserApi.post("/user/api/saved-locations", {
        label: label.trim(),
        address: address.trim(),
        is_default: false,
      })
        .then(function () {
          window.location.reload();
        })
        .catch(function (err) {
          alert(err.message || "Could not save location.");
        });
    });
  }
})();
