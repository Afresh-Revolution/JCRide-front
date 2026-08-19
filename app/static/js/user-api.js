(function (global) {
  "use strict";

  function apiRequest(url, options) {
    var opts = options || {};
    if (!opts.credentials) opts.credentials = "same-origin";
    return fetch(url, opts).then(function (res) {
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

  function apiPatch(url, payload) {
    return apiRequest(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
  }

  function apiGet(url) {
    return apiRequest(url);
  }

  function apiDelete(url) {
    return fetch(url, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (err) {
            data = { message: text };
          }
        }
        if (!res.ok) {
          var message = data.error || data.message || data.detail || "Request failed";
          throw new Error(typeof message === "string" ? message : JSON.stringify(message));
        }
        return data;
      });
    });
  }

  global.UserApi = {
    request: apiRequest,
    get: apiGet,
    post: apiPost,
    patch: apiPatch,
    delete: apiDelete,
  };
})(window);
