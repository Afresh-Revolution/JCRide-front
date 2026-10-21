(function () {
  "use strict";
  const form = document.getElementById("lm-route-form");
  if (!form) return;
  const status = document.getElementById("lm-location-status");
  const panel = document.getElementById("lm-map-picker");
  const confirm = document.getElementById("lm-map-confirm");
  const fields = {};
  const nigeriaBounds = {south: 4.0, west: 2.6, north: 14.0, east: 14.7};
  const nigeriaCenter = {lat: 9.082, lng: 8.6753};
  const searches = [];
  let searchBias = nigeriaBounds;
  let userInteracted = false;
  const deviceStatus = document.getElementById("lm-device-location-status");
  function inNigeriaArea(point) {
    return Number.isFinite(point.lat) && Number.isFinite(point.lng)
      && point.lat >= nigeriaBounds.south && point.lat <= nigeriaBounds.north
      && point.lng >= nigeriaBounds.west && point.lng <= nigeriaBounds.east;
  }
  // A delayed location response must not move a pin the rider is already editing.
  form.addEventListener("pointerdown", function () { userInteracted = true; });
  form.addEventListener("keydown", function () { userInteracted = true; });
  function locateDevice(explicit) {
    if (!navigator.geolocation) {
      deviceStatus.textContent = "Device location is unavailable. Search or pick a location in Nigeria.";
      return;
    }
    const startRevision = revision;
    deviceStatus.textContent = "Finding your device location...";
    navigator.geolocation.getCurrentPosition(function (position) {
      const point = {lat: position.coords.latitude, lng: position.coords.longitude};
      if (!inNigeriaArea(point)) {
        deviceStatus.textContent = "Your device is outside the Nigeria map area. Choose your Nigerian pickup and destination.";
        return;
      }
      searchBias = {center: point, radius: 50000};
      searches.forEach(function (search) { search.locationBias = searchBias; });
      const hasSelection = coordinates(fields.pickup) || coordinates(fields.dropoff);
      if (revision === startRevision && (explicit || (!userInteracted && !hasSelection))) {
        map.setCenter(point);
        map.setZoom(15);
      }
      deviceStatus.textContent = "Nearby Nigerian locations are prioritized. Confirm the pin to save your location.";
    }, function () {
      deviceStatus.textContent = "Location permission was denied or your position is unavailable. You can still search and pick anywhere in Nigeria.";
    }, {enableHighAccuracy: true, timeout: 10000, maximumAge: 60000});
  }
  let map, geocoder, activeField = "pickup", revision = 0, resolving = false;
  ["pickup", "dropoff"].forEach(function (name) {
    const prefix = name === "pickup" ? "lm-pickup" : "lm-dest";
    fields[name] = {
      input: document.getElementById("lm-" + name),
      lat: document.getElementById(prefix + "-lat"),
      lng: document.getElementById(prefix + "-lng"),
      selected: document.getElementById("lm-" + name + "-selected"),
      revision: 0
    };
    fields[name].selected.textContent = fields[name].input.value || "No location selected yet.";
  });
  function coordinates(field) {
    const lat = Number(field.lat.value), lng = Number(field.lng.value);
    return field.lat.value !== "" && field.lng.value !== "" && Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? {lat: lat, lng: lng} : null;
  }
  function select(field, point, label) {
    field.input.value = label;
    field.lat.value = point.lat;
    field.lng.value = point.lng;
    field.selected.textContent = label;
    status.textContent = "Location selected. Choose both locations to continue.";
  }
  function setTarget(name, focus) {
    revision++;
    activeField = name;
    resolving = false;
    confirm.disabled = false;
    const label = name === "pickup" ? "pickup" : "destination";
    document.getElementById("lm-map-title").textContent = "Choose " + label + " on the map";
    confirm.textContent = "Use pin as " + label;
    document.querySelectorAll("[data-map-field]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.mapField === name));
    });
    const point = coordinates(fields[name]) || coordinates(fields.pickup);
    if (point && inNigeriaArea(point)) { map.setCenter(point); map.setZoom(17); }
    if (focus) {
      document.getElementById("lm-map-title").focus();
      panel.scrollIntoView({block: "nearest"});
    }
  }
  form.addEventListener("submit", function (event) {
    if (resolving || !coordinates(fields.pickup) || !coordinates(fields.dropoff)) {
      event.preventDefault();
      status.textContent = resolving ? "Please wait while your pin is saved." : "Select both locations from Google search or confirm their pins on the map.";
      status.scrollIntoView({block: "nearest"});
    }
  });
  async function initialize() {
    try {
      await Promise.race([
        window.JosRideMaps.loadGoogle(),
        new Promise(function (_, reject) { setTimeout(function () { reject(new Error("Maps timed out")); }, 20000); })
      ]);
      map = new google.maps.Map(document.getElementById("lm-location-map"), {
        center: nigeriaCenter, zoom: 6, gestureHandling: "cooperative",
        restriction: {latLngBounds: nigeriaBounds, strictBounds: true},
        streetViewControl: false, mapTypeControl: true, fullscreenControl: false
      });
      document.getElementById("lm-map-loading").hidden = true;
      geocoder = new google.maps.Geocoder();
      setTarget("pickup", false);
      const locateButton = document.getElementById("lm-use-device-location");
      locateButton.disabled = false;
      locateButton.addEventListener("click", function () { locateDevice(true); });
      locateDevice(false);
      map.addListener("click", function (event) {
        if (event.stop) event.stop();
        if (event.latLng) map.panTo(event.latLng);
      });
      map.addListener("idle", function () {
        const center = map.getCenter();
        if (center) document.getElementById("lm-map-coordinates").textContent = center.lat().toFixed(6) + ", " + center.lng().toFixed(6);
      });
      document.querySelectorAll("[data-map-field]").forEach(function (button) {
        button.disabled = false;
        button.addEventListener("click", function () {
          setTarget(button.dataset.mapField, true);
        });
      });
      confirm.addEventListener("click", async function () {
        const point = map.getCenter().toJSON();
        const field = fields[activeField];
        const version = ++revision;
        const fieldVersion = ++field.revision;
        confirm.disabled = true;
        resolving = true;
        let label = "Map pin: " + point.lat.toFixed(6) + ", " + point.lng.toFixed(6);
        try {
          const response = await Promise.race([
            geocoder.geocode({location: point}),
            new Promise(function (_, reject) { setTimeout(function () { reject(new Error("Geocoding timed out")); }, 5000); })
          ]);
          if (response.results && response.results[0]) label = response.results[0].formatted_address;
        } catch (_) { /* Exact coordinates remain usable without a named address. */ }
        if (version !== revision) return;
        if (fieldVersion !== field.revision) { confirm.disabled = false; resolving = false; return; }
        select(field, point, label);
        resolving = false;
        confirm.disabled = false;
        if (activeField === "pickup" && !coordinates(fields.dropoff)) {
          setTarget("dropoff", false);
          status.textContent = "Pickup saved. Now position the pin for your destination and confirm it.";
        } else {
          status.textContent = "Location saved. You can adjust either pin or continue.";
        }
      });
      status.textContent = "Search Google Maps or choose an exact point on the map.";
      try {
        const places = await google.maps.importLibrary("places");
        Object.keys(fields).forEach(function (name) {
          const field = fields[name];
          const search = new places.PlaceAutocompleteElement({
            includedRegionCodes: ["ng"],
            requestedRegion: "ng",
            locationBias: searchBias
          });
          searches.push(search);
          search.id = "lm-" + name + "-google";
          search.setAttribute("aria-label", name === "pickup" ? "Search pickup location" : "Search destination");
          document.querySelector('label[for="lm-' + name + '"]').htmlFor = search.id;
          document.getElementById("lm-" + name + "-search").appendChild(search);
          search.addEventListener("input", function () {
            field.revision++;
            field.input.value = field.lat.value = field.lng.value = "";
            field.selected.textContent = "Select a search result or choose a point on the map.";
          });
          search.addEventListener("gmp-error", function () {
            status.textContent = "Google search is unavailable. You can still choose a location on the map.";
          });
          search.addEventListener("gmp-select", async function (event) {
            const version = ++field.revision;
            try {
              const place = event.placePrediction.toPlace();
              await place.fetchFields({fields: ["displayName", "formattedAddress", "location"]});
              if (version !== field.revision) return;
              if (!place.location) throw new Error("No coordinates");
              setTarget(name, false);
              map.setCenter(place.location);
              map.setZoom(17);
              select(field, place.location.toJSON(), [place.displayName, place.formattedAddress].filter(Boolean).join(", "));
            } catch (_) {
              if (version === field.revision) status.textContent = "Could not select that result. Try again or choose its location on the map.";
            }
          });
        });
      } catch (_) {
        status.textContent = "Google search is unavailable. Choose pickup and destination on the map.";
      }
    } catch (_) {
      const message = "Google Maps could not load. Please refresh or contact support if this continues.";
      status.textContent = message;
      document.getElementById("lm-map-loading").textContent = message;
    }
  }
  initialize();
})();
