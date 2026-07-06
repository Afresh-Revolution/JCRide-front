(function () {
  "use strict";

  function getPosition() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported on this device."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        function (err) {
          var message = "Unable to get your location.";
          if (err.code === 1) {
            message = "Location permission denied. Allow GPS to go online.";
          } else if (err.code === 3) {
            message = "Location request timed out. Try again.";
          }
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        }
      );
    });
  }

  function ensureHidden(form, name) {
    var input = form.querySelector('input[name="' + name + '"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    return input;
  }

  function setBusy(form, busy) {
    var checkbox = form.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.disabled = busy;
    }
    form.classList.toggle("is-busy", busy);
  }

  function init() {
    var form = document.getElementById("onlineForm");
    if (!form) return;

    var checkbox = form.querySelector('input[type="checkbox"]');
    var valueInput = document.getElementById("onlineValue");
    if (!checkbox || !valueInput) return;

    checkbox.addEventListener("change", function (event) {
      event.preventDefault();

      var goingOnline = checkbox.checked;
      valueInput.value = goingOnline ? "true" : "false";

      if (!goingOnline) {
        form.querySelector('input[name="current_lat"]') &&
          form.querySelector('input[name="current_lat"]').remove();
        form.querySelector('input[name="current_lng"]') &&
          form.querySelector('input[name="current_lng"]').remove();
        setBusy(form, true);
        form.submit();
        return;
      }

      setBusy(form, true);
      getPosition()
        .then(function (coords) {
          ensureHidden(form, "current_lat").value = String(coords.lat);
          ensureHidden(form, "current_lng").value = String(coords.lng);
          form.submit();
        })
        .catch(function (err) {
          checkbox.checked = false;
          valueInput.value = "false";
          setBusy(form, false);
          window.alert(err.message || "Could not get location.");
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
