(function () {
  "use strict";

  var cfg = {};
  var configEl = document.getElementById("josride-maps-config");
  if (configEl) {
    try {
      cfg = JSON.parse(configEl.textContent || "{}") || {};
    } catch (err) {
      cfg = {};
    }
  }

  var apiKey = String(cfg.googleMapsApiKey || "").trim();
  var googleLoadPromise = null;
  var googleLoadFailed = false;

  // Keep Google looking like Google (standard tiles). Avoid heavy custom styles
  // that make it indistinguishable from Leaflet/CARTO dark basemaps.
  var DARK_STYLES = [];

  function isDark() {
    var root = document.documentElement;
    var manualTheme = root.getAttribute("data-user-theme") || root.getAttribute("data-theme");
    if (manualTheme === "dark") return true;
    if (manualTheme === "light") return false;
    return Boolean(
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  function cartoUrl() {
    return isDark()
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  }

  function loadGoogle() {
    if (!apiKey) {
      return Promise.reject(new Error("Google Maps API key missing"));
    }
    if (window.google && window.google.maps) {
      googleLoadFailed = false;
      return Promise.resolve(window.google.maps);
    }
    if (googleLoadPromise) {
      return googleLoadPromise;
    }

    googleLoadPromise = new Promise(function (resolve, reject) {
      var settled = false;
      var callbackName = "__josrideGoogleMapsInit";

      function fail(err) {
        if (settled) return;
        settled = true;
        googleLoadFailed = true;
        googleLoadPromise = null; // allow retry on next createSurface()
        reject(err instanceof Error ? err : new Error(String(err || "Google Maps failed")));
      }

      function ok() {
        if (settled) return;
        settled = true;
        googleLoadFailed = false;
        if (window.google && window.google.maps) {
          resolve(window.google.maps);
        } else {
          fail(new Error("Google Maps failed to initialize"));
        }
      }

      window[callbackName] = function () {
        try {
          delete window[callbackName];
        } catch (err) {
          window[callbackName] = undefined;
        }
        ok();
      };

      window.gm_authFailure = function () {
        fail(new Error("Google Maps authentication failed (check API key / HTTP referrer restrictions)"));
      };

      // Drop libraries=geometry — not required for Map/Directions and can block load.
      var script = document.createElement("script");
      script.async = true;
      script.defer = true;
      script.src =
        "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(apiKey) +
        "&v=weekly&callback=" +
        callbackName;
      script.onerror = function () {
        fail(new Error("Google Maps script failed to load"));
      };
      document.head.appendChild(script);
    });

    return googleLoadPromise;
  }

  function latLngLiteral(point) {
    if (!point) return null;
    if (Array.isArray(point)) {
      return { lat: Number(point[0]), lng: Number(point[1]) };
    }
    return { lat: Number(point.lat), lng: Number(point.lng) };
  }

  function createGoogleSurface(el, options) {
    var opts = options || {};
    var center = latLngLiteral(opts.center) || { lat: 6.5244, lng: 3.3792 };
    var zoom = opts.zoom || 13;
    var overlays = [];
    var mapOptions = {
      center: center,
      zoom: zoom,
      disableDefaultUI: true,
      zoomControl: opts.zoomControl !== false,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
      gestureHandling: opts.interactive === false ? "none" : "greedy",
      clickableIcons: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeId: "roadmap",
    };
    // Prefer native Google dark color scheme when available (still clearly Google Maps).
    if (isDark() && google.maps.ColorScheme) {
      mapOptions.colorScheme = google.maps.ColorScheme.DARK;
    }
    var map = new google.maps.Map(el, mapOptions);
    try {
      el.setAttribute("data-map-provider", "google");
    } catch (err) {
      /* ignore */
    }

    function track(overlay) {
      overlays.push(overlay);
      return overlay;
    }

    return {
      provider: "google",
      map: map,
      setView: function (lat, lng, nextZoom) {
        map.setCenter({ lat: lat, lng: lng });
        if (nextZoom != null) map.setZoom(nextZoom);
      },
      clearOverlays: function () {
        overlays.forEach(function (overlay) {
          if (overlay && typeof overlay.setMap === "function") {
            overlay.setMap(null);
          }
        });
        overlays = [];
      },
      addCircleMarker: function (lat, lng, style) {
        style = style || {};
        return track(
          new google.maps.Marker({
            map: map,
            position: { lat: lat, lng: lng },
            title: style.title || "",
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: style.radius || 7,
              fillColor: style.fillColor || "#0d6b38",
              fillOpacity: style.fillOpacity == null ? 0.92 : style.fillOpacity,
              strokeColor: style.color || "#0a4f2a",
              strokeWeight: style.weight == null ? 2 : style.weight,
            },
            zIndex: style.zIndex || 1,
          })
        );
      },
      addHtmlMarker: function (lat, lng, html, style) {
        style = style || {};
        var size = style.size || [24, 24];
        var anchor = style.anchor || [size[0] / 2, size[1] / 2];
        var marker = new google.maps.Marker({
          map: map,
          position: { lat: lat, lng: lng },
          title: style.title || "",
          zIndex: style.zIndex || 1,
          icon: {
            url:
              "data:image/svg+xml;charset=UTF-8," +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="' +
                  size[0] +
                  '" height="' +
                  size[1] +
                  '"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">' +
                  html +
                  "</div></foreignObject></svg>"
              ),
            scaledSize: new google.maps.Size(size[0], size[1]),
            anchor: new google.maps.Point(anchor[0], anchor[1]),
          },
        });
        return track(marker);
      },
      addDomMarker: function (lat, lng, html, style) {
        style = style || {};
        // Prefer a real DOM overlay for rich HTML markers.
        function HtmlOverlay(position, content) {
          this.position = position;
          this.content = content;
        }
        HtmlOverlay.prototype = new google.maps.OverlayView();
        HtmlOverlay.prototype.onAdd = function () {
          var div = document.createElement("div");
          div.style.position = "absolute";
          div.style.transform = "translate(-50%, -50%)";
          div.style.zIndex = String(style.zIndex || 1);
          div.innerHTML = html;
          if (style.title) div.title = style.title;
          this.div = div;
          this.getPanes().overlayMouseTarget.appendChild(div);
        };
        HtmlOverlay.prototype.draw = function () {
          var projection = this.getProjection();
          if (!projection || !this.div) return;
          var point = projection.fromLatLngToDivPixel(this.position);
          if (!point) return;
          this.div.style.left = point.x + "px";
          this.div.style.top = point.y + "px";
        };
        HtmlOverlay.prototype.onRemove = function () {
          if (this.div && this.div.parentNode) {
            this.div.parentNode.removeChild(this.div);
          }
          this.div = null;
        };
        HtmlOverlay.prototype.setMap = function (value) {
          google.maps.OverlayView.prototype.setMap.call(this, value);
        };

        var overlay = new HtmlOverlay(
          new google.maps.LatLng(lat, lng),
          html
        );
        overlay.setMap(map);
        return track(overlay);
      },
      addPolyline: function (path, style) {
        style = style || {};
        var latLngs = (path || []).map(latLngLiteral).filter(Boolean);
        var polyOpts = {
          map: map,
          path: latLngs,
          strokeColor: style.color || "#0a4f2a",
          strokeOpacity: style.opacity == null ? 0.98 : style.opacity,
          strokeWeight: style.weight == null ? 5 : style.weight,
          geodesic: true,
          zIndex: style.zIndex || 1,
        };
        // Approximate Leaflet dashArray with a dotted stroke on Google Maps.
        if (style.dashArray) {
          polyOpts.icons = [
            {
              icon: {
                path: "M 0,-1 0,1",
                strokeOpacity: style.opacity == null ? 0.98 : style.opacity,
                strokeWeight: style.weight == null ? 5 : style.weight,
                scale: 1,
              },
              offset: "0",
              repeat: "14px",
            },
          ];
          polyOpts.strokeOpacity = 0;
        }
        return track(new google.maps.Polyline(polyOpts));
      },
      addCircle: function (lat, lng, radiusM, style) {
        style = style || {};
        return track(
          new google.maps.Circle({
            map: map,
            center: { lat: lat, lng: lng },
            radius: radiusM,
            strokeColor: style.color || "#0a4f2a",
            strokeOpacity: style.opacity == null ? 0.35 : style.opacity,
            strokeWeight: style.weight == null ? 2 : style.weight,
            fillColor: style.fillColor || style.color || "#0a4f2a",
            fillOpacity: style.fillOpacity == null ? 0.08 : style.fillOpacity,
          })
        );
      },
      fitBounds: function (points, fitOpts) {
        fitOpts = fitOpts || {};
        var bounds = new google.maps.LatLngBounds();
        var count = 0;
        (points || []).forEach(function (point) {
          var ll = latLngLiteral(point);
          if (!ll || Number.isNaN(ll.lat) || Number.isNaN(ll.lng)) return;
          bounds.extend(ll);
          count += 1;
        });
        if (!count) return;
        map.fitBounds(bounds, fitOpts.padding == null ? 48 : fitOpts.padding);
        if (fitOpts.maxZoom != null) {
          var listener = google.maps.event.addListenerOnce(map, "idle", function () {
            if (map.getZoom() > fitOpts.maxZoom) {
              map.setZoom(fitOpts.maxZoom);
            }
          });
          return listener;
        }
      },
      invalidateSize: function () {
        google.maps.event.trigger(map, "resize");
      },
      destroy: function () {
        this.clearOverlays();
        el.innerHTML = "";
      },
    };
  }

  function createLeafletSurface(el, options) {
    var opts = options || {};
    if (typeof L === "undefined") {
      throw new Error("Leaflet is not available");
    }
    var center = latLngLiteral(opts.center) || { lat: 6.5244, lng: 3.3792 };
    var zoom = opts.zoom || 13;
    var overlays = [];
    var map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
    }).setView([center.lat, center.lng], zoom);

    var tileLayer = L.tileLayer(cartoUrl(), { maxZoom: 19 }).addTo(map);
    if (opts.zoomControl !== false) {
      L.control.zoom({ position: "topright" }).addTo(map);
    }

    function track(layer) {
      overlays.push(layer);
      return layer;
    }

    return {
      provider: "leaflet",
      map: map,
      tileLayer: tileLayer,
      setView: function (lat, lng, nextZoom) {
        map.setView([lat, lng], nextZoom == null ? map.getZoom() : nextZoom);
      },
      clearOverlays: function () {
        overlays.forEach(function (layer) {
          map.removeLayer(layer);
        });
        overlays = [];
      },
      addCircleMarker: function (lat, lng, style) {
        style = style || {};
        var marker = L.circleMarker([lat, lng], {
          radius: style.radius || 7,
          color: style.color || "#0a4f2a",
          fillColor: style.fillColor || "#0d6b38",
          fillOpacity: style.fillOpacity == null ? 0.92 : style.fillOpacity,
          weight: style.weight == null ? 2 : style.weight,
        });
        if (style.title) {
          marker.bindTooltip(style.title, { direction: "top", offset: [0, -6] });
        }
        marker.addTo(map);
        return track(marker);
      },
      addDomMarker: function (lat, lng, html, style) {
        style = style || {};
        var size = style.size || [24, 24];
        var anchor = style.anchor || [size[0] / 2, size[1] / 2];
        var marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "",
            html: html,
            iconSize: size,
            iconAnchor: anchor,
          }),
          zIndexOffset: style.zIndex || 0,
        });
        if (style.title) {
          marker.bindTooltip(style.title, { direction: "top", offset: [0, -8] });
        }
        marker.addTo(map);
        return track(marker);
      },
      addHtmlMarker: function (lat, lng, html, style) {
        return this.addDomMarker(lat, lng, html, style);
      },
      addPolyline: function (path, style) {
        style = style || {};
        var latLngs = (path || []).map(function (point) {
          var ll = latLngLiteral(point);
          return [ll.lat, ll.lng];
        });
        var line = L.polyline(latLngs, {
          color: style.color || "#0a4f2a",
          weight: style.weight == null ? 5 : style.weight,
          opacity: style.opacity == null ? 0.98 : style.opacity,
          dashArray: style.dashArray || null,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }).addTo(map);
        return track(line);
      },
      addCircle: function (lat, lng, radiusM, style) {
        style = style || {};
        var circle = L.circle([lat, lng], {
          radius: radiusM,
          color: style.color || "#0a4f2a",
          weight: style.weight == null ? 2 : style.weight,
          opacity: style.opacity == null ? 0.35 : style.opacity,
          fillColor: style.fillColor || style.color || "#0a4f2a",
          fillOpacity: style.fillOpacity == null ? 0.08 : style.fillOpacity,
          dashArray: style.dashArray || null,
        }).addTo(map);
        return track(circle);
      },
      fitBounds: function (points, fitOpts) {
        fitOpts = fitOpts || {};
        var bounds = L.latLngBounds([]);
        var count = 0;
        (points || []).forEach(function (point) {
          var ll = latLngLiteral(point);
          if (!ll || Number.isNaN(ll.lat) || Number.isNaN(ll.lng)) return;
          bounds.extend([ll.lat, ll.lng]);
          count += 1;
        });
        if (!count || !bounds.isValid()) return;
        map.fitBounds(bounds, {
          padding: Array.isArray(fitOpts.padding)
            ? fitOpts.padding
            : [fitOpts.padding || 48, fitOpts.padding || 48],
          maxZoom: fitOpts.maxZoom,
        });
      },
      invalidateSize: function () {
        map.invalidateSize();
      },
      setTileTheme: function () {
        tileLayer.setUrl(cartoUrl());
      },
      destroy: function () {
        this.clearOverlays();
        map.remove();
      },
    };
  }

  function createLeafletSurfaceSafe(el, options) {
    var surface = createLeafletSurface(el, options);
    try {
      el.setAttribute("data-map-provider", "leaflet");
    } catch (err) {
      /* ignore */
    }
    return surface;
  }

  function createSurface(el, options) {
    var opts = options || {};
    // Google is the default whenever EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is present.
    var preferGoogle = opts.preferGoogle !== false;
    if (!el) {
      return Promise.reject(new Error("Map element missing"));
    }
    if (apiKey && preferGoogle) {
      return loadGoogle()
        .then(function () {
          return createGoogleSurface(el, opts);
        })
        .catch(function (err) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn("[JosRideMaps] Google Maps failed; Leaflet fallback.", err && err.message ? err.message : err);
          }
          if (opts.allowLeafletFallback === false) {
            throw err;
          }
          if (typeof L === "undefined") {
            // Leaflet may still be loading (defer). Let caller retry.
            throw err;
          }
          return createLeafletSurfaceSafe(el, opts);
        });
    }
    if (typeof L === "undefined") {
      return Promise.reject(new Error("No map provider available (missing Google key and Leaflet)"));
    }
    return Promise.resolve(createLeafletSurfaceSafe(el, opts));
  }

  window.JosRideMaps = {
    apiKey: apiKey,
    hasGoogle: Boolean(apiKey),
    preferGoogle: Boolean(apiKey),
    providerDefault: apiKey ? "google" : "leaflet",
    loadFailed: function () {
      return googleLoadFailed;
    },
    isDark: isDark,
    cartoUrl: cartoUrl,
    tileLayerUrl: cartoUrl,
    loadGoogle: loadGoogle,
    createSurface: createSurface,
    darkMapStyles: DARK_STYLES,
  };
})();
