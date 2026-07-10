(function (global) {
  "use strict";

  function formatPlace(feature) {
    var p = feature.properties || {};
    var parts = [];
    if (p.name) parts.push(p.name);
    if (p.city && p.city !== p.name) parts.push(p.city);
    if (p.state) parts.push(p.state);
    if (p.country) parts.push(p.country);
    return parts.filter(Boolean).join(", ") || feature.display_name || "Selected location";
  }

  // Restrict search to Nigeria. Photon's bbox biases/limits results to the box,
  // and the location bias (lat/lon) centres relevance on the country.
  var NIGERIA_BBOX = "2.6,4.0,14.7,14.0"; // minLon,minLat,maxLon,maxLat
  var NIGERIA_BIAS = { lat: 9.082, lng: 8.675 };

  function isInNigeria(feature) {
    var p = (feature && feature.properties) || {};
    if (p.countrycode) return String(p.countrycode).toUpperCase() === "NG";
    if (p.country) return String(p.country).toLowerCase() === "nigeria";
    // No country info: fall back to a coordinate check within the bounding box.
    var coords = feature && feature.geometry && feature.geometry.coordinates;
    if (!coords) return false;
    var lng = coords[0];
    var lat = coords[1];
    return lng >= 2.6 && lng <= 14.7 && lat >= 4.0 && lat <= 14.0;
  }

  function searchPlaces(query) {
    var q = (query || "").trim();
    if (q.length < 2) return Promise.resolve([]);
    var url =
      "https://photon.komoot.io/api/?q=" +
      encodeURIComponent(q) +
      "&limit=10&lang=en" +
      "&bbox=" + NIGERIA_BBOX +
      "&lat=" + NIGERIA_BIAS.lat +
      "&lon=" + NIGERIA_BIAS.lng;
    return fetch(url)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        return (data.features || [])
          .filter(isInNigeria)
          .map(function (feature) {
            var coords = feature.geometry && feature.geometry.coordinates;
            return {
              label: formatPlace(feature),
              lat: coords ? coords[1] : null,
              lng: coords ? coords[0] : null,
              feature: feature,
            };
          })
          .filter(function (item) {
            return item.lat != null && item.lng != null;
          })
          .slice(0, 8);
      })
      .catch(function () {
        return [];
      });
  }

  function attach(input, onSelect) {
    if (!input || input.__locationSearchAttached) return;
    input.__locationSearchAttached = true;
    input.setAttribute("autocomplete", "off");

    var wrap = input.closest(".route-input") || input.parentElement;
    if (!wrap) return;
    wrap.classList.add("route-input--searchable");

    var list = document.createElement("ul");
    list.className = "location-suggestions";
    list.hidden = true;
    wrap.appendChild(list);

    var debounceTimer = null;

    function hide() {
      list.hidden = true;
      list.innerHTML = "";
    }

    function show(items) {
      list.innerHTML = "";
      if (!items.length) {
        hide();
        return;
      }
      items.forEach(function (item) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = item.label;
        btn.addEventListener("mousedown", function (event) {
          event.preventDefault();
          input.value = item.label;
          input.dataset.lat = String(item.lat);
          input.dataset.lng = String(item.lng);
          input.dataset.resolved = "1";
          hide();
          if (onSelect) onSelect(item);
        });
        li.appendChild(btn);
        list.appendChild(li);
      });
      list.hidden = false;
    }

    input.addEventListener("input", function () {
      input.dataset.resolved = "";
      input.removeAttribute("data-lat");
      input.removeAttribute("data-lng");
      window.clearTimeout(debounceTimer);
      var query = input.value.trim();
      if (query.length < 2) {
        hide();
        return;
      }
      debounceTimer = window.setTimeout(function () {
        searchPlaces(query).then(show);
      }, 280);
    });

    input.addEventListener("blur", function () {
      window.setTimeout(hide, 180);
    });

    input.addEventListener("focus", function () {
      var query = input.value.trim();
      if (query.length >= 2 && !input.dataset.resolved) {
        searchPlaces(query).then(show);
      }
    });
  }

  function readCoords(input) {
    if (!input || !input.dataset.lat || !input.dataset.lng) return null;
    return {
      label: input.value.trim(),
      lat: Number(input.dataset.lat),
      lng: Number(input.dataset.lng),
    };
  }

  global.RiderLocationSearch = {
    attach: attach,
    search: searchPlaces,
    readCoords: readCoords,
  };
})(window);
