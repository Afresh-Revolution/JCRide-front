(function (global) {
  "use strict";

  var STORAGE_KEY = "josride_user_theme";
  var VALID = { light: true, dark: true, system: true };

  function systemDark() {
    return Boolean(global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function readPreference() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (VALID[saved]) return saved;
    } catch (err) {}
    return "system";
  }

  function resolve(preference) {
    if (preference === "dark" || preference === "light") return preference;
    return systemDark() ? "dark" : "light";
  }

  function apply(preference) {
    var pref = VALID[preference] ? preference : "system";
    var resolved = resolve(pref);
    var root = document.documentElement;
    root.setAttribute("data-user-theme", resolved);
    root.setAttribute("data-theme-pref", pref);
    root.style.colorScheme = resolved;
    syncUi(pref, resolved);
    try {
      global.dispatchEvent(
        new CustomEvent("josride:themechange", { detail: { preference: pref, resolved: resolved } })
      );
    } catch (err) {}
    return { preference: pref, resolved: resolved };
  }

  function setPreference(preference) {
    var pref = VALID[preference] ? preference : "system";
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch (err) {}
    return apply(pref);
  }

  function syncUi(preference, resolved) {
    document.querySelectorAll("[data-theme-option]").forEach(function (btn) {
      var selected = btn.getAttribute("data-theme-option") === preference;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-checked", selected ? "true" : "false");
    });
    document.querySelectorAll("[data-theme-note]").forEach(function (note) {
      var using = resolved === "dark" ? "dark" : "light";
      note.textContent =
        "Currently using " +
        using +
        " colors" +
        (preference === "system" ? " (from your device)" : "") +
        ".";
    });
  }

  function bindUi() {
    document.querySelectorAll("[data-theme-option]").forEach(function (btn) {
      if (btn.getAttribute("data-theme-bound") === "1") return;
      btn.setAttribute("data-theme-bound", "1");
      btn.addEventListener("click", function () {
        setPreference(btn.getAttribute("data-theme-option"));
      });
    });
  }

  apply(readPreference());
  bindUi();

  if (global.matchMedia) {
    var mq = global.matchMedia("(prefers-color-scheme: dark)");
    var onScheme = function () {
      if (readPreference() === "system") apply("system");
    };
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onScheme);
    else if (typeof mq.addListener === "function") mq.addListener(onScheme);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUi);
  }

  global.JosRideTheme = {
    getPreference: readPreference,
    getResolved: function () {
      return resolve(readPreference());
    },
    setPreference: setPreference,
    apply: apply,
  };
})(window);
