(function () {
  "use strict";

  let landingData = null;
  let landingLoaded = false;
  const root = document.getElementById("landing-settings-root");

  function showLandingToast(message, isError) {
    const toast = document.getElementById("settings-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("is-error", Boolean(isError));
    toast.hidden = false;
    clearTimeout(showLandingToast._timer);
    showLandingToast._timer = setTimeout(function () { toast.hidden = true; }, 4000);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function field(label, value, path, type) {
    type = type || "text";
    if (type === "textarea") {
      return (
        '<label class="settings-field"><span>' + escapeHtml(label) + "</span>" +
        '<textarea data-path="' + escapeHtml(path) + '" rows="3">' + escapeHtml(value || "") + "</textarea></label>"
      );
    }
    const attrs = type === "number" ? ' type="number"' : ' type="text"';
    return (
      '<label class="settings-field"><span>' + escapeHtml(label) + "</span>" +
      '<div><input data-path="' + escapeHtml(path) + '"' + attrs + ' value="' + escapeHtml(value == null ? "" : value) + '"></div></label>'
    );
  }

  function section(title, subtitle, body) {
    return (
      '<article class="dash-card settings-card landing-settings__section">' +
      '<h2 class="settings-card__title">' + escapeHtml(title) + "</h2>" +
      (subtitle ? '<p class="settings-card__sub">' + escapeHtml(subtitle) + "</p>" : "") +
      '<div class="settings-fields">' + body + "</div></article>"
    );
  }

  function listEditor(path, items, fields, addLabel) {
    return (
      '<div class="settings-fields landing-list" data-list-path="' + escapeHtml(path) + '">' +
        (items || []).map(function (item, index) {
          return (
            '<div class="landing-list__item" data-index="' + index + '">' +
            fields.map(function (f) {
              return field(f.label, item[f.key], path + "." + index + "." + f.key, f.type);
            }).join("") +
            '<button type="button" class="landing-list__remove" data-list="' + escapeHtml(path) + '" data-index="' + index + '">Remove</button></div>'
          );
        }).join("") +
        '<button type="button" class="landing-list__add" data-list="' + escapeHtml(path) + '" data-template="' +
        escapeHtml(JSON.stringify(fields.reduce(function (acc, f) { acc[f.key] = ""; return acc; }, {}))) +
        '">' + escapeHtml(addLabel || "Add item") + "</button></div>"
    );
  }

  function pricingTierEditor(tiers) {
    return tiers.map(function (tier, index) {
      return (
        '<div class="landing-list__item" data-pricing-index="' + index + '">' +
        field("Tier name", tier.name, "pricing_section.tiers." + index + ".name") +
        field("Price per km (₦)", tier.price_per_km, "pricing_section.tiers." + index + ".price_per_km", "number") +
        field("Description", tier.description, "pricing_section.tiers." + index + ".description", "textarea") +
        field("Features (comma-separated)", (tier.features || []).join(", "), "pricing_section.tiers." + index + ".features_csv") +
        field("CTA label", tier.cta_label, "pricing_section.tiers." + index + ".cta_label") +
        field("Badge (optional)", tier.badge || "", "pricing_section.tiers." + index + ".badge") +
        '<label class="settings-field settings-field--inline"><span>Featured tier</span><input type="checkbox" data-path="pricing_section.tiers.' + index + '.featured"' + (tier.featured ? " checked" : "") + "></label>" +
        "</div>"
      );
    }).join("");
  }

  function renderEditor(data) {
    if (!root) return;
    landingData = data;
    const h = data.hero || {};
    const html = [
      section("Hero", "Main headline and mockup card.", [
        field("Badge", h.badge, "hero.badge"),
        field("Title prefix", h.title_prefix, "hero.title_prefix"),
        field("Title accent", h.title_accent, "hero.title_accent"),
        field("Subtitle", h.subtitle, "hero.subtitle", "textarea"),
        field("Primary CTA", h.primary_cta_label, "hero.primary_cta_label"),
        field("Secondary CTA", h.secondary_cta_label, "hero.secondary_cta_label"),
        field("Watch link label", h.watch_label, "hero.watch_label"),
        field("Watch link URL", h.watch_href, "hero.watch_href"),
        field("Trust — reviews", h.trust_reviews, "hero.trust_reviews"),
        field("Trust — verified", h.trust_verified, "hero.trust_verified"),
        field("Trust — support", h.trust_support, "hero.trust_support"),
        field("Mockup pickup", h.mockup_pickup, "hero.mockup_pickup"),
        field("Mockup destination", h.mockup_destination, "hero.mockup_destination"),
        field("Mockup pickup time", h.mockup_pickup_time, "hero.mockup_pickup_time"),
        field("Mockup pickup sublabel", h.mockup_pickup_sub, "hero.mockup_pickup_sub"),
        field("Mockup rides (tier|price|active yes/no per line)", (h.mockup_rides || []).map(function (r) {
          return r.tier + "|" + r.price_ngn + "|" + (r.active ? "yes" : "no");
        }).join("\n"), "hero.mockup_rides_text", "textarea"),
        field("Driver initials", h.mockup_driver_initials, "hero.mockup_driver_initials"),
        field("Driver name", h.mockup_driver_name, "hero.mockup_driver_name"),
        field("Driver vehicle", h.mockup_driver_vehicle, "hero.mockup_driver_vehicle"),
        field("Driver rating", h.mockup_driver_rating, "hero.mockup_driver_rating"),
        field("Driver ETA", h.mockup_driver_eta, "hero.mockup_driver_eta"),
      ].join("")),
      section("Partners", null, [
        field("Label", data.partners.label, "partners.label"),
        field("Partner names (one per line)", (data.partners.items || []).join("\n"), "partners.items_text", "textarea"),
      ].join("")),
      section("Features section", null, [
        field("Eyebrow", data.features_section.eyebrow, "features_section.eyebrow"),
        field("Title", data.features_section.title, "features_section.title"),
        field("Subtitle", data.features_section.subtitle, "features_section.subtitle", "textarea"),
      ].join("") + listEditor("features_section.items", data.features_section.items || [], [
        { key: "title", label: "Title" },
        { key: "description", label: "Description", type: "textarea" },
      ], "Add feature")),
      section("How it works", null, [
        field("Eyebrow", data.how_it_works.eyebrow, "how_it_works.eyebrow"),
        field("Title", data.how_it_works.title, "how_it_works.title"),
      ].join("") + listEditor("how_it_works.steps", data.how_it_works.steps || [], [
        { key: "title", label: "Step title" },
        { key: "description", label: "Description", type: "textarea" },
      ], "Add step")),
      section("Audience cards", null, [
        field("Rider eyebrow", data.audience.rider_eyebrow, "audience.rider_eyebrow"),
        field("Rider title", data.audience.rider_title, "audience.rider_title"),
        field("Rider bullets (one per line)", (data.audience.rider_bullets || []).join("\n"), "audience.rider_bullets_text", "textarea"),
        field("Rider CTA", data.audience.rider_cta_label, "audience.rider_cta_label"),
        field("Driver eyebrow", data.audience.driver_eyebrow, "audience.driver_eyebrow"),
        field("Driver title", data.audience.driver_title, "audience.driver_title"),
        field("Driver description", data.audience.driver_description, "audience.driver_description", "textarea"),
        field("Driver CTA", data.audience.driver_cta_label, "audience.driver_cta_label"),
        field("Driver stats (value|label per line)", (data.audience.driver_stats || []).map(function (s) { return s.value + "|" + s.label; }).join("\n"), "audience.driver_stats_text", "textarea"),
      ].join("")),
      section("Platform stats", null, [
        field("Stats (value|label per line)", (data.stats || []).map(function (s) { return s.value + "|" + s.label; }).join("\n"), "stats_text", "textarea"),
      ].join("")),
      section("Cities", null, [
        field("Eyebrow", data.cities_section.eyebrow, "cities_section.eyebrow"),
        field("Title", data.cities_section.title, "cities_section.title"),
        field("Subtitle", data.cities_section.subtitle, "cities_section.subtitle", "textarea"),
        field("Cities (one per line)", (data.cities_section.cities || []).join("\n"), "cities_section.cities_text", "textarea"),
      ].join("")),
      section("Pricing", null, [
        field("Eyebrow", data.pricing_section.eyebrow, "pricing_section.eyebrow"),
        field("Title", data.pricing_section.title, "pricing_section.title"),
        field("Subtitle", data.pricing_section.subtitle, "pricing_section.subtitle", "textarea"),
        field("Footnote", data.pricing_section.footnote, "pricing_section.footnote", "textarea"),
        pricingTierEditor(data.pricing_section.tiers || []),
      ].join("")),
      section("Testimonials", null, [
        field("Eyebrow", data.testimonials_section.eyebrow, "testimonials_section.eyebrow"),
        field("Title", data.testimonials_section.title, "testimonials_section.title"),
      ].join("") + listEditor("testimonials_section.items", data.testimonials_section.items || [], [
        { key: "quote", label: "Quote", type: "textarea" },
        { key: "initials", label: "Initials" },
        { key: "name", label: "Name" },
        { key: "role", label: "Role" },
      ], "Add testimonial")),
      section("FAQ", null, [
        field("Eyebrow", data.faq_section.eyebrow, "faq_section.eyebrow"),
        field("Title", data.faq_section.title, "faq_section.title"),
      ].join("") + listEditor("faq_section.items", data.faq_section.items || [], [
        { key: "question", label: "Question" },
        { key: "answer", label: "Answer", type: "textarea" },
      ], "Add FAQ")),
      section("CTA banner", "Your next ride is one tap away.", [
        field("Title", data.cta.title, "cta.title"),
        field("Subtitle", data.cta.subtitle, "cta.subtitle", "textarea"),
        field("Primary button", data.cta.primary_label, "cta.primary_label"),
        field("Secondary button", data.cta.secondary_label, "cta.secondary_label"),
        field("Stats (value|label per line)", (data.cta.stats || []).map(function (s) { return s.value + "|" + s.label; }).join("\n"), "cta.stats_text", "textarea"),
      ].join("")),
    ].join("");

    root.innerHTML = html;
    bindListHandlers();
  }

  function setPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!cur[key]) cur[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function parseLines(text) {
    return String(text || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
  }

  function parseStats(text) {
    return parseLines(text).map(function (line) {
      const parts = line.split("|");
      return { value: (parts[0] || "").trim(), label: (parts[1] || "").trim() };
    }).filter(function (s) { return s.value && s.label; });
  }

  function parseMockupRides(text) {
    return parseLines(text).map(function (line) {
      const parts = line.split("|");
      const activeRaw = (parts[2] || "").trim().toLowerCase();
      return {
        tier: (parts[0] || "").trim(),
        price_ngn: Number((parts[1] || "0").trim()) || 0,
        active: activeRaw === "yes" || activeRaw === "true" || activeRaw === "1",
      };
    }).filter(function (ride) { return ride.tier; });
  }

  function collectLanding() {
    const data = JSON.parse(JSON.stringify(landingData || {}));
    root.querySelectorAll("[data-path]").forEach(function (el) {
      const path = el.getAttribute("data-path");
      let value;
      if (el.type === "checkbox") value = el.checked;
      else if (el.type === "number") value = Number(el.value || 0);
      else value = el.value;
      if (path.endsWith(".features_csv")) {
        const tierPath = path.replace(".features_csv", ".features");
        setPath(data, tierPath, String(value).split(",").map(function (v) { return v.trim(); }).filter(Boolean));
        return;
      }
      setPath(data, path, value);
    });

    const partnersText = root.querySelector('[data-path="partners.items_text"]');
    if (partnersText) data.partners.items = parseLines(partnersText.value);

    const riderBullets = root.querySelector('[data-path="audience.rider_bullets_text"]');
    if (riderBullets) data.audience.rider_bullets = parseLines(riderBullets.value);

    const driverStats = root.querySelector('[data-path="audience.driver_stats_text"]');
    if (driverStats) data.audience.driver_stats = parseStats(driverStats.value);

    const statsText = root.querySelector('[data-path="stats_text"]');
    if (statsText) data.stats = parseStats(statsText.value);

    const citiesText = root.querySelector('[data-path="cities_section.cities_text"]');
    if (citiesText) data.cities_section.cities = parseLines(citiesText.value);

    const ctaStats = root.querySelector('[data-path="cta.stats_text"]');
    if (ctaStats) data.cta.stats = parseStats(ctaStats.value);

    const mockupRides = root.querySelector('[data-path="hero.mockup_rides_text"]');
    if (mockupRides) data.hero.mockup_rides = parseMockupRides(mockupRides.value);

    if (data.pricing_section && data.pricing_section.tiers) {
      data.pricing_section.tiers.forEach(function (tier) {
        delete tier.features_csv;
      });
    }

    delete data.partners.items_text;
    delete data.audience.rider_bullets_text;
    delete data.audience.driver_stats_text;
    delete data.stats_text;
    delete data.cities_section.cities_text;
    delete data.cta.stats_text;
    delete data.hero.mockup_rides_text;

    return data;
  }

  function bindListHandlers() {
    root.querySelectorAll(".landing-list__add").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const path = btn.getAttribute("data-list");
        const parts = path.split(".");
        let list = landingData;
        parts.forEach(function (p) { list = list[p]; });
        const template = JSON.parse(btn.getAttribute("data-template") || "{}");
        list.push(template);
        renderEditor(landingData);
      });
    });
    root.querySelectorAll(".landing-list__remove").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const path = btn.getAttribute("data-list");
        const index = Number(btn.getAttribute("data-index"));
        const parts = path.split(".");
        let list = landingData;
        parts.forEach(function (p) { list = list[p]; });
        list.splice(index, 1);
        renderEditor(landingData);
      });
    });
  }

  function apiRequest(url, options) {
    return fetch(url, options).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.message || body.detail || "Request failed");
        return body;
      });
    });
  }

  function loadLanding() {
    landingLoaded = false;
    return apiRequest("/admin/api/settings/landing-page").then(function (data) {
      renderEditor(data);
      landingLoaded = true;
    });
  }

  function saveLanding() {
    if (!landingLoaded || !landingData || !root || !root.querySelector("[data-path]")) {
      return Promise.reject(new Error("Landing page content is not loaded yet."));
    }
    return apiRequest("/admin/api/settings/landing-page", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectLanding()),
    }).then(function (data) {
      renderEditor(data);
      landingLoaded = true;
      return data;
    });
  }

  window.LandingSettings = {
    load: loadLanding,
    save: saveLanding,
    isLandingTabActive: function () {
      const panel = document.getElementById("settings-landing-panel");
      return panel && !panel.hidden;
    },
  };

  document.addEventListener("DOMContentLoaded", function () {
    if (root) {
      loadLanding().catch(function (err) {
        showLandingToast(err.message || "Could not load landing page settings.", true);
      });
    }
  });
})();
