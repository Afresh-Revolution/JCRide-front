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

  var historySearch = document.querySelector(".history-search input");
  var historyRows = document.querySelectorAll(".rider-table--history tbody tr");
  if (historySearch && historyRows.length) {
    historySearch.addEventListener("input", function () {
      var query = historySearch.value.trim().toLowerCase();
      historyRows.forEach(function (row) {
        var text = row.textContent.toLowerCase();
        row.hidden = query.length > 0 && text.indexOf(query) === -1;
      });
    });
  }

  document.querySelectorAll("#wallet-methods .wallet-method").forEach(function (card) {
    card.addEventListener("click", function () {
      document.querySelectorAll("#wallet-methods .wallet-method").forEach(function (el) {
        el.classList.remove("is-selected");
      });
      card.classList.add("is-selected");
      var input = card.querySelector('input[type="radio"]');
      if (input) input.checked = true;
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

  document.querySelectorAll(".schedule-item__delete").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".schedule-item");
      if (item) item.remove();
    });
  });

  document.querySelectorAll(".schedule-item__actions .rider-btn--danger-text").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".schedule-item");
      if (item) item.remove();
    });
  });

  document.querySelectorAll(".support-form").forEach(function (form) {
    /* server-side POST handles ticket creation */
  });

  document.querySelectorAll(".history-rate-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var rideId = btn.getAttribute("data-ride-id");
      if (!rideId) return;
      if (window.JosRideRating) {
        window.JosRideRating.open({
          rideId: rideId,
          role: "customer",
          triggerEl: btn,
        });
        return;
      }
      if (!window.UserApi) return;
      var rating = Number(window.prompt("Rate your driver (1-5 stars):", "5") || 0);
      if (rating < 1 || rating > 5) return;
      var comment = window.prompt("Optional comment:") || "";
      if (window.ButtonLoading) window.ButtonLoading.start(btn, { text: "Submitting…" });
      UserApi.post("/user/api/rides/" + encodeURIComponent(rideId) + "/rate", {
        rating: rating,
        comment: comment,
      })
        .then(function () {
          if (window.ButtonLoading) window.ButtonLoading.stop(btn);
          btn.textContent = "Rated";
          btn.disabled = true;
        })
        .catch(function (err) {
          if (window.ButtonLoading) window.ButtonLoading.stop(btn);
          alert(err.message || "Could not submit rating.");
        });
    });
  });

  var historyExport = document.getElementById("history-export-btn");
  if (historyExport && window.UserApi) {
    historyExport.addEventListener("click", function () {
      if (window.ButtonLoading) window.ButtonLoading.start(historyExport, { text: "Exporting…" });
      UserApi.request("/user/api/settings/data-export")
        .then(function (data) {
          if (window.ButtonLoading) window.ButtonLoading.stop(historyExport);
          var rides = data.rides || data;
          var blob = new Blob([JSON.stringify(rides, null, 2)], { type: "application/json" });
          var link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = "josride-ride-history.json";
          link.click();
          URL.revokeObjectURL(link.href);
        })
        .catch(function (err) {
          if (window.ButtonLoading) window.ButtonLoading.stop(historyExport);
          alert(err.message || "Export failed.");
        });
    });
  }
})();
