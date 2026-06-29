(function () {
  "use strict";

  var form = document.getElementById("book-ride-form");
  var tiers = document.getElementById("ride-tiers");
  var requestBtn = document.getElementById("request-ride-btn");
  var estFare = document.getElementById("trip-est-fare");

  if (!form || !tiers) return;

  function updateSelection(input) {
    tiers.querySelectorAll(".ride-tier").forEach(function (card) {
      card.classList.toggle("is-selected", card.contains(input));
    });

    var fare = input.getAttribute("data-fare");
    if (estFare) estFare.textContent = fare;
    if (requestBtn) requestBtn.textContent = "Request ride — " + fare + " est.";
  }

  tiers.querySelectorAll('input[type="radio"]').forEach(function (input) {
    input.addEventListener("change", function () {
      updateSelection(input);
    });
  });

  var checked = tiers.querySelector('input[type="radio"]:checked');
  if (checked) updateSelection(checked);
})();
