(function () {
  "use strict";

  var form = document.getElementById("book-ride-form");
  var tiers = document.getElementById("ride-tiers");
  var requestBtn = document.getElementById("request-ride-btn");
  var estFare = document.getElementById("trip-est-fare");
  var pickupInput = form ? form.querySelector('input[name="pickup"]') : null;
  var dropoffInput = form ? form.querySelector('input[name="dropoff"]') : null;

  if (!form || !tiers) return;

  function updateSelection(input) {
    tiers.querySelectorAll(".ride-tier").forEach(function (card) {
      card.classList.toggle("is-selected", card.contains(input));
    });

    var fare = input.getAttribute("data-fare");
    if (estFare) estFare.textContent = fare;
    if (requestBtn) requestBtn.textContent = "Request ride — " + fare + " est.";
  }

  function updateRoutePreview() {
    if (!window.RiderRouteMap || !pickupInput || !dropoffInput) return;

    var pickup = pickupInput.value.trim();
    var dropoff = dropoffInput.value.trim();
    if (!pickup || !dropoff) return;

    window.RiderRouteMap.update(
      window.RiderRouteMap.buildConfig(pickup, dropoff, {
        badge_label: "Pickup → Destination",
        vehicle_type: "car",
      })
    );
  }

  var debounceTimer;
  function schedulePreview() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(updateRoutePreview, 350);
  }

  tiers.querySelectorAll('input[type="radio"]').forEach(function (input) {
    input.addEventListener("change", function () {
      updateSelection(input);
    });
  });

  var checked = tiers.querySelector('input[type="radio"]:checked');
  if (checked) updateSelection(checked);

  if (pickupInput) pickupInput.addEventListener("input", schedulePreview);
  if (dropoffInput) dropoffInput.addEventListener("input", schedulePreview);
})();
