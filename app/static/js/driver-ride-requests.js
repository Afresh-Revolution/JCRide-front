(function () {
  "use strict";

  if (window.location.pathname.indexOf("/ride-requests") < 0) return;

  var reloadTimer = null;

  window.fetchRideRequests = function () {
    if (reloadTimer) return;
    reloadTimer = window.setTimeout(function () {
      reloadTimer = null;
      window.location.reload();
    }, 400);
  };
})();
