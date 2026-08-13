/**
 * JosRide two-sided trip rating modal (customer + driver).
 * window.JosRideRating.open({ rideId, role, endpoint?, onDone?, triggerEl? })
 */
(function () {
  var DRIVER_REASONS = [
    { id: "smooth_driving", label: "Smooth driving" },
    { id: "friendly", label: "Friendly" },
    { id: "clean_vehicle", label: "Clean vehicle" },
    { id: "on_time", label: "On time" },
    { id: "navigation_issues", label: "Navigation issues" },
    { id: "rude", label: "Rude" },
    { id: "dirty_vehicle", label: "Dirty vehicle" },
    { id: "late_pickup", label: "Late pickup" },
  ];

  var RIDER_REASONS = [
    { id: "ready_on_time", label: "Ready on time" },
    { id: "respectful", label: "Respectful" },
    { id: "clear_directions", label: "Clear directions" },
    { id: "left_mess", label: "Left a mess" },
    { id: "late_to_pickup", label: "Late to pickup" },
    { id: "payment_issues", label: "Payment issues" },
    { id: "rude", label: "Rude" },
  ];

  var CUSTOMER_CATEGORIES = [
    { key: "driving_safety", label: "Driving safety" },
    { key: "professional_conduct", label: "Professional conduct" },
    { key: "vehicle_cleanliness", label: "Vehicle cleanliness" },
    { key: "pickup_experience", label: "Pickup experience" },
  ];

  var DRIVER_CATEGORIES = [
    { key: "respectful_conduct", label: "Respectful conduct" },
    { key: "pickup_readiness", label: "Pickup readiness" },
    { key: "payment_cooperation", label: "Payment cooperation" },
    { key: "vehicle_care", label: "Vehicle care" },
  ];

  var state = {
    rideId: null,
    role: "customer",
    endpoint: null,
    onDone: null,
    triggerEl: null,
    overall: 0,
    categories: {},
    reasons: [],
    submitting: false,
  };

  function ensureStyles() {
    if (document.getElementById("josride-rating-css-link")) return;
    var link = document.createElement("link");
    link.id = "josride-rating-css-link";
    link.rel = "stylesheet";
    link.href = "/static/css/josride-rating.css";
    document.head.appendChild(link);
  }

  function starButtons(name, value, sizeClass) {
    var html = '<div class="josride-rating__stars ' + (sizeClass || "") + '" data-star-group="' + name + '" role="group">';
    for (var i = 1; i <= 5; i++) {
      html +=
        '<button type="button" class="josride-rating__star' +
        (i <= value ? " is-on" : "") +
        '" data-star="' +
        i +
        '" aria-label="' +
        i +
        ' stars">★</button>';
    }
    return html + "</div>";
  }

  function ensureModal() {
    var existing = document.getElementById("josride-rating-modal");
    if (existing) return existing;

    ensureStyles();
    var dialog = document.createElement("dialog");
    dialog.id = "josride-rating-modal";
    dialog.className = "josride-rating-modal";
    dialog.setAttribute("aria-labelledby", "josride-rating-title");
    dialog.innerHTML =
      '<div class="josride-rating-modal__panel">' +
      '<button type="button" class="josride-rating-modal__close" id="josride-rating-close" aria-label="Close">&times;</button>' +
      '<header class="josride-rating-modal__hero">' +
      '<h2 class="josride-rating-modal__title" id="josride-rating-title">Rate your trip</h2>' +
      '<p class="josride-rating-modal__lead" id="josride-rating-lead">Ratings stay private until both sides rate or the 7-day window ends.</p>' +
      "</header>" +
      '<div class="josride-rating-modal__body" id="josride-rating-body"></div>' +
      '<p class="josride-rating-modal__error is-hidden" id="josride-rating-error" hidden></p>' +
      '<div class="josride-rating-modal__actions">' +
      '<button type="button" class="josride-rating-modal__skip" id="josride-rating-skip">Skip for now</button>' +
      '<button type="button" class="josride-rating-modal__submit" id="josride-rating-submit" disabled>Submit rating</button>' +
      "</div></div>";
    document.body.appendChild(dialog);

    dialog.querySelector("#josride-rating-close").addEventListener("click", close);
    dialog.querySelector("#josride-rating-skip").addEventListener("click", close);
    dialog.querySelector("#josride-rating-submit").addEventListener("click", submit);
    dialog.addEventListener("click", function (evt) {
      if (evt.target === dialog) close();
    });
    dialog.addEventListener("cancel", function (evt) {
      evt.preventDefault();
      close();
    });
    return dialog;
  }

  function setError(msg) {
    var el = document.getElementById("josride-rating-error");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.classList.add("is-hidden");
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.classList.remove("is-hidden");
    el.textContent = msg;
  }

  function renderBody() {
    var isCustomer = state.role === "customer";
    var cats = isCustomer ? CUSTOMER_CATEGORIES : DRIVER_CATEGORIES;
    var reasons = isCustomer ? DRIVER_REASONS : RIDER_REASONS;
    var title = document.getElementById("josride-rating-title");
    var lead = document.getElementById("josride-rating-lead");
    if (title) title.textContent = isCustomer ? "Rate your driver" : "Rate your rider";
    if (lead) {
      lead.textContent =
        "Help keep JosRide fair. Ratings stay blind until both parties rate or the window ends.";
    }

    var prevComment = "";
    var commentEl = document.getElementById("josride-rating-comment");
    if (commentEl) prevComment = commentEl.value || "";

    var body = document.getElementById("josride-rating-body");
    if (!body) return;

    var html = '<p class="josride-rating__label">Overall</p>' + starButtons("overall", state.overall, "josride-rating__stars--lg");

    cats.forEach(function (cat) {
      var val = state.categories[cat.key] || 0;
      html +=
        '<div class="josride-rating__category">' +
        '<p class="josride-rating__label">' +
        cat.label +
        "</p>" +
        starButtons(cat.key, val, "josride-rating__stars--sm") +
        "</div>";
    });

    html += '<div class="josride-rating__reasons" id="josride-rating-reasons">';
    reasons.forEach(function (reason) {
      var on = state.reasons.indexOf(reason.id) >= 0;
      html +=
        '<button type="button" class="josride-rating__chip' +
        (on ? " is-on" : "") +
        '" data-reason="' +
        reason.id +
        '">' +
        reason.label +
        "</button>";
    });
    html += "</div>";

    html +=
      '<label class="josride-rating__comment">' +
      '<span class="josride-rating__label">Comment (optional)</span>' +
      '<textarea id="josride-rating-comment" rows="3" maxlength="500" placeholder="Share brief feedback"></textarea>' +
      "</label>";

    if (isCustomer) {
      html +=
        '<a class="josride-rating__safety" href="/user/support">Report a safety concern instead</a>';
    }

    body.innerHTML = html;
    var nextComment = document.getElementById("josride-rating-comment");
    if (nextComment) nextComment.value = prevComment;

    body.querySelectorAll("[data-star-group]").forEach(function (group) {
      group.addEventListener("click", function (evt) {
        var btn = evt.target.closest("[data-star]");
        if (!btn) return;
        var name = group.getAttribute("data-star-group");
        var value = Number(btn.getAttribute("data-star") || 0);
        if (name === "overall") {
          state.overall = value;
        } else {
          state.categories[name] = state.categories[name] === value ? 0 : value;
        }
        renderBody();
        syncSubmit();
      });
    });

    body.querySelectorAll("[data-reason]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var id = chip.getAttribute("data-reason");
        var idx = state.reasons.indexOf(id);
        if (idx >= 0) state.reasons.splice(idx, 1);
        else if (state.reasons.length < 8) state.reasons.push(id);
        renderBody();
      });
    });

    syncSubmit();
  }

  function syncSubmit() {
    var submitBtn = document.getElementById("josride-rating-submit");
    if (submitBtn) submitBtn.disabled = !(state.overall >= 1) || state.submitting;
  }

  function postJson(url, payload) {
    if (state.role === "customer" && window.UserApi && window.UserApi.post) {
      return window.UserApi.post(url, payload);
    }
    if (state.role === "driver" && window.DriverApi && window.DriverApi.post) {
      return window.DriverApi.post(url, payload);
    }
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || "Could not submit rating.");
          throw err;
        }
        return data;
      });
    });
  }

  function submit() {
    if (state.submitting || state.overall < 1 || !state.rideId) return;
    state.submitting = true;
    syncSubmit();
    setError("");

    var payload = { overall_stars: state.overall };
    Object.keys(state.categories).forEach(function (key) {
      var val = Number(state.categories[key] || 0);
      if (val > 0) payload[key] = val;
    });
    if (state.reasons.length) payload.reason_codes = state.reasons.slice();
    var commentEl = document.getElementById("josride-rating-comment");
    var comment = commentEl ? String(commentEl.value || "").trim() : "";
    if (comment) payload.comment = comment;

    var endpoint =
      state.endpoint ||
      (state.role === "driver"
        ? "/driver-portal/api/rides/" + encodeURIComponent(state.rideId) + "/rate"
        : "/user/api/rides/" + encodeURIComponent(state.rideId) + "/rate");

    var submitBtn = document.getElementById("josride-rating-submit");
    if (submitBtn) submitBtn.textContent = "Submitting…";

    postJson(endpoint, payload)
      .then(function () {
        if (state.triggerEl) {
          state.triggerEl.textContent = "Rated";
          state.triggerEl.disabled = true;
        }
        close({ submitted: true });
      })
      .catch(function (err) {
        state.submitting = false;
        syncSubmit();
        if (submitBtn) submitBtn.textContent = "Submit rating";
        var msg = (err && err.message) || "Could not submit rating.";
        if (/already rated/i.test(msg)) {
          if (state.triggerEl) {
            state.triggerEl.textContent = "Rated";
            state.triggerEl.disabled = true;
          }
          close({ submitted: true, alreadyRated: true });
          return;
        }
        setError(msg);
      });
  }

  function close(result) {
    var dialog = document.getElementById("josride-rating-modal");
    if (dialog && dialog.open) dialog.close();
    document.body.classList.remove("josride-rating-modal-open");
    var done = state.onDone;
    state.submitting = false;
    state.onDone = null;
    if (typeof done === "function") done(result || { skipped: true });
  }

  function open(options) {
    options = options || {};
    if (!options.rideId) return;
    state.rideId = String(options.rideId);
    state.role = options.role === "driver" ? "driver" : "customer";
    state.endpoint = options.endpoint || null;
    state.onDone = options.onDone || null;
    state.triggerEl = options.triggerEl || null;
    state.overall = 0;
    state.categories = {};
    state.reasons = [];
    state.submitting = false;

    var dialog = ensureModal();
    renderBody();
    setError("");
    var submitBtn = document.getElementById("josride-rating-submit");
    if (submitBtn) submitBtn.textContent = "Submit rating";
    document.body.classList.add("josride-rating-modal-open");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "open");
  }

  function formatPublicRatingLabel(ratingAvg, ratingCount) {
    var count = Number(ratingCount || 0);
    if (!isFinite(count) || count < 5) return "New on JosRide";
    var avg = Number(ratingAvg || 0);
    if (!isFinite(avg) || avg <= 0) return "New on JosRide";
    return avg.toFixed(2) + " ★ · " + count + " verified rides";
  }

  function openFromQuery(paramName, role) {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var rideId = params.get(paramName || "rate_ride");
      if (!rideId) return;
      open({
        rideId: rideId,
        role: role || "customer",
        onDone: function () {
          if (window.history && window.history.replaceState) {
            params.delete(paramName || "rate_ride");
            var next = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
            window.history.replaceState({}, "", next);
          }
        },
      });
    } catch (e) {
      /* ignore */
    }
  }

  window.JosRideRating = {
    open: open,
    close: close,
    openFromQuery: openFromQuery,
    formatPublicRatingLabel: formatPublicRatingLabel,
  };

  document.addEventListener("DOMContentLoaded", function () {
    var path = window.location.pathname || "";
    if (path.indexOf("/driver-portal") === 0) {
      openFromQuery("rate_ride", "driver");
    } else if (path.indexOf("/user/") === 0) {
      openFromQuery("rate_ride", "customer");
    }
  });
})();
