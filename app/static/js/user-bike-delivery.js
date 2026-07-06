(function () {
  "use strict";

  var form = document.getElementById("bike-delivery-form");
  if (!form) return;

  var pickupInput = form.querySelector('input[name="pickup"]');
  var dropoffInput = form.querySelector('input[name="dropoff"]');

  function updateRoutePreview() {
    if (!window.RiderRouteMap || !pickupInput || !dropoffInput) return;

    var pickup = pickupInput.value.trim();
    var dropoff = dropoffInput.value.trim();
    if (!pickup || !dropoff) return;

    window.RiderRouteMap.update(
      window.RiderRouteMap.buildConfig(pickup, dropoff, {
        badge_label: "Pickup - Drop-off · Bike courier",
        vehicle_type: "bike",
      })
    );
  }

  var debounceTimer;
  function schedulePreview() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(updateRoutePreview, 350);
  }

  if (pickupInput) pickupInput.addEventListener("input", schedulePreview);
  if (dropoffInput) dropoffInput.addEventListener("input", schedulePreview);
})();
