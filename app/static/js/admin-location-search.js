(function () {
  "use strict";
  const input = document.getElementById("fixed-destination-location");
  const list = document.getElementById("fixed-location-options");
  const status = document.getElementById("fixed-location-status");
  if (!input || !list || !status) return;
  let version = 0, timer, items = [], active = -1, selected = "";

  async function searchGooglePlaces(query) {
    if (!window.JosRideMaps || !window.JosRideMaps.hasGoogle) {
      throw new Error("Google location search needs the website's Google Maps API key. Configure EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and enable Places API (New).");
    }
    const maps = await window.JosRideMaps.loadGoogle();
    const places = await maps.importLibrary("places");
    const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      includedRegionCodes: ["ng"],
      locationBias: { center: { lat: 9.8965, lng: 8.8583 }, radius: 50000 },
      language: "en",
      region: "ng",
    });
    return (response.suggestions || []).filter(function (suggestion) {
      return Boolean(suggestion.placePrediction);
    }).map(function (suggestion) {
      const prediction = suggestion.placePrediction;
      return {
        label: prediction.text.toString(),
        name: prediction.mainText ? prediction.mainText.toString() : prediction.text.toString().split(",")[0],
      };
    });
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }
  function choose(index) {
    const item = items[index];
    if (!item) return;
    // Store the place name so mobile addresses with different formatting still match.
    const name = String(item.name || item.label).trim();
    if (name.length > 200) { status.textContent = "Choose a location with a shorter name."; return; }
    selected = name;
    input.value = name;
    status.textContent = "Selected: " + item.label;
    version += 1;
    clearTimeout(timer);
    close();
  }
  async function search(query, requestVersion) {
    try {
      const results = await searchGooglePlaces(query);
      if (requestVersion !== version) return;
      items = results;
      list.replaceChildren();
      items.forEach(function (item, index) {
        const option = document.createElement("li");
        option.id = "fixed-location-option-" + index;
        option.role = "option";
        option.setAttribute("aria-selected", "false");
        option.textContent = item.label;
        option.addEventListener("mousedown", function (event) { event.preventDefault(); });
        option.addEventListener("click", function () { choose(index); input.focus(); });
        list.appendChild(option);
      });
      list.hidden = !items.length;
      input.setAttribute("aria-expanded", String(Boolean(items.length)));
      status.textContent = items.length ? "Select a location below." : "No Google Maps locations found. Try the place name with its city, for example Tamarald Events Centre Jos.";
    } catch (error) {
      if (requestVersion !== version) return;
      close();
      status.textContent = !window.JosRideMaps || !window.JosRideMaps.hasGoogle
        ? error.message
        : "Google location search is unavailable. Check that Places API (New) is enabled, billing is active, and the Maps key allows this website, then retry.";
    }
  }
  input.addEventListener("input", function () {
    selected = "";
    version += 1;
    clearTimeout(timer);
    close();
    const query = input.value.trim();
    status.textContent = query.length < 2 ? "Type at least two characters to search the map." : "Searching the map…";
    if (query.length >= 2) {
      const requestVersion = version;
      timer = setTimeout(function () { search(query, requestVersion); }, 350);
    }
  });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { version += 1; clearTimeout(timer); close(); return; }
    if (list.hidden) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      Array.from(list.children).forEach(function (option, index) { option.setAttribute("aria-selected", String(index === active)); });
      input.setAttribute("aria-activedescendant", list.children[active].id);
      list.children[active].scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0) choose(active);
    }
  });
  document.addEventListener("click", function (event) {
    if (!input.parentElement.contains(event.target)) { version += 1; clearTimeout(timer); close(); }
  });
  window.AdminLocationSearch = {
    loaded: function (value) { selected = value; version += 1; clearTimeout(timer); close(); status.textContent = value ? "Saved destination: " + value : ""; },
    isSelected: function () { return Boolean(selected) && selected === input.value.trim(); },
  };
})();
