(function () {
  "use strict";

  var scheduleFares = {
    economy: "₦2,800 – ₦4,300",
    comfort: "₦4,200 – ₦5,700",
    premium: "₦6,400 – ₦7,900",
  };

  document.querySelectorAll("#schedule-classes .schedule-class").forEach(function (card) {
    card.addEventListener("click", function () {
      document.querySelectorAll("#schedule-classes .schedule-class").forEach(function (el) {
        el.classList.remove("is-selected");
      });
      card.classList.add("is-selected");
      var input = card.querySelector('input[type="radio"]');
      if (input) {
        input.checked = true;
        var fareEl = document.getElementById("schedule-fare-value");
        if (fareEl && scheduleFares[input.value]) {
          fareEl.textContent = scheduleFares[input.value];
        }
      }
    });
  });

  document.querySelectorAll("#history-filters .history-filter").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("#history-filters .history-filter").forEach(function (el) {
        el.classList.remove("is-active");
      });
      btn.classList.add("is-active");
    });
  });

  document.querySelectorAll("#wallet-methods .wallet-method").forEach(function (card) {
    card.addEventListener("click", function () {
      document.querySelectorAll("#wallet-methods .wallet-method").forEach(function (el) {
        el.classList.remove("is-selected");
      });
      card.classList.add("is-selected");
    });
  });

  var amountDisplay = document.getElementById("wallet-amount-display");
  document.querySelectorAll("#wallet-quick-amounts button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("#wallet-quick-amounts button").forEach(function (el) {
        el.classList.remove("is-active");
      });
      btn.classList.add("is-active");
      if (amountDisplay) {
        var amount = Number(btn.getAttribute("data-amount") || 0);
        amountDisplay.textContent = "₦ " + amount.toLocaleString("en-NG");
      }
    });
  });

  document.querySelectorAll(".support-form").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var btn = form.querySelector(".support-submit");
      if (btn) {
        btn.textContent = "Ticket submitted";
        btn.disabled = true;
      }
    });
  });
})();
