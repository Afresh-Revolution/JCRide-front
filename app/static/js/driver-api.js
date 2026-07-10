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
    completeRide: function (rideId, metrics) {
      return apiPost(base + "/rides/" + encodeURIComponent(rideId) + "/complete", metrics || {});
    },
    cancelRide: function (rideId, reason) {
      var payload = {};
      if (reason) payload.reason = reason;
      return apiPost(base + "/rides/" + encodeURIComponent(rideId) + "/cancel", payload);
    },
    sendMessage: function (rideId, message) {
      return apiPost(base + "/rides/" + encodeURIComponent(rideId) + "/messages", {
        message: message,
      });
    },
    getMessages: function (rideId) {
      return apiRequest(base + "/rides/" + encodeURIComponent(rideId) + "/messages");
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
    clearAllNotifications: function () {
      return apiPost(base + "/notifications/clear-all");
    },
    deleteNotifications: function (ids) {
      var list = ids || [];
      return apiPost(base + "/notifications/delete", { ids: list }).catch(function () {
        // Fallback if bulk endpoint is unavailable: delete one-by-one.
        return Promise.all(
          list.map(function (id) {
            return apiRequest(base + "/notifications/" + encodeURIComponent(id), {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
            });
          })
        ).then(function (results) {
          return {
            deleted: results.length,
            ids: list,
          };
        });
      });
    },
    deleteNotification: function (id) {
      return apiRequest(base + "/notifications/" + encodeURIComponent(id), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
    },
    withdraw: function (payload) {
      return apiPost(base + "/wallet/withdraw", payload);
    },
    activeTripMap: function () {
      return apiRequest("/driver-portal/api/active-trip-map");
    },
  };
})(window);
