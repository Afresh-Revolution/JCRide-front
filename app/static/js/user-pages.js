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

  function schedulePost(url, body) {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(body || {}),
      credentials: "same-origin",
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || data.detail || "Request failed");
        return data;
      });
    });
  }

  document.querySelectorAll(".schedule-item__cancel").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-id");
      if (!id) return;
      if (!window.confirm("Cancel this scheduled ride?")) return;
      if (window.ButtonLoading) window.ButtonLoading.start(btn, { text: "Cancelling…" });
      schedulePost("/user/schedule-ride/" + encodeURIComponent(id) + "/cancel", {
        reason: "Cancelled by rider",
      })
        .then(function () {
          var item = btn.closest(".schedule-item");
          if (item) item.remove();
          if (window.ButtonLoading) window.ButtonLoading.stop(btn);
        })
        .catch(function (err) {
          if (window.ButtonLoading) window.ButtonLoading.stop(btn);
          alert(err.message || "Could not cancel scheduled ride.");
        });
    });
  });

  var editDialog = document.getElementById("schedule-edit-dialog");
  var editForm = document.getElementById("schedule-edit-form");
  var editError = document.getElementById("schedule-edit-error");

  document.querySelectorAll(".schedule-item__edit").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!editDialog || !editForm) return;
      document.getElementById("schedule-edit-id").value = btn.getAttribute("data-id") || "";
      document.getElementById("schedule-edit-pickup").value = btn.getAttribute("data-pickup") || "";
      document.getElementById("schedule-edit-destination").value =
        btn.getAttribute("data-destination") || "";
      document.getElementById("schedule-edit-date").value = btn.getAttribute("data-date") || "";
      document.getElementById("schedule-edit-time").value = btn.getAttribute("data-time") || "";
      if (editError) {
        editError.hidden = true;
        editError.textContent = "";
      }
      if (typeof editDialog.showModal === "function") editDialog.showModal();
    });
  });

  if (editForm && editDialog) {
    editForm.addEventListener("submit", function (event) {
      var submitter = event.submitter;
      var action = submitter && submitter.value ? submitter.value : "cancel";
      if (action !== "save") return;
      event.preventDefault();
      var id = document.getElementById("schedule-edit-id").value;
      if (!id) return;
      var payload = {
        pickup: document.getElementById("schedule-edit-pickup").value.trim(),
        destination: document.getElementById("schedule-edit-destination").value.trim(),
        date: document.getElementById("schedule-edit-date").value.trim(),
        time: document.getElementById("schedule-edit-time").value.trim(),
      };
      if (window.ButtonLoading && submitter) {
        window.ButtonLoading.start(submitter, { text: "Saving…" });
      }
      schedulePost("/user/schedule-ride/" + encodeURIComponent(id) + "/edit", payload)
        .then(function () {
          window.location.reload();
        })
        .catch(function (err) {
          if (window.ButtonLoading && submitter) window.ButtonLoading.stop(submitter);
          if (editError) {
            editError.hidden = false;
            editError.textContent = err.message || "Could not update scheduled ride.";
          } else {
            alert(err.message || "Could not update scheduled ride.");
          }
        });
    });
  }

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
