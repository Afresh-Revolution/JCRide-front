(function (global) {
  "use strict";

  var base = "/driver-portal/api";

  function apiRequest(url, options) {
    return fetch(url, options || {}).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var message = data.error || data.message || data.detail || "Request failed";
          throw new Error(typeof message === "string" ? message : JSON.stringify(message));
        }
        return data;
      });
    });
  }

  function apiPost(url, payload) {
    return apiRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  }

  global.DriverApi = {
    base: base,
    request: apiRequest,
    post: apiPost,
    dashboard: function () {
      return apiRequest(base + "/dashboard");
    },
    rideRequests: function () {
      return apiRequest(base + "/ride-requests");
    },
    acceptRide: function (rideId) {
      return apiPost(base + "/ride-requests/" + encodeURIComponent(rideId) + "/accept");
    },
    rejectRide: function (rideId) {
      return apiPost(base + "/ride-requests/" + encodeURIComponent(rideId) + "/reject");
    },
    arrived: function (rideId) {
      return apiPost(base + "/rides/" + encodeURIComponent(rideId) + "/arrived");
    },
    startRide: function (rideId) {
      return apiPost(base + "/rides/" + encodeURIComponent(rideId) + "/start");
    },
    completeRide: function (rideId) {
      return apiPost(base + "/rides/" + encodeURIComponent(rideId) + "/complete");
    },
    cancelRide: function (rideId) {
      return apiPost(base + "/rides/" + encodeURIComponent(rideId) + "/cancel");
    },
    setAvailability: function (online, lat, lng) {
      var payload = { is_online: !!online };
      if (online) {
        payload.current_lat = lat;
        payload.current_lng = lng;
      }
      return apiPost(base + "/availability", payload);
    },
    markNotificationRead: function (id) {
      return apiPost(base + "/notifications/" + encodeURIComponent(id) + "/read");
    },
    markAllNotificationsRead: function () {
      return apiPost(base + "/notifications/read-all");
    },
    withdraw: function (payload) {
      return apiPost(base + "/wallet/withdraw", payload);
    },
    activeTripMap: function () {
      return apiRequest("/driver-portal/api/active-trip-map");
    },
  };
})(window);
