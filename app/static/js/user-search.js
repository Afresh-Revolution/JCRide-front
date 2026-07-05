(function () {
  "use strict";

  var input = document.getElementById("portal-search-input");
  var resultsEl = document.getElementById("portal-search-results");
  if (!input || !resultsEl || !window.UserApi) return;

  var debounceTimer = null;

  function hideResults() {
    resultsEl.hidden = true;
    resultsEl.innerHTML = "";
  }

  function showResults(items) {
    if (!items.length) {
      hideResults();
      return;
    }
    resultsEl.innerHTML = items
      .map(function (item) {
        var hint = item.url_hint || "#";
        return (
          '<li><a href="' +
          hint +
          '"><strong>' +
          (item.title || "") +
          "</strong><span>" +
          (item.subtitle || item.type || "") +
          "</span></a></li>"
        );
      })
      .join("");
    resultsEl.hidden = false;
  }

  input.addEventListener("input", function () {
    var query = input.value.trim();
    if (debounceTimer) window.clearTimeout(debounceTimer);
    if (query.length < 2) {
      hideResults();
      return;
    }
    debounceTimer = window.setTimeout(function () {
      UserApi.request("/user/api/search?q=" + encodeURIComponent(query))
        .then(function (data) {
          showResults((data && data.results) || []);
        })
        .catch(function () {
          hideResults();
        });
    }, 280);
  });

  document.addEventListener("click", function (event) {
    if (!event.target.closest("#portal-search-wrap")) hideResults();
  });
})();
