(function (global) {
  "use strict";

  var CALL_ALLOWED_STATUSES = ["accepted", "driver_arrived", "in_progress"];
  var CALL_EVENTS = [
    "incoming_call",
    "call_answered",
    "call_rejected",
    "call_cancelled",
    "call_ended",
  ];

  var options = null;
  var rideId = "";
  var rideStatus = "";
  var userId = "";
  var peerLabel = "";
  var apiPost = null;
  var callButton = null;
  var domBound = false;

  var root = null;
  var titleEl = null;
  var statusEl = null;
  var timerEl = null;
  var incomingActions = null;
  var outgoingActions = null;
  var activeActions = null;
  var acceptBtn = null;
  var rejectBtn = null;
  var cancelBtn = null;
  var endBtn = null;
  var muteBtn = null;
  var audioHost = null;

  var room = null;
  var activeCall = null;
  var phase = "idle";
  var muted = false;
  var timerInterval = null;
  var connectedAt = null;
  var busy = false;
  var ending = false;

  function decodeJwtSub(token) {
    if (!token || typeof token !== "string") return "";
    var parts = token.split(".");
    if (parts.length < 2) return "";
    try {
      var base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      var padded = base64 + "===".slice((base64.length + 3) % 4);
      var json = global.atob(padded);
      var payload = JSON.parse(json);
      return normalizeId(payload.sub || payload.user_id || payload.id);
    } catch (err) {
      return "";
    }
  }

  function getLiveKit() {
    return global.LivekitClient || global.LiveKit || global.livekit || null;
  }

  function waitForLiveKit(attempt) {
    attempt = attempt || 0;
    if (getLiveKit()) return Promise.resolve(getLiveKit());
    if (attempt >= 80) {
      return Promise.reject(new Error("LiveKit client failed to load. Check your network and refresh."));
    }
    return new Promise(function (resolve, reject) {
      global.setTimeout(function () {
        waitForLiveKit(attempt + 1).then(resolve).catch(reject);
      }, 50);
    });
  }

  function normalizeId(value) {
    return value == null ? "" : String(value);
  }

  function callUrl(suffix) {
    return options.apiBase + "/" + encodeURIComponent(rideId) + suffix;
  }

  function unwrapPayload(message) {
    if (!message || typeof message !== "object") return {};
    return message.payload || message.data || message;
  }

  function unwrapCall(payload) {
    if (!payload || typeof payload !== "object") return null;
    return payload.call || payload;
  }

  function isAudioTrack(track) {
    if (!track) return false;
    var LivekitClient = getLiveKit();
    var audioKind =
      LivekitClient && LivekitClient.Track && LivekitClient.Track.Kind
        ? LivekitClient.Track.Kind.Audio
        : "audio";
    return track.kind === audioKind || track.kind === "audio";
  }

  function isReceiver(call) {
    if (!call) return false;
    if (userId) return normalizeId(call.receiver_id) === userId;
    if (phase === "outgoing" || phase === "connecting" || phase === "active") return false;
    return phase === "idle" || phase === "incoming";
  }

  function isCaller(call) {
    if (!call) return false;
    if (userId) return normalizeId(call.caller_id) === userId;
    return phase === "outgoing" || phase === "connecting" || phase === "active";
  }

  function canPlaceCall(status) {
    return CALL_ALLOWED_STATUSES.indexOf(status || rideStatus) >= 0;
  }

  function updateCallButton() {
    if (!callButton) return;
    var allowed = canPlaceCall(rideStatus);
    var inCall = phase !== "idle";
    callButton.hidden = !allowed;
    callButton.disabled = !allowed || inCall || busy;
    callButton.setAttribute("aria-disabled", callButton.disabled ? "true" : "false");
  }

  function formatTimer(totalSeconds) {
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return String(minutes) + ":" + String(seconds).padStart(2, "0");
  }

  function stopTimer() {
    if (timerInterval) {
      global.clearInterval(timerInterval);
      timerInterval = null;
    }
    connectedAt = null;
    if (timerEl) {
      timerEl.hidden = true;
      timerEl.textContent = "";
    }
  }

  function startTimer() {
    if (!timerEl) return;
    stopTimer();
    connectedAt = Date.now();
    timerEl.hidden = false;
    timerEl.textContent = "0:00";
    timerInterval = global.setInterval(function () {
      if (!connectedAt || !timerEl) return;
      var elapsed = Math.max(0, Math.floor((Date.now() - connectedAt) / 1000));
      timerEl.textContent = formatTimer(elapsed);
    }, 1000);
  }

  function setPhase(nextPhase) {
    phase = nextPhase;
    if (root) {
      root.classList.toggle("ride-voice-call--incoming", nextPhase === "incoming");
    }
    if (incomingActions) incomingActions.hidden = nextPhase !== "incoming";
    if (outgoingActions) outgoingActions.hidden = nextPhase !== "outgoing" && nextPhase !== "connecting";
    if (activeActions) activeActions.hidden = nextPhase !== "active";
    updateCallButton();
  }

  function showOverlay(show) {
    if (!root) return;
    if (show) {
      root.hidden = false;
      document.body.classList.add("ride-voice-call-open");
    } else {
      root.hidden = true;
      document.body.classList.remove("ride-voice-call-open");
    }
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }

  function setTitle(text) {
    if (titleEl) titleEl.textContent = text || "";
  }

  function resetActionButtons() {
    if (acceptBtn) acceptBtn.disabled = false;
    if (rejectBtn) rejectBtn.disabled = false;
    if (endBtn) endBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    if (muteBtn) {
      muteBtn.disabled = false;
      muteBtn.textContent = "Mute";
      muteBtn.setAttribute("aria-pressed", "false");
    }
  }

  function clearAudio() {
    if (!audioHost) return;
    while (audioHost.firstChild) {
      audioHost.removeChild(audioHost.firstChild);
    }
  }

  function disconnectRoom() {
    clearAudio();
    if (!room) return;
    try {
      room.removeAllListeners();
      room.disconnect();
    } catch (err) {
      /* ignore disconnect errors */
    }
    room = null;
  }

  function resetUi(message) {
    stopTimer();
    disconnectRoom();
    activeCall = null;
    muted = false;
    busy = false;
    ending = false;
    resetActionButtons();
    setPhase("idle");
    showOverlay(false);
    if (message) setStatus(message);
  }

  function notifyError(err, fallback) {
    var message = (err && err.message) || fallback || "Call failed.";
    if (typeof options.onError === "function") {
      options.onError(message);
      return;
    }
    global.alert(message);
  }

  function ensureMicPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("Microphone is not available in this browser."));
    }
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    });
  }

  function attachRemoteAudio(track) {
    if (!audioHost || !isAudioTrack(track)) return;
    var element = track.attach();
    element.setAttribute("data-ride-voice-call", "remote");
    element.autoplay = true;
    element.playsInline = true;
    audioHost.appendChild(element);
    if (typeof element.play === "function") {
      element.play().catch(function () {});
    }
  }

  function subscribeParticipantAudio(participant) {
    if (!participant || !participant.audioTrackPublications) return;
    participant.audioTrackPublications.forEach(function (publication) {
      if (publication.track) attachRemoteAudio(publication.track);
    });
  }

  function connectLiveKit(tokenPayload) {
    if (!tokenPayload || !tokenPayload.livekit_url || !tokenPayload.access_token) {
      return Promise.reject(new Error("Invalid LiveKit token response."));
    }

    return waitForLiveKit().then(function (LivekitClient) {
      disconnectRoom();
      room = new LivekitClient.Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      room.on(LivekitClient.RoomEvent.TrackSubscribed, function (track) {
        attachRemoteAudio(track);
      });

      room.on(LivekitClient.RoomEvent.TrackUnsubscribed, function (track) {
        if (track && typeof track.detach === "function") {
          track.detach().forEach(function (element) {
            if (element && element.parentNode) element.parentNode.removeChild(element);
          });
        }
      });

      room.on(LivekitClient.RoomEvent.ParticipantConnected, function (participant) {
        subscribeParticipantAudio(participant);
      });

      room.on(LivekitClient.RoomEvent.Disconnected, function () {
        clearAudio();
      });

      return room
        .connect(tokenPayload.livekit_url, tokenPayload.access_token, {
          autoSubscribe: true,
        })
        .then(function () {
          return room.localParticipant.setMicrophoneEnabled(true);
        })
        .then(function () {
          muted = false;
          if (muteBtn) muteBtn.setAttribute("aria-pressed", "false");
          room.remoteParticipants.forEach(function (participant) {
            subscribeParticipantAudio(participant);
          });
        });
    });
  }

  function fetchToken() {
    return apiPost(callUrl("/call/token"), {});
  }

  function markConnected() {
    setPhase("active");
    setTitle(peerLabel || "In call");
    setStatus("Connected");
    startTimer();
  }

  function handleAnswered(payload) {
    var call = unwrapCall(payload);
    activeCall = call || activeCall;
    if (phase === "active") return;
    if (isCaller(activeCall)) {
      markConnected();
      return;
    }
    if (phase === "incoming") return;
    markConnected();
  }

  function handleTerminalEvent(statusText) {
    resetUi(statusText);
  }

  function handleIncoming(payload) {
    var call = unwrapCall(payload);
    if (!call) return;
    if (isCaller(call)) {
      activeCall = call;
      return;
    }
    if (!isReceiver(call)) return;
    if (phase !== "idle" && phase !== "incoming") return;

    activeCall = call;
    setPhase("incoming");
    setTitle(peerLabel || "Incoming call");
    setStatus("JC-Ride voice call");
    showOverlay(true);
  }

  function handleRealtimeEvent(type, message) {
    if (CALL_EVENTS.indexOf(type) < 0) return false;
    var payload = unwrapPayload(message);

    if (type === "incoming_call") {
      handleIncoming(payload);
      return true;
    }
    if (type === "call_answered") {
      handleAnswered(payload);
      return true;
    }
    if (type === "call_rejected") {
      handleTerminalEvent("Call declined.");
      return true;
    }
    if (type === "call_cancelled") {
      handleTerminalEvent("Call missed.");
      return true;
    }
    if (type === "call_ended") {
      handleTerminalEvent("Call ended.");
      return true;
    }
    return false;
  }

  function isConflictError(err) {
    var message = String((err && err.message) || "").toLowerCase();
    return message.indexOf("already active") >= 0 || message.indexOf("409") >= 0;
  }

  function startOutgoingCall() {
    if (!rideId || !canPlaceCall(rideStatus) || busy || ending || phase !== "idle") return;
    busy = true;
    updateCallButton();

    ensureMicPermission()
      .then(function () {
        setPhase("outgoing");
        setTitle(peerLabel || "Calling…");
        setStatus("Ringing…");
        showOverlay(true);
        return apiPost(callUrl("/call/start"), {});
      })
      .then(function (call) {
        activeCall = call;
        return fetchToken();
      })
      .then(function (tokenPayload) {
        return connectLiveKit(tokenPayload);
      })
      .then(function () {
        busy = false;
        updateCallButton();
      })
      .catch(function (err) {
        busy = false;
        if (isConflictError(err)) {
          setStatus("A call is already in progress.");
          notifyError(err, "A call is already in progress for this ride.");
          return;
        }
        resetUi();
        notifyError(err, "Could not start call.");
      });
  }

  function acceptIncomingCall() {
    if (phase !== "incoming" || busy || ending) return;
    busy = true;
    if (acceptBtn) acceptBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;

    ensureMicPermission()
      .then(function () {
        setStatus("Connecting…");
        return apiPost(callUrl("/call/accept"), {});
      })
      .then(function (call) {
        activeCall = call || activeCall;
        return fetchToken();
      })
      .then(function (tokenPayload) {
        return connectLiveKit(tokenPayload);
      })
      .then(function () {
        busy = false;
        markConnected();
      })
      .catch(function (err) {
        busy = false;
        resetActionButtons();
        notifyError(err, "Could not accept call.");
      });
  }

  function rejectIncomingCall() {
    if (phase !== "incoming" || ending) return;
    ending = true;
    busy = true;
    apiPost(callUrl("/call/reject"), {})
      .catch(function () {})
      .finally(function () {
        resetUi("Call declined.");
      });
  }

  function endActiveCall() {
    if (phase === "idle" || ending) return;
    ending = true;
    busy = true;
    if (endBtn) endBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    apiPost(callUrl("/call/end"), {})
      .catch(function () {})
      .finally(function () {
        var message = phase === "active" ? "Call ended." : "";
        resetUi(message);
      });
  }

  function toggleMute() {
    if (!room || phase !== "active") return;
    muted = !muted;
    room.localParticipant
      .setMicrophoneEnabled(!muted)
      .then(function () {
        if (muteBtn) {
          muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
          muteBtn.textContent = muted ? "Unmute" : "Mute";
        }
      })
      .catch(function (err) {
        muted = !muted;
        notifyError(err, "Could not change microphone state.");
      });
  }

  function bindDom() {
    root = document.getElementById("ride-voice-call-root");
    if (!root) return false;
    if (domBound) return true;

    titleEl = document.getElementById("ride-voice-call-title");
    statusEl = document.getElementById("ride-voice-call-status");
    timerEl = document.getElementById("ride-voice-call-timer");
    incomingActions = document.getElementById("ride-voice-call-actions-incoming");
    outgoingActions = document.getElementById("ride-voice-call-actions-outgoing");
    activeActions = document.getElementById("ride-voice-call-actions-active");
    acceptBtn = document.getElementById("ride-voice-call-accept");
    rejectBtn = document.getElementById("ride-voice-call-reject");
    cancelBtn = document.getElementById("ride-voice-call-cancel");
    endBtn = document.getElementById("ride-voice-call-end");
    muteBtn = document.getElementById("ride-voice-call-mute");
    audioHost = document.getElementById("ride-voice-call-audio");

    if (acceptBtn) acceptBtn.addEventListener("click", acceptIncomingCall);
    if (rejectBtn) rejectBtn.addEventListener("click", rejectIncomingCall);
    if (cancelBtn) cancelBtn.addEventListener("click", endActiveCall);
    if (endBtn) endBtn.addEventListener("click", endActiveCall);
    if (muteBtn) muteBtn.addEventListener("click", toggleMute);

    if (callButton) {
      callButton.addEventListener("click", function (event) {
        event.preventDefault();
        startOutgoingCall();
      });
    }

    domBound = true;
    return true;
  }

  function resolveUserId(nextOptions) {
    var resolved = normalizeId(nextOptions.userId);
    if (resolved) return resolved;
    resolved = decodeJwtSub(nextOptions.authToken);
    if (resolved) return resolved;

    var realtimeEl = document.getElementById("driver-realtime-config");
    if (realtimeEl) {
      try {
        var realtime = JSON.parse(realtimeEl.textContent || "{}");
        resolved = normalizeId(realtime.userId);
        if (resolved) return resolved;
        resolved = decodeJwtSub(realtime.token);
        if (resolved) return resolved;
      } catch (err) {
        /* ignore */
      }
    }
    return "";
  }

  function init(nextOptions) {
    options = nextOptions || {};
    rideId = normalizeId(options.rideId);
    rideStatus = options.rideStatus || "";
    userId = resolveUserId(options);
    peerLabel = options.peerLabel || "";
    apiPost = options.apiPost;
    callButton =
      typeof options.callButton === "string"
        ? document.querySelector(options.callButton)
        : options.callButton || null;

    if (!rideId || typeof apiPost !== "function") return false;
    if (!bindDom()) return false;

    updateCallButton();
    return true;
  }

  function setRideStatus(status) {
    rideStatus = status || "";
    updateCallButton();
  }

  function setRideId(nextRideId) {
    rideId = normalizeId(nextRideId);
  }

  function setUserId(nextUserId) {
    userId = normalizeId(nextUserId);
  }

  function destroy() {
    resetUi();
    options = null;
    callButton = null;
  }

  global.RideVoiceCall = {
    init: init,
    destroy: destroy,
    setRideStatus: setRideStatus,
    setRideId: setRideId,
    setUserId: setUserId,
    handleEvent: handleRealtimeEvent,
    startOutgoingCall: startOutgoingCall,
    canPlaceCall: canPlaceCall,
    waitForLiveKit: waitForLiveKit,
    CALL_ALLOWED_STATUSES: CALL_ALLOWED_STATUSES.slice(),
  };
})(window);
